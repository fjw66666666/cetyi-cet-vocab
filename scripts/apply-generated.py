#!/usr/bin/env python3
"""把外部生成的词条内容合并进词库分片。

适用场景：内容不一定来自 enrich-wordbank.py 的 LLM 调用 —— 也可能是人工编写、
或由别的模型/工具生成。无论来源如何，都必须过同一套校验，保证入库质量一致。

校验与落盘规则完全复用 enrich-wordbank.py 的 validate()，所以词形匹配、
长度、中文翻译、助记长度等标准与在线补全链路严格一致。

幂等：已有 example 的词条一律跳过，绝不覆盖既有内容。

用法：
    python scripts/apply-generated.py <生成的 json 文件> [更多文件...]

生成文件格式（JSON 数组）：
    [{"word": "battery", "example_en": "...", "example_zh": "...", "mnemonic": "..."}]
"""

import importlib.util
import json
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
CONTENT_KEYS = ("example", "mnemonic", "collocations", "derivatives", "confusables")

# enrich-wordbank.py 文件名带连字符，无法直接 import，用 spec 动态加载。
_spec = importlib.util.spec_from_file_location(
    "enrich_wordbank", ROOT / "scripts" / "enrich-wordbank.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
validate = _mod.validate


def load_shards() -> dict[str, list[dict]]:
    return {
        p.name: json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(DATA.glob("cet[46]-*.json"))
    }


def dump_shard(name: str, entries: list[dict]) -> str:
    """按项目既有字段顺序序列化（内容字段紧随 meanings 之后）。"""
    out = []
    for e in entries:
        if any(k in e for k in CONTENT_KEYS):
            ordered = {}
            for k, v in e.items():
                ordered[k] = v
                if k == "meanings":
                    for ck in CONTENT_KEYS:
                        if ck in e and ck not in ordered:
                            ordered[ck] = e[ck]
            for ck in CONTENT_KEYS:
                if ck in e and ck not in ordered:
                    ordered[ck] = e[ck]
            out.append(ordered)
        else:
            out.append(e)
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2

    # 汇总所有生成文件里的条目（后出现的同名条目不覆盖先出现的）
    items: dict[str, dict] = {}
    dup = 0
    for path_str in argv:
        path = pathlib.Path(path_str)
        if not path.exists():
            print(f"  跳过（不存在）: {path}")
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            print(f"  跳过（不是数组）: {path}")
            continue
        for it in raw:
            if not isinstance(it, dict):
                continue
            w = (it.get("word") or "").strip().lower()
            if not w:
                continue
            if w in items:
                dup += 1
                continue
            items[w] = it
        print(f"  读入 {path.name}: {len(raw)} 条")

    print(f"\n合计待处理 {len(items)} 个词（重复丢弃 {dup} 条）")

    shards = load_shards()
    # 同一个词可能同时存在于 CET4 与 CET6 的分片里（两本书有 1800+ 同名词），
    # 所以一个 id 要记录**全部**位置，否则只填到第一处、另一本仍然空缺。
    index: dict[str, list[tuple[str, int]]] = {}
    for name, entries in shards.items():
        for i, e in enumerate(entries):
            index.setdefault(e["id"], []).append((name, i))

    modified: set[str] = set()
    filled = entries_written = skipped_have = not_found = 0
    rejects: list[tuple[str, list[str]]] = []

    for w, it in items.items():
        hits = index.get(w)
        if not hits:
            not_found += 1
            continue
        en = (it.get("example_en") or "").strip()
        zh = (it.get("example_zh") or "").strip()
        m = (it.get("mnemonic") or "").strip()
        wrote = already = 0
        last_reasons: list[str] = []
        for name, i in hits:
            e = shards[name][i]
            if e.get("example"):
                already += 1            # 幂等：已有内容不动
                continue
            reasons = validate(e, it)
            if reasons:
                last_reasons = reasons
                continue
            e["example"] = {"en": en, "zh": zh}
            if m:
                e["mnemonic"] = m
            modified.add(name)
            wrote += 1
        if wrote:
            filled += 1
            entries_written += wrote
        elif already:
            skipped_have += 1
        elif last_reasons:
            rejects.append((w, last_reasons))

    for name in sorted(modified):
        (DATA / name).write_text(dump_shard(name, shards[name]), encoding="utf-8")

    print(f"\n=== 结果 ===")
    print(f"  写入成功的词: {filled}（实际填充分片条目 {entries_written} 处）")
    print(f"  已有内容跳过: {skipped_have}")
    print(f"  词库中不存在: {not_found}")
    print(f"  校验未通过  : {len(rejects)}")
    print(f"  落盘分片    : {len(modified)} 个")

    if rejects:
        print("\n=== 被拒明细（前 30 条） ===")
        for w, reasons in rejects[:30]:
            print(f"  {w:<16} {' | '.join(reasons)[:110]}")
        # 同时追加到 rejects 日志，便于后续复跑
        log = ROOT / "scripts" / ".enrich-rejects.jsonl"
        with log.open("a", encoding="utf-8") as f:
            for w, reasons in rejects:
                f.write(json.dumps({"id": w, "reason": "apply-generated: " + "; ".join(reasons)},
                                   ensure_ascii=False) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
