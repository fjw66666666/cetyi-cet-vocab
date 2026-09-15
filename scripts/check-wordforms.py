#!/usr/bin/env python3
"""词形匹配与 JSON 抢救解析的回归断言。

背景：enrich-wordbank.py 原先只支持「原词 + 后缀」一种词形，导致 embracing、
batteries、gripped、found 这类正常变形被判为「例句不含该词」，把合格例句整批
误杀（.enrich-rejects.jsonl 里留下 20+ 条）。同时整批 JSON 只要有一处坏字符，
60 个词一起报废。

本脚本锁住这两处修复的行为，防止以后改回去。

运行：python scripts/check-wordforms.py      （退出码 0 = 全部通过）
"""

import importlib.util
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent

# enrich-wordbank.py 文件名带连字符，无法直接 import，用 spec 动态加载。
# 该脚本末尾有 `if __name__ == "__main__"` 保护，exec_module 不会触发 main()。
_spec = importlib.util.spec_from_file_location(
    "enrich_wordbank", ROOT / "scripts" / "enrich-wordbank.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
variant_re = _mod.variant_re
parse_json_array = _mod.parse_json_array

# (单词, 例句, 是否应匹配) —— 全部来自 .enrich-rejects.jsonl 的真实误杀案例
CASES: list[tuple[str, str, bool]] = [
    ("embrace", "More young people are embracing new technologies.", True),
    ("occupy", "The library occupies the whole third floor of the building.", True),
    ("overcome", "With teamwork, they overcame every difficulty in the project.", True),
    ("withdraw", "He withdrew some cash before the holiday trip.", True),
    ("battery", "The remote stopped working because the batteries were dead.", True),
    ("cherry", "The tree was full of red cherries in June.", True),
    ("creep", "The cat crept quietly toward the bird.", True),
    ("grip", "The child gripped his mother's hand tightly.", True),
    ("rebel", "The soldiers rebelled against their officers and fled.", True),
    ("replace", "Robots are replacing workers in many modern factories.", True),
    ("pat", "She patted the little dog on its soft head.", True),
    ("admit", "He finally admitted that he had made a serious mistake.", True),
    ("authority", "The local authorities decided to build a new bridge.", True),
    ("carry", "The worker carried heavy boxes onto the truck.", True),
    ("be", "The weather in spring is warm and pleasant.", True),
    ("beg", "The homeless man begged for food and money on the street.", True),
    ("blow", "The wind blew strongly and many leaves fell.", True),
    ("board", "Please write your name on the blackboard.", True),
    ("bury", "They buried the old dog under the big tree.", True),
    ("deny", "He denied taking the money when the police questioned him.", True),
    ("dig", "The children dug a hole on the beach to find shells.", True),
    ("cry", "The baby cried loudly because he was hungry.", True),
    ("drag", "They dragged the heavy box across the wet floor.", True),
    ("drink", "He drank a glass of water after the long run.", True),
    ("drop", "He dropped his phone and quickly picked it up.", True),
    ("enemy", "The two teams were strong enemies in the final.", True),
    ("fight", "The soldiers fought bravely to protect their country.", True),
    ("find", "Scientists have found a new way to treat this disease.", True),
    ("grab", "The thief grabbed the woman's bag and ran away quickly.", True),
    ("hide", "The child hid behind the door.", True),
    ("make", "She made a cake for her mother's birthday.", True),
    ("marry", "He married his college classmate in 2020.", True),
    ("mate", "He went to the movies with his classmate.", True),
    ("memory", "The photo brings back many happy memories.", True),
    # 短词不放宽到子串：beeswax 不是 wax 的词形，应当继续拒绝
    ("wax", "She lit a candle made of beeswax.", False),
    # 基本回归：原词与最简后缀必须仍然匹配
    ("abandon", "They had to abandon the plan.", True),
    ("work", "She works hard every day.", True),
    ("work", "He worked late last night.", True),
    ("work", "They are working on a new project.", True),
]

# JSON 解析：整批/截断/代码块包裹
JSON_CASES: list[tuple[str, str, int]] = [
    ("完整数组", '[{"word":"a"},{"word":"b"}]', 2),
    ("代码块包裹", '```json\n[{"word":"a"},{"word":"b"}]\n```', 2),
    (
        "输出被截断（第 3 个对象残缺）",
        '[{"word":"a","example_en":"x"},{"word":"b","example_en":"y"},{"word":"c","exa',
        2,
    ),
    (
        "中间混入坏字符",
        '[{"word":"a"},{"word":"b"},oops{"word":"c"}]',
        3,
    ),
]


def main() -> int:
    failures: list[str] = []

    print("=== 1) 词形匹配 ===")
    for word, sentence, expect in CASES:
        got = bool(variant_re(word).search(sentence))
        ok = got == expect
        if not ok:
            failures.append(f"词形 {word}: 期望 {expect}，实得 {got} —— {sentence[:50]}")
        print(f"  {'OK ' if ok else 'FAIL'} {word:<10} {'匹配' if got else '不匹配':<5} {sentence[:52]}")

    print("\n=== 2) JSON 抢救解析 ===")
    for label, text, expect_n in JSON_CASES:
        try:
            got_n = len(parse_json_array(text))
        except ValueError as exc:
            got_n = -1
            print(f"  FAIL {label}: 抛异常 {exc}")
            failures.append(f"JSON {label}: 抛异常 {exc}")
            continue
        ok = got_n == expect_n
        if not ok:
            failures.append(f"JSON {label}: 期望 {expect_n} 条，实得 {got_n}")
        print(f"  {'OK ' if ok else 'FAIL'} {label:<28} 解析出 {got_n} 条（期望 {expect_n}）")

    print()
    if failures:
        print(f"FAILED: {len(failures)} 项")
        for f in failures:
            print("  -", f)
        return 1
    print("check-wordforms: all passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
