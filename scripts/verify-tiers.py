#!/usr/bin/env python3
"""tier 分层资产断言：校验 public/data 的 tier 0 质量（T2 验收）

断言（失败即非零退出）：
  1. index.json 的 count 保持 CET4=4545 / CET6=3998
  2. 每本书所有 tier 0 词均不在基础词表（scripts/source/basic-words.txt）中
  3. 每本书所有 tier 0 词均不在虚词黑名单中
  4. 每本书 tier 0 规模在 800–1000 之间
  5. 抽样打印 CET4 tier 0 前 60 词（人工核对：考试核心词、无 a/about/and）
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
SRC = ROOT / "scripts" / "source"

FUNCTION_WORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for",
    "with", "from", "as", "is", "am", "are", "was", "were", "be", "been", "do", "does", "did",
    "have", "has", "had", "will", "would", "can", "could", "shall", "should", "may", "might",
    "must", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "my", "your", "his", "her", "its", "our", "their", "not", "no", "yes", "so", "very",
    "too", "also",
}

EXPECTED_COUNT = {"CET4": 4545, "CET6": 3998}


def main() -> int:
    basic = {w.strip().lower() for w in (SRC / "basic-words.txt").read_text(encoding="utf-8").splitlines() if w.strip()}
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    failures: list[str] = []

    for book, expected in EXPECTED_COUNT.items():
        shards = index["books"][book]["shards"]
        count = index["books"][book]["count"]
        if count != expected:
            failures.append(f"{book}: index count={count}，预期 {expected}")

        entries: list[dict] = []
        for name in shards:
            entries.extend(json.loads((DATA / name).read_text(encoding="utf-8")))

        t0 = [e["word"] for e in entries if e.get("tier") == 0]
        if not (800 <= len(t0) <= 1000):
            failures.append(f"{book}: tier0 规模 {len(t0)}，预期 800–1000")

        bad_basic = sorted(w for w in t0 if w in basic)
        if bad_basic:
            failures.append(f"{book}: tier0 ∩ 基础词 ≠ ∅：{bad_basic[:20]}")
        bad_func = sorted(w for w in t0 if w in FUNCTION_WORDS)
        if bad_func:
            failures.append(f"{book}: tier0 ∩ 虚词黑名单 ≠ ∅：{bad_func}")

        print(f"{book}: total={len(entries)} tier0={len(t0)} "
              f"(基础词冲突 {len(bad_basic)}，虚词冲突 {len(bad_func)})")

    # 抽样：CET4 tier 0 前 60 词
    cet4 = []
    for name in index["books"]["CET4"]["shards"]:
        cet4.extend(json.loads((DATA / name).read_text(encoding="utf-8")))
    cet4_t0 = sorted((e["word"] for e in cet4 if e.get("tier") == 0))[:60]
    print("\nCET4 tier0 前 60 词（字母序）：")
    print(" ".join(cet4_t0))

    if failures:
        print("\n断言失败：")
        for f in failures:
            print(" -", f)
        return 1
    print("\n全部断言通过 ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
