#!/usr/bin/env python3
"""词库质量校验（T1）：输出覆盖率统计表 + 全库断言（失败退出码非 0）。

用法：
  python scripts/verify-wordbank.py                # 全部词书
  python scripts/verify-wordbank.py --book CET4    # 指定词书
  python scripts/verify-wordbank.py --tier 0,1     # 只统计指定 tier

断言：
  1. 每个词条 id === word.toLowerCase()
  2. 同一分片内 id 唯一
  3. example 若存在则 en 与 zh 均非空
  4. index.json 的 count 与实际词条数一致（CET4=4545 / CET6=3998）
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
CH_RE = re.compile(r"[一-鿿]")
EXPECTED_COUNT = {"CET4": 4545, "CET6": 3998}


def book_of(shard: str) -> str:
    return "CET4" if shard.startswith("cet4") else "CET6"


def main() -> int:
    ap = argparse.ArgumentParser(description="词库覆盖率与质量断言")
    ap.add_argument("--book", choices=["CET4", "CET6"], help="只统计指定词书")
    ap.add_argument("--tier", default="0,1,2", help="只统计指定 tier，逗号分隔")
    args = ap.parse_args()
    tiers = {int(t) for t in args.tier.split(",") if t.strip()}

    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    failures: list[str] = []

    # 覆盖率统计表
    header = f"{'book':<6}{'shard':<12}{'tier':<5}{'total':>7}{'example':>9}{'cov%':>7}{'mnemonic':>10}{'cov%':>7}{'colloc':>8}"
    print(header)
    print("-" * len(header))
    totals: dict[tuple[str, int], list[int]] = {}

    shard_names = []
    for book in ["CET4", "CET6"]:
        if args.book and book != args.book:
            continue
        shard_names.extend(index["books"][book]["shards"])

    for name in shard_names:
        entries = json.loads((DATA / name).read_text(encoding="utf-8"))
        book = book_of(name)
        seen: set[str] = set()
        per_tier: dict[int, list[int]] = {t: [0, 0, 0, 0] for t in (0, 1, 2)}
        for e in entries:
            wid = e.get("id", "")
            if wid != e.get("word", "").lower():
                failures.append(f"{name}: id !== word.toLowerCase()：{wid}")
            if wid in seen:
                failures.append(f"{name}: id 重复：{wid}")
            seen.add(wid)
            ex = e.get("example")
            if ex is not None and (not ex.get("en") or not ex.get("zh")):
                failures.append(f"{name}: {wid} 的 example.en/zh 存在但为空")
            t = e.get("tier", 2)
            s = per_tier.setdefault(t, [0, 0, 0, 0])
            s[0] += 1
            if e.get("example"):
                s[1] += 1
            if e.get("mnemonic"):
                s[2] += 1
            if e.get("collocations"):
                s[3] += 1
        for t in sorted(per_tier):
            if t not in tiers:
                continue
            tot, ex, mn, co = per_tier[t]
            print(f"{book:<6}{name:<12}{t:<5}{tot:>7}{ex:>9}{ex * 100 // max(tot, 1):>6}%{mn:>10}{mn * 100 // max(tot, 1):>6}%{co:>8}")
            agg = totals.setdefault((book, t), [0, 0, 0, 0])
            for i in range(4):
                agg[i] += per_tier[t][i]

    print("-" * len(header))
    for (book, t), (tot, ex, mn, co) in sorted(totals.items()):
        print(f"{book} tier{t} 合计: total={tot} example={ex} ({ex * 100 // max(tot, 1)}%) "
              f"mnemonic={mn} ({mn * 100 // max(tot, 1)}%) collocations={co}")

    # index.json count 断言
    for book, expected in EXPECTED_COUNT.items():
        if args.book and book != args.book:
            continue
        actual = sum(v[0] for (b, _), v in totals.items() if b == book)
        if actual != expected:
            failures.append(f"{book}: index count={index['books'][book]['count']}，实际 {actual}，预期 {expected}")

    # example.zh 质量抽查断言：含中文字符
    for name in shard_names:
        for e in json.loads((DATA / name).read_text(encoding="utf-8")):
            ex = e.get("example")
            if ex and ex.get("zh") and not CH_RE.search(ex["zh"]):
                failures.append(f"{name}: {e['id']} 的 example.zh 不含中文字符")

    if failures:
        print(f"\n断言失败 {len(failures)} 条（前 20 条）：")
        for f in failures[:20]:
            print(" -", f)
        return 1
    print("\n全部断言通过 ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
