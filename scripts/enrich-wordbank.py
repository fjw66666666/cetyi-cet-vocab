#!/usr/bin/env python3
"""词库内容补全脚本（T1）：为 public/data/*.json 词条批量补齐 example / mnemonic。

实际采用的数据源：LLM API（OpenAI 兼容 chat/completions 协议）。
  - API key 从环境变量读取（依次尝试 LLM_API_KEY / OPENAI_API_KEY / KIMI_API_KEY），禁止硬编码
  - endpoint 从 LLM_BASE_URL / KIMI_BASE_URL 读取（缺省路径自动补 /v1/chat/completions）
  - 模型从 LLM_MODEL 读取，缺省 k2d6-agent
  （无 API key 时的兜底路径为 Tatoeba 英中句对 / ECDICT，见任务书 T1；本脚本实现 LLM 路径。）

补齐策略：
  - tier 0 / tier 1：补齐 example（en+zh）与 mnemonic（≤60 字）
  - tier 2：至少补齐 example
  - collocations / derivatives / confusables 为可选增强，不强求
  - 已有 example 的词条一律跳过，绝不覆盖（幂等）；跨词书重复词优先复用已有语料

CLI：
  --dry-run          只打印将要生成的条目，不写盘、不调用 API
  --limit N          只处理前 N 条候选
  --book CET4|CET6   只处理指定词书
  --tier 0,1,2       只处理指定 tier
  --resume           从 scripts/.enrich-progress.jsonl 断点续跑

进度与拒绝记录：
  scripts/.enrich-progress.jsonl   每批处理的词 id（断点续跑依据）
  scripts/.enrich-rejects.jsonl    单条校验失败 / 批次失败的词及原因
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
PROGRESS = ROOT / "scripts" / ".enrich-progress.jsonl"
REJECTS = ROOT / "scripts" / ".enrich-rejects.jsonl"

# 每批词数。原为 60：单批输出常在 12000 token 边界被截断，导致整批 JSON 解析失败。
BATCH_SIZE = 40
REQ_TIMEOUT = 280          # 单批请求超时（秒）
RETRIES = 3                # 单批失败重试次数
CONTENT_KEYS = ("example", "mnemonic", "collocations", "derivatives", "confusables")

CH_RE = re.compile(r"[一-鿿]")
VOWELS = "aeiou"

# 常见不规则变化（只收四六级高频，够用即可，不追求完备）
# 说明：原实现只支持「原词 + 后缀」，导致 embracing / batteries / gripped / found
# 这类正常变形被判为「例句不含该词」，把合格例句整批误杀。
IRREGULAR: dict[str, set[str]] = {
    "be": {"am", "is", "are", "was", "were", "been", "being"},
    "have": {"has", "had", "having"},
    "do": {"does", "did", "done", "doing"},
    "go": {"goes", "went", "gone", "going"},
    "make": {"made", "makes", "making"},
    "find": {"found", "finds", "finding"},
    "fight": {"fought", "fights", "fighting"},
    "dig": {"dug", "digs", "digging"},
    "hide": {"hid", "hidden", "hides", "hiding"},
    "drink": {"drank", "drunk", "drinks", "drinking"},
    "blow": {"blew", "blown", "blows", "blowing"},
    "creep": {"crept", "creeps", "creeping"},
    "withdraw": {"withdrew", "withdrawn", "withdraws", "withdrawing"},
    "overcome": {"overcame", "overcomes", "overcoming"},
    "begin": {"began", "begun", "begins", "beginning"},
    "break": {"broke", "broken", "breaks", "breaking"},
    "bring": {"brought", "brings", "bringing"},
    "build": {"built", "builds", "building"},
    "buy": {"bought", "buys", "buying"},
    "catch": {"caught", "catches", "catching"},
    "choose": {"chose", "chosen", "chooses", "choosing"},
    "come": {"came", "comes", "coming"},
    "cut": {"cut", "cuts", "cutting"},
    "deal": {"dealt", "deals", "dealing"},
    "draw": {"drew", "drawn", "draws", "drawing"},
    "drive": {"drove", "driven", "drives", "driving"},
    "eat": {"ate", "eaten", "eats", "eating"},
    "fall": {"fell", "fallen", "falls", "falling"},
    "feed": {"fed", "feeds", "feeding"},
    "fly": {"flew", "flown", "flies", "flying"},
    "forget": {"forgot", "forgotten", "forgets", "forgetting"},
    "forgive": {"forgave", "forgiven", "forgives", "forgiving"},
    "freeze": {"froze", "frozen", "freezes", "freezing"},
    "get": {"got", "gotten", "gets", "getting"},
    "give": {"gave", "given", "gives", "giving"},
    "grow": {"grew", "grown", "grows", "growing"},
    "hold": {"held", "holds", "holding"},
    "keep": {"kept", "keeps", "keeping"},
    "know": {"knew", "known", "knows", "knowing"},
    "lay": {"laid", "lays", "laying"},
    "lead": {"led", "leads", "leading"},
    "leave": {"left", "leaves", "leaving"},
    "lend": {"lent", "lends", "lending"},
    "lie": {"lay", "lain", "lies", "lying"},
    "lose": {"lost", "loses", "losing"},
    "mean": {"meant", "means", "meaning"},
    "meet": {"met", "meets", "meeting"},
    "pay": {"paid", "pays", "paying"},
    "put": {"puts", "putting"},
    "read": {"reads", "reading"},
    "ride": {"rode", "ridden", "rides", "riding"},
    "ring": {"rang", "rung", "rings", "ringing"},
    "rise": {"rose", "risen", "rises", "rising"},
    "run": {"ran", "runs", "running"},
    "say": {"said", "says", "saying"},
    "see": {"saw", "seen", "sees", "seeing"},
    "seek": {"sought", "seeks", "seeking"},
    "sell": {"sold", "sells", "selling"},
    "send": {"sent", "sends", "sending"},
    "set": {"sets", "setting"},
    "shake": {"shook", "shaken", "shakes", "shaking"},
    "shoot": {"shot", "shoots", "shooting"},
    "show": {"showed", "shown", "shows", "showing"},
    "shut": {"shuts", "shutting"},
    "sing": {"sang", "sung", "sings", "singing"},
    "sink": {"sank", "sunk", "sinks", "sinking"},
    "sit": {"sat", "sits", "sitting"},
    "sleep": {"slept", "sleeps", "sleeping"},
    "slide": {"slid", "slides", "sliding"},
    "speak": {"spoke", "spoken", "speaks", "speaking"},
    "spend": {"spent", "spends", "spending"},
    "stand": {"stood", "stands", "standing"},
    "steal": {"stole", "stolen", "steals", "stealing"},
    "stick": {"stuck", "sticks", "sticking"},
    "strike": {"struck", "strikes", "striking"},
    "swear": {"swore", "sworn", "swears", "swearing"},
    "sweep": {"swept", "sweeps", "sweeping"},
    "swim": {"swam", "swum", "swims", "swimming"},
    "take": {"took", "taken", "takes", "taking"},
    "teach": {"taught", "teaches", "teaching"},
    "tear": {"tore", "torn", "tears", "tearing"},
    "tell": {"told", "tells", "telling"},
    "think": {"thought", "thinks", "thinking"},
    "throw": {"threw", "thrown", "throws", "throwing"},
    "understand": {"understood", "understands", "understanding"},
    "wake": {"woke", "woken", "wakes", "waking"},
    "wear": {"wore", "worn", "wears", "wearing"},
    "win": {"won", "wins", "winning"},
    "wind": {"wound", "winds", "winding"},
    "write": {"wrote", "written", "writes", "writing"},
    "child": {"children"},
    "foot": {"feet"},
    "tooth": {"teeth"},
    "goose": {"geese"},
    "mouse": {"mice"},
    "man": {"men"},
    "woman": {"women"},
    "person": {"people"},
    "life": {"lives"},
    "knife": {"knives"},
    "wife": {"wives"},
    "leaf": {"leaves"},
    "half": {"halves"},
    "shelf": {"shelves"},
    "wolf": {"wolves"},
    "self": {"selves"},
    "thief": {"thieves"},
    "loaf": {"loaves"},
}


def inflections(word: str) -> set[str]:
    """生成该词的常见词形：原词 + 规则屈折 + 不规则表。

    覆盖四类规则变形，外加常见派生后缀：
      1. 直接加后缀            work -> works / worked / working
      2. 去 e 加后缀           embrace -> embracing / embraced
      3. 辅音 + y -> i + 后缀  battery -> batteries, marry -> married
      4. 单音节 CVC 双写末辅音  pat -> patted, grip -> gripped
    """
    w = word.lower()
    forms: set[str] = {w}
    if not w.isalpha():
        return forms

    forms |= IRREGULAR.get(w, set())

    # 1) 直接加后缀
    for suf in ("s", "es", "ed", "ing", "er", "est", "ly", "d"):
        forms.add(w + suf)

    # 2) 以 e 结尾：去 e 再加
    if w.endswith("e"):
        for suf in ("ing", "ed", "es", "er", "est", "d", "ion", "ment", "able"):
            forms.add(w[:-1] + suf)

    # 3) 辅音 + y -> i + 后缀（同时保留 y + ing，如 carrying）
    if len(w) > 2 and w.endswith("y") and w[-2] not in VOWELS:
        for suf in ("ies", "ied", "ier", "iest", "ily"):
            forms.add(w[:-1] + suf)
        forms.add(w + "ing")

    # 4) 单音节 CVC：双写末辅音（w/x/y 结尾不双写）
    if (
        len(w) >= 3
        and w[-1] not in VOWELS
        and w[-1] not in "wxy"
        and w[-2] in VOWELS
        and w[-3] not in VOWELS
    ):
        for suf in ("ing", "ed", "er", "est"):
            forms.add(w + w[-1] + suf)

    # 5) 常见派生后缀（名词化 / 形容词化）
    for suf in ("tion", "sion", "ment", "ness", "ful", "less", "able", "ible",
                "al", "ous", "ive", "ity", "ance", "ence"):
        forms.add(w + suf)
        if w.endswith("e"):
            forms.add(w[:-1] + suf)

    return {f for f in forms if f}


def api_config() -> tuple[str, str, str]:
    key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("KIMI_API_KEY")
    if not key:
        raise SystemExit("缺少 API key：请设置 LLM_API_KEY / OPENAI_API_KEY / KIMI_API_KEY 之一")
    base = (os.environ.get("LLM_BASE_URL") or os.environ.get("KIMI_BASE_URL") or "").rstrip("/")
    if not base:
        raise SystemExit("缺少 endpoint：请设置 LLM_BASE_URL / KIMI_BASE_URL")
    url = base + "/v1/chat/completions" if not base.endswith("/chat/completions") else base
    model = os.environ.get("LLM_MODEL", "k2d6-agent")
    return key, url, model


def load_shards() -> dict[str, list[dict]]:
    """读入全部分片（内存中就地修改，最后统一写盘）。"""
    shards: dict[str, list[dict]] = {}
    for path in sorted(DATA.glob("cet[46]-*.json")):
        shards[path.name] = json.loads(path.read_text(encoding="utf-8"))
    return shards


def book_of(shard: str) -> str:
    return "CET4" if shard.startswith("cet4") else "CET6"


def variant_re(word: str) -> re.Pattern:
    """匹配该词及其常见词形。

    长词（>=4 字母）额外允许出现在复合词内部 —— 否则 blackboard 里的 board、
    classmate 里的 mate 会被判为「例句不含该词」。短词不放宽，避免 category
    里的 cat 之类误判。
    """
    forms = sorted(inflections(word), key=len, reverse=True)
    alt = "|".join(re.escape(f) for f in forms)
    pattern = r"\b(?:" + alt + r")\b"
    if len(word) >= 4:
        pattern += "|" + re.escape(word)
    return re.compile(pattern, re.IGNORECASE)


def validate(entry: dict, item: dict) -> list[str]:
    """校验单条生成结果，返回拒绝原因列表（空 = 通过）。"""
    reasons = []
    word = entry["word"]
    en = (item.get("example_en") or "").strip()
    zh = (item.get("example_zh") or "").strip()
    if not en:
        reasons.append("example_en 为空")
    else:
        if not (6 <= len(en) <= 160):
            reasons.append(f"example_en 长度 {len(en)} 不在 6-160")
        if "\n" in en or "\r" in en:
            reasons.append("example_en 含换行")
        if en.lower().startswith('the word "') or en.lower().startswith("the word '"):
            reasons.append("example_en 为模板化伪例句")
        if not variant_re(word).search(en):
            reasons.append(f"example_en 未包含该词及其常见词形: {en[:60]}")
    if not zh:
        reasons.append("example_zh 为空")
    elif not CH_RE.search(zh):
        reasons.append("example_zh 不含中文字符")
    m = (item.get("mnemonic") or "").strip()
    if m:
        if len(m) > 60:
            reasons.append(f"mnemonic 长度 {len(m)} > 60")
        if m in entry.get("meanings", []):
            reasons.append("mnemonic 与释义完全重复")
    return reasons


def build_prompt(batch: list[dict]) -> str:
    lines = []
    for i, e in enumerate(batch, 1):
        pos = e.get("pos", "")
        meaning = e["meanings"][0] if e.get("meanings") else ""
        lines.append(f"{i}. {e['word']} {pos} {meaning}".rstrip())
    return (
        "为下列四六级单词生成学习内容，严格只输出 JSON 数组，不要输出任何其他文字。\n"
        '每个元素格式：{"word":"单词","example_en":"...","example_zh":"...","mnemonic":"..."}\n'
        "要求：\n"
        "- example_en：6-160 字符的英文例句，必须包含该词或其常见词形变化（-s/-ed/-ing/-ly 等），"
        "无生僻词，无换行，贴近四六级真题风格\n"
        "- example_zh：对应中文翻译，必须含中文字符\n"
        "- mnemonic：不超过 60 字符的中文词根词缀或联想助记，不得照抄释义；生不出的给空字符串\n"
        "单词列表（词性 + 主要释义）：\n" + "\n".join(lines)
    )


def call_api(key: str, url: str, model: str, prompt: str) -> str:
    body = {"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 12000}
    last_err = ""
    for attempt in range(RETRIES):
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=REQ_TIMEOUT) as resp:
                data = json.load(resp)
            content = (data["choices"][0]["message"].get("content") or "").strip()
            if not content:
                raise ValueError("API 返回空 content")
            return content
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError) as exc:
            last_err = str(exc)
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (400, 401, 403, 404):
                raise SystemExit(f"API 请求错误（不重试）：{exc.code} {exc.read()[:200]!r}")
            time.sleep(2 ** attempt * 2)  # 指数退避 2s / 4s / 8s
    raise RuntimeError(f"批次重试 {RETRIES} 次仍失败：{last_err}")


def parse_json_array(text: str) -> list[dict]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("["), text.rfind("]")
    if start < 0:
        raise ValueError("输出不含 JSON 数组")
    if end <= start:
        # 输出被 max_tokens 截断时不会有收尾的 ]。此时按文本末尾取 body，
        # 交给下面的逐对象抢救，至少能拿回截断前已完整的那几个词。
        end = len(text) - 1
    body = text[start : end + 1]
    try:
        items = json.loads(body)
        if isinstance(items, list):
            return [it for it in items if isinstance(it, dict)]
    except json.JSONDecodeError:
        # 整批解析失败（输出被截断或混入坏字符）时逐个抢救对象，
        # 一处坏字符不至于毁掉整批 40-60 个词。
        pass

    recovered: list[dict] = []
    decoder = json.JSONDecoder()
    i = body.find("{")
    while i != -1:
        try:
            obj, nxt = decoder.raw_decode(body, i)
            if isinstance(obj, dict):
                recovered.append(obj)
            i = body.find("{", max(nxt, i + 1))   # 成功：从对象末尾之后继续找
        except json.JSONDecodeError:
            i = body.find("{", i + 1)             # 失败：错开一位重试
    if not recovered:
        raise ValueError("输出不含可解析的 JSON 对象")
    return recovered


def main() -> int:
    ap = argparse.ArgumentParser(description="词库内容补全（example/mnemonic）")
    ap.add_argument("--dry-run", action="store_true", help="只打印候选，不写盘不调用 API")
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条候选")
    ap.add_argument("--book", choices=["CET4", "CET6"], help="只处理指定词书")
    ap.add_argument("--tier", default="0,1,2", help="只处理指定 tier，逗号分隔")
    ap.add_argument("--resume", action="store_true", help="断点续跑")
    ap.add_argument("--max-batches", type=int, default=0, help="本轮最多处理几个 LLM 批次（0=不限）")
    ap.add_argument("--workers", type=int, default=3, help="并行 API 批次线程数（默认 3）")
    args = ap.parse_args()
    tiers = {int(t) for t in args.tier.split(",") if t.strip()}

    shards = load_shards()

    # 1) 全库已有语料索引（跨词书复用，避免重复调用 API）
    have: dict[str, dict] = {}
    for entries in shards.values():
        for e in entries:
            cur: dict = {}
            if e.get("example"):
                cur["example"] = e["example"]
            if e.get("mnemonic"):
                cur["mnemonic"] = e["mnemonic"]
            if cur:
                prev = have.setdefault(e["id"], {})
                prev.update({k: v for k, v in cur.items() if k not in prev})

    # 2) 收集候选：无 example（或 tier≤1 且无 mnemonic）且命中 book/tier 过滤
    candidates: list[tuple[str, int]] = []  # (shard, idx)
    for name, entries in sorted(shards.items()):
        if args.book and book_of(name) != args.book:
            continue
        for i, e in enumerate(entries):
            if e["tier"] not in tiers:
                continue
            if e.get("example"):
                continue  # 幂等：已有 example 绝不处理
            candidates.append((name, i))

    # 3) 断点续跑：跳过已处理 id
    done_ids: set[str] = set()
    if args.resume and PROGRESS.exists():
        for line in PROGRESS.read_text(encoding="utf-8").splitlines():
            try:
                done_ids.update(json.loads(line).get("ids", []))
            except json.JSONDecodeError:
                continue
    candidates = [(n, i) for n, i in candidates if shards[n][i]["id"] not in done_ids]

    total = len(candidates)
    print(f"候选词条：{total}（已跳过已完成 {len(done_ids)}，过滤 book={args.book or '全部'} tier={sorted(tiers)}）")
    if args.limit:
        candidates = candidates[: args.limit]
        print(f"--limit {args.limit}：实际处理 {len(candidates)}")

    if args.dry_run:
        for n, i in candidates[: (args.limit or 20)]:
            e = shards[n][i]
            need_mn = e["tier"] <= 1 and not e.get("mnemonic")
            print(f"[{book_of(n)} tier{e['tier']}] {e['word']} {e.get('pos', '')} "
                  f"{(e['meanings'][0] if e.get('meanings') else '')[:30]}"
                  f"{' +mnemonic' if need_mn else ''}")
        print("dry-run：未写盘，未调用 API")
        return 0

    key, url, model = api_config()
    print(f"LLM：{url} model={model}")

    progress_fh = PROGRESS.open("a", encoding="utf-8")
    rejects_fh = REJECTS.open("a", encoding="utf-8")
    modified_shards: set[str] = set()

    def apply_item(shard: str, idx: int, item: dict, source: str) -> None:
        e = shards[shard][idx]
        changed = False
        if not e.get("example"):
            en = (item.get("example_en") or "").strip()
            zh = (item.get("example_zh") or "").strip()
            if en and zh:
                e["example"] = {"en": en, "zh": zh}
                changed = True
        if not e.get("mnemonic"):
            m = (item.get("mnemonic") or "").strip()
            if m:
                e["mnemonic"] = m
                changed = True
        if changed:
            modified_shards.add(shard)
            print(f"  ✓ [{source}] {e['word']}: example={'yes' if e.get('example') else 'no'} "
                  f"mnemonic={'yes' if e.get('mnemonic') else 'no'}")

    def write_shards() -> int:
        """把有变更的分片立即落盘（每批后调用，保证被杀时只损失在途批次）。"""
        if not modified_shards:
            return 0
        written = 0
        for name in sorted(modified_shards):
            entries = shards[name]
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
            (DATA / name).write_text(
                json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
            )
            written += 1
        modified_shards.clear()
        return written

    # 4) 先跨词书复用
    reused = 0
    remaining: list[tuple[str, int]] = []
    for n, i in candidates:
        e = shards[n][i]
        cur = have.get(e["id"])
        if cur and (cur.get("example") or cur.get("mnemonic")):
            apply_item(n, i, {
                "example_en": (cur.get("example") or {}).get("en", ""),
                "example_zh": (cur.get("example") or {}).get("zh", ""),
                "mnemonic": cur.get("mnemonic", ""),
            }, "reuse")
            # 回写复用后的语料，供后续词继续使用
            prev = have.setdefault(e["id"], {})
            if e.get("example"):
                prev["example"] = e["example"]
            if e.get("mnemonic"):
                prev["mnemonic"] = e["mnemonic"]
            reused += 1
        else:
            remaining.append((n, i))
    print(f"跨词书复用：{reused} 词")
    if reused:
        w = write_shards()
        print(f"复用结果已落盘：{w} 个分片")

    # 5) LLM 分批补全（多线程并行，写盘与文件追加加锁）
    import threading
    from concurrent.futures import ThreadPoolExecutor

    batches = [remaining[i : i + BATCH_SIZE] for i in range(0, len(remaining), BATCH_SIZE)]
    io_lock = threading.Lock()
    counter = {"done": 0, "failed": 0}

    def process_batch(bi: int, batch: list[tuple[str, int]]) -> None:
        entries = [shards[n][i] for n, i in batch]
        prompt = build_prompt(entries)
        try:
            raw = call_api(key, url, model, prompt)
            items = parse_json_array(raw)
        except (RuntimeError, ValueError) as exc:
            with io_lock:
                for n, i in batch:
                    e = shards[n][i]
                    rejects_fh.write(json.dumps({"id": e["id"], "reason": f"batch_api_error: {exc}"}, ensure_ascii=False) + "\n")
                    progress_fh.write(json.dumps({"ids": [e["id"]]}, ensure_ascii=False) + "\n")
                rejects_fh.flush(); progress_fh.flush()
            counter["failed"] += 1
            print(f"  ✗ 批次 {bi}/{len(batches)} 失败：{exc}（{len(batch)} 词记入 rejects）", flush=True)
            return
        by_word = {}
        for it in items:
            w = (it.get("word") or "").strip().lower()
            if w and w not in by_word:
                by_word[w] = it
        batch_ids = []
        for (n, i), e in zip(batch, entries):
            batch_ids.append(e["id"])
            item = by_word.get(e["id"])
            with io_lock:
                if item is None:
                    rejects_fh.write(json.dumps({"id": e["id"], "reason": "模型未返回该词"}, ensure_ascii=False) + "\n")
                    continue
                reasons = validate(e, item)
                if reasons:
                    for r in reasons:
                        rejects_fh.write(json.dumps({"id": e["id"], "reason": r}, ensure_ascii=False) + "\n")
                    continue
            apply_item(n, i, item, "llm")
            prev = have.setdefault(e["id"], {})
            if e.get("example"):
                prev["example"] = e["example"]
            if e.get("mnemonic"):
                prev["mnemonic"] = e["mnemonic"]
        with io_lock:
            progress_fh.write(json.dumps({"ids": batch_ids}, ensure_ascii=False) + "\n")
            rejects_fh.flush(); progress_fh.flush()
            w = write_shards()  # 每批立即落盘
        counter["done"] += 1
        print(f"批次 {bi}/{len(batches)} 完成（本批 {len(batch)} 词，落盘 {w} 分片）", flush=True)

    n_round = len(batches) if not args.max_batches else min(args.max_batches, len(batches))
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        list(pool.map(lambda t: process_batch(*t), [(bi, b) for bi, b in enumerate(batches[:n_round], 1)]))
    if n_round < len(batches):
        print(f"已达 --max-batches {args.max_batches}，本轮结束（剩余 {len(batches) - n_round} 批下次续跑）")

    progress_fh.close()
    rejects_fh.close()
    w = write_shards()
    if w:
        print(f"收尾落盘：{w} 个分片")
    print(f"本轮批次：成功 {counter['done']}，失败 {counter['failed']}")

    # 7) 覆盖率摘要
    for book in ["CET4", "CET6"]:
        stat = {0: [0, 0, 0], 1: [0, 0, 0], 2: [0, 0, 0]}  # tier -> [total, example, mnemonic]
        for name, entries in shards.items():
            if book_of(name) != book:
                continue
            for e in entries:
                s = stat[e["tier"]]
                s[0] += 1
                if e.get("example"):
                    s[1] += 1
                if e.get("mnemonic"):
                    s[2] += 1
        for t in (0, 1, 2):
            tot, ex, mn = stat[t]
            print(f"{book} tier{t}: total={tot} example={ex} ({ex * 100 // max(tot, 1)}%) mnemonic={mn} ({mn * 100 // max(tot, 1)}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
