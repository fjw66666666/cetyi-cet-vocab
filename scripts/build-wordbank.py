#!/usr/bin/env python3
"""词库构建脚本：合成 CET-4 / CET-6 词库分片

数据源（放在 ../wordbank-src/）：
  cet4.txt / cet6.txt —— KyleBing/english-vocabulary 四六级大纲词表（word\tPOS 释义）
  en_UK.txt / en_US.txt —— open-dict-data/ipa-dict 英美 IPA 音标
  en_50k.txt —— hermitdave/FrequencyWords 词频排名（用于 tier 分层）

规则：
  - 保留手写精编词条（cet4-0.json / cet4-1.json / cet6-0.json），生成词条跳过这些 id
  - tier 0 真题高频 = 精编 tier0 + 词频排名最高的补充词（总量约 200）
  - tier 1 核心 = 词频 ≤ 3000；tier 2 大纲 = 其余
  - 只收单词（不含空格/撇号），跨词书重复由前端按拼写去重合并
输出：public/data/cetX-N.json 分片 + index.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "source"
DATA = ROOT / "public" / "data"
SHARD_SIZE = 600
FREQ_T0_RANK = 4000      # tier0 补充词池上限（取前 ~148 个凑满 200）
FREQ_T1_RANK = 3000      # 核心词词频阈值
TIER0_TARGET = 200       # 每本书 tier0 目标规模

POS_RE = re.compile(r"\s+(?=(?:vt|vi|adj|adv|abbr|aux|num|art|int|conj|prep|pron|det|n|v)\.\s)")


def load_ipa(path: Path) -> dict[str, str]:
    ipa: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) == 2 and parts[0].strip():
            word, pron = parts[0].strip().lower(), parts[1].strip()
            # 多个发音取第一个完整 /.../ 形式
            m = re.search(r"/[^/]+/", pron)
            if m:
                ipa.setdefault(word, m.group(0))
    return ipa


def load_freq(path: Path) -> dict[str, int]:
    rank: dict[str, int] = {}
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        parts = line.split(" ")
        if parts and parts[0]:
            rank[parts[0].strip().lower()] = i + 1
    return rank


def parse_book(path: Path) -> list[dict]:
    words: dict[str, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or "\t" not in line:
            continue
        word, trans = line.split("\t", 1)
        word = word.strip().lower()
        trans = trans.strip()
        if not word or not trans:
            continue
        if " " in word or "'" in word or not re.fullmatch(r"[a-z-]+", word):
            continue
        if not re.search(r"[一-鿿]", trans):
            continue
        # 拆分多词性段落
        segments = [s.strip() for s in POS_RE.split(trans) if s.strip()]
        meanings: list[str] = []
        first_pos = ""
        for seg in segments:
            m = re.match(r"(vt|vi|adj|adv|abbr|aux|num|art|int|conj|prep|pron|det|n|v)\.\s*(.*)", seg)
            if m:
                tag, text = m.group(1), m.group(2).strip().lstrip(". ").strip()
                if not first_pos:
                    first_pos = tag
                meanings.append(f"{tag}. {text}" if len(segments) > 1 else text)
            elif seg:
                meanings.append(seg)
        if not meanings:
            continue
        pos_display = (first_pos + ".") if first_pos else ""
        if word in words:
            # 同词多行：合并释义并去重
            exist = words[word]
            for m in meanings:
                if m not in exist["meanings"]:
                    exist["meanings"].append(m)
            exist["meanings"] = exist["meanings"][:6]
        else:
            words[word] = {"word": word, "pos": pos_display, "meanings": meanings[:4]}
    return list(words.values())


def main() -> None:
    uk = load_ipa(SRC / "en_UK.txt")
    us = load_ipa(SRC / "en_US.txt")
    freq = load_freq(SRC / "en_50k.txt")

    # 已精编的词条 id（跳过，避免重复）
    curated: dict[str, dict[str, list[str]]] = {}
    for book, files in {"CET4": ["cet4-0.json", "cet4-1.json"], "CET6": ["cet6-0.json"]}.items():
        ids: list[str] = []
        t0: list[str] = []
        for f in files:
            for e in json.loads((DATA / f).read_text(encoding="utf-8")):
                ids.append(e["id"])
                if e.get("tier") == 0:
                    t0.append(e["id"])
        curated[book] = {"ids": ids, "t0": t0}

    index_books: dict[str, dict] = {}
    for book, src_file, start_idx in [("CET4", "cet4.txt", 2), ("CET6", "cet6.txt", 1)]:
        parsed = parse_book(SRC / src_file)
        skip = set(curated[book]["ids"])
        entries = [w for w in parsed if w["word"] not in skip]

        # tier 分层
        t0_extra_pool = sorted(
            (w for w in entries if freq.get(w["word"], 99999) <= FREQ_T0_RANK),
            key=lambda w: freq[w["word"]],
        )
        need = max(0, TIER0_TARGET - len(curated[book]["t0"]))
        t0_extra = {w["word"] for w in t0_extra_pool[:need]}

        for w in entries:
            rank = freq.get(w["word"], 99999)
            w["tier"] = 0 if w["word"] in t0_extra else (1 if rank <= FREQ_T1_RANK else 2)
            if w["word"] in uk:
                w["uk"] = uk[w["word"]]
            if w["word"] in us:
                w["us"] = us[w["word"]]

        entries.sort(key=lambda w: (w["tier"], w["word"]))
        shards: list[str] = []
        for i in range(0, len(entries), SHARD_SIZE):
            name = f"{book.lower()}-{start_idx + len(shards)}.json"
            chunk = entries[i : i + SHARD_SIZE]
            out = [
                {
                    "id": w["word"], "word": w["word"], "tier": w["tier"],
                    **({"uk": w["uk"]} if "uk" in w else {}),
                    **({"us": w["us"]} if "us" in w else {}),
                    **({"pos": w["pos"]} if w["pos"] else {}),
                    "meanings": w["meanings"],
                }
                for w in chunk
            ]
            (DATA / name).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            shards.append(name)

        base_files = ["cet4-0.json", "cet4-1.json"] if book == "CET4" else ["cet6-0.json"]
        base_count = len(curated[book]["ids"])
        index_books[book] = {"shards": base_files + shards, "count": base_count + len(entries)}
        tiers = {}
        for w in entries:
            tiers[w["tier"]] = tiers.get(w["tier"], 0) + 1
        print(f"{book}: curated={base_count} generated={len(entries)} tiers={tiers} total={index_books[book]['count']}")

    (DATA / "index.json").write_text(
        json.dumps({"books": index_books}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("index.json updated")


if __name__ == "__main__":
    main()
