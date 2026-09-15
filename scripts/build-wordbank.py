#!/usr/bin/env python3
"""词库构建脚本：合成 CET-4 / CET-6 词库分片

数据源（放在 scripts/source/）：
  cet4.txt / cet6.txt —— KyleBing/english-vocabulary 四六级大纲词表（word\tPOS 释义）
  en_UK.txt / en_US.txt —— open-dict-data/ipa-dict 英美 IPA 音标
  en_50k.txt —— hermitdave/FrequencyWords 词频排名（用于 tier 分层）
  basic-words.txt —— 基础词排除表（初中/中考已掌握词，1418 词）

tier 语义（与 src/lib/types.ts 注释保持一致）：
  tier 0 = 四六级真题高频词（用户最该先学），目标规模 TIER0_TARGET=900/书
  tier 1 = 大纲核心词（词频 ≤ FREQ_T1_RANK）
  tier 2 = 大纲长尾词（其余）

基础词排除表说明（数据源与取舍）：
  - 首选 ECDICT（skywind3000/ECDICT）的 tag 字段（zk/gk 视为基础词），本环境未能取得该数据；
  - 兜底 A（COCA/CEFR A1–B1）经实测不可取：Words-CEFR-Dataset 将 abandon/achieve/challenge
    等四六级核心词标为 A2/B1，若整表剔除会让 tier 0 失去考试核心词，违背 tier 0 语义；
  - 最终采用兜底 B（scripts/source/basic-words.txt）+ 通用高频词频硬阈值：
      basic = 知米「中考(初中)词汇」(1418 词) ∪ 手工补充常见基础词 ∪ 虚词黑名单
              ∪ { en_50k 词频排名 ≤ FREQ_BASIC_RANK(3000) 的词 }
    理由：四六级考生已实际掌握通用英语最高频约 3000 词（≈初高中大纲的真实覆盖），
    实测该阈值干净分离两类词：better/bomb/however/data/billion 等被排除，
    abandon(3968)/achieve(4146)/significant(4876)/absorb 等考试核心词恰好保留。
    高中表与四六级核心词重叠（含 abandon/adequate/advocate 等），故不采用。
  - 文件缺失时明确报错，不静默降级。

分层规则：
  - 保留手写精编词条（cet4-0.json / cet4-1.json / cet6-0.json），生成词条跳过这些 id
  - tier 0 排序键 rank_key(word)：当前生效路径为 en_50k 通用语料词频排名（兜底路径）。
    若日后取得四六级真题词频语料或 ECDICT frq/bnc 排名，优先替换 rank_key 的实现。
  - 硬性虚词黑名单 FUNCTION_WORDS 作为最后一道防线，与基础词表一起从 tier 0 剔除
  - 结束后断言：tier0 ∩ 基础词 = ∅ 且 tier0 ∩ 虚词黑名单 = ∅，失败即抛异常

规则细节：
  - 只收单词（不含空格/撇号），跨词书重复由前端按拼写去重合并
  - fs（热频分）由 scripts/add-frequency-score.py 依据 tier 重算，本脚本不处理
输出：public/data/cetX-N.json 分片 + index.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "source"
DATA = ROOT / "public" / "data"
SHARD_SIZE = 600
FREQ_T0_RANK = 4000      # tier0 首选词池的词频上限（不足时按排名顺延补足，软约束）
FREQ_T1_RANK = 3000      # 核心词词频阈值
FREQ_BASIC_RANK = 3000   # 通用高频硬阈值：排名 ≤3000 视为已掌握基础词，不得进入 tier0
TIER0_TARGET = 900       # 每本书 tier0 目标规模

# 硬性虚词黑名单：这些词一律不得进入 tier 0（最后一道防线）
FUNCTION_WORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for",
    "with", "from", "as", "is", "am", "are", "was", "were", "be", "been", "do", "does", "did",
    "have", "has", "had", "will", "would", "can", "could", "shall", "should", "may", "might",
    "must", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "my", "your", "his", "her", "its", "our", "their", "not", "no", "yes", "so", "very",
    "too", "also",
}

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


def load_basic_words() -> set[str]:
    """基础词排除表：scripts/source/basic-words.txt（每行一个词，初中/中考已掌握词）。

    数据源：知米背单词「中考(初中)词汇乱序版」，经 GitHub 仓库
    ALILIYES/English-word-dataset-and-reptile（初高中词汇/ChuZhongluan_2.json）获取。
    选择初中表而非高中表的原因见脚本头注释（高中表与四六级核心词重叠，剔除会伤害 tier 0）。
    文件缺失或词数过少时明确报错，不静默降级。
    """
    path = SRC / "basic-words.txt"
    if not path.exists():
        raise SystemExit(
            "缺少基础词表：scripts/source/basic-words.txt\n"
            "  来源：知米背单词中考(初中)词汇，经 ALILIYES/English-word-dataset-and-reptile 获取，"
            "每行一个词，至少 1500 个"
        )
    basic = {w.strip().lower() for w in path.read_text(encoding="utf-8").splitlines() if w.strip()}
    if len(basic) < 1500:
        raise SystemExit(f"基础词表异常：仅 {len(basic)} 词（预期 ≥1500），请检查 basic-words.txt")
    return basic


def rank_key(word: str, freq: dict[str, int]) -> int:
    """tier 0 排序键：考试相关性的代理指标，越小越该先学。

    当前生效路径（兜底）：hermitdave/FrequencyWords 通用英语语料词频排名（en_50k.txt）。
    若日后获得四六级真题词频语料，或 ECDICT 的 frq/bnc 排名 / collins / oxford 星级，
    应优先于本路径接入（保持函数签名不变）。
    无词频记录的词返回 99999（最靠后）。
    """
    return freq.get(word, 99999)


def main() -> None:
    uk = load_ipa(SRC / "en_UK.txt")
    us = load_ipa(SRC / "en_US.txt")
    freq = load_freq(SRC / "en_50k.txt")
    basic = load_basic_words()
    print(f"基础词表（初高中已掌握词）：{len(basic)} 词")

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

        # tier 分层：tier 0 = 考试高频（精编 t0 + 按 rank_key 排序的补充词），剔除基础词与虚词
        def eligible(w: dict) -> bool:
            word = w["word"]
            return (
                word not in basic
                and word not in FUNCTION_WORDS
                and rank_key(word, freq) > FREQ_BASIC_RANK  # 通用高频词视为已掌握
            )

        curated_t0 = [
            w for w in curated[book]["t0"]
            if w not in basic and w not in FUNCTION_WORDS and rank_key(w, freq) > FREQ_BASIC_RANK
        ]
        bumped_curated = [
            w for w in curated[book]["t0"]
            if w in basic or w in FUNCTION_WORDS or rank_key(w, freq) <= FREQ_BASIC_RANK
        ]
        if bumped_curated:
            print(f"{book}: 精编 tier0 中 {len(bumped_curated)} 词命中基础词/虚词黑名单，移出 tier0: {bumped_curated}")
        need = max(0, TIER0_TARGET - len(curated_t0))
        # 首选池：词频 ≤ FREQ_T0_RANK；不足时按 rank_key 顺延补足（软约束）
        pool_preferred = sorted(
            (w for w in entries if eligible(w) and rank_key(w["word"], freq) <= FREQ_T0_RANK),
            key=lambda w: rank_key(w["word"], freq),
        )
        pool_rest = sorted(
            (w for w in entries if eligible(w) and rank_key(w["word"], freq) > FREQ_T0_RANK),
            key=lambda w: rank_key(w["word"], freq),
        )
        t0_extra = {w["word"] for w in (pool_preferred + pool_rest)[:need]}
        final_t0 = set(curated_t0) | t0_extra

        # 硬性断言：tier0 ∩ 基础词 = ∅，tier0 ∩ 虚词黑名单 = ∅
        bad_basic = sorted(w for w in final_t0 if w in basic)
        bad_func = sorted(w for w in final_t0 if w in FUNCTION_WORDS)
        if bad_basic or bad_func:
            raise SystemExit(f"{book}: tier0 断言失败 basic={bad_basic} function={bad_func}")

        for w in entries:
            rank = rank_key(w["word"], freq)
            w["tier"] = 0 if w["word"] in t0_extra else (1 if rank <= FREQ_T1_RANK else 2)
            if w["word"] in uk:
                w["uk"] = uk[w["word"]]
            if w["word"] in us:
                w["us"] = us[w["word"]]

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
        tiers: dict[int, int] = {}
        for w in entries:
            tiers[w["tier"]] = tiers.get(w["tier"], 0) + 1
        for w in curated_t0:
            tiers[0] = tiers.get(0, 0) + 1
        for w in curated[book]["ids"]:
            if w not in curated_t0:
                t = 1 if rank_key(w, freq) <= FREQ_T1_RANK else 2
                tiers[t] = tiers.get(t, 0) + 1
        print(f"{book}: curated={base_count} generated={len(entries)} tiers={tiers} total={index_books[book]['count']}")

        # 精编分片中命中基础词/虚词黑名单的 tier0 词条：仅改 tier 字段（1 核心 / 2 长尾），就地重写
        if bumped_curated:
            rank_of_bumped = {w: rank_key(w, freq) for w in bumped_curated}
            for f in {"CET4": ["cet4-0.json", "cet4-1.json"], "CET6": ["cet6-0.json"]}[book]:
                path = DATA / f
                data = json.loads(path.read_text(encoding="utf-8"))
                changed = False
                for e in data:
                    if e["id"] in rank_of_bumped:
                        e["tier"] = 1 if rank_of_bumped[e["id"]] <= FREQ_T1_RANK else 2
                        changed = True
                if changed:
                    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                    print(f"  {f}: 已移出黑名单 tier0 词 {sorted(rank_of_bumped)}")

    (DATA / "index.json").write_text(
        json.dumps({"books": index_books}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("index.json updated")


if __name__ == "__main__":
    main()
