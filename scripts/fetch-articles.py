#!/usr/bin/env python3
"""英语文章拉取与机审管线（python3 标准库，无第三方依赖）

用法：
  python scripts/fetch-articles.py --seed       # 写入内置示例文章（无网络，首次建库用）
  python scripts/fetch-articles.py              # 从 VOA 慢速英语 RSS 拉取（GitHub Actions 每周运行）
  python scripts/fetch-articles.py --dry-run    # 仅机审校验 + 报告，不落盘
  python scripts/fetch-articles.py --rss URL    # 指定 RSS 地址（默认自动从首页发现 RSS 链接）

机审门槛（内容审核机制）：
  1. 正文纯文本清洗（去 HTML/脚本残留）
  2. 词数 150–500
  3. CET4 S/A 重点词覆盖率（出现次数占比）≥ 8%
  4. 按 slug 去重（对比现有 articles/index.json）
  5. 难度分档（句长 + 平均词长 → 0-100 难度分 → 1-5 档）
版权注意：仅教学用途摘录，保留原文链接与出处。
"""
import argparse
import html as htmlmod
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).parent.parent
DATA = ROOT / 'public' / 'data'
ARTICLES = DATA / 'articles'

HOT_FS = 78                # fs ≥ 78 即 S/A 档
MIN_WORDS, MAX_WORDS = 150, 500
MIN_COVERAGE = 8.0         # S/A 词出现占比 %
UA = {'User-Agent': 'Mozilla/5.0 (cetyi-cet-vocab article pipeline; educational use)'}
VOA_HOME = 'https://learningenglish.voanews.com/'

TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")

CATEGORY_RULES = [
    ('健康', 'health medical medicine disease diet sleep exercise doctor hospital body food mental'),
    ('科技', 'technology science computer software internet ai artificial robot data digital space energy engineering research'),
    ('教育', 'education school student teacher college university study learn classroom exam degree campus'),
    ('环境', 'environment climate weather pollution plastic forest ocean animal nature recycle green energy'),
    ('文化', 'culture art music film museum history tradition festival book writer story'),
    ('新闻', 'government president election economy police law court company market policy nation'),
]

# ---------------- 内置示例文章（种子库，source=内置示例；CI 拉取成功后会自然被真实内容充实） ----------------
SEED_ARTICLES = [
    {
        'title': 'How Students Build a Better Study Habit',
        'category': '教育',
        'paragraphs': [
            "Many students want to study well, but they do not know how to plan their time. A good study habit does not mean sitting at a desk for ten hours a day. It means using small blocks of time in a smart way. The first step is to make a simple plan every morning. Write down two or three important tasks for the day, and do the hardest one first.",
            "Experts say the brain remembers new information better when we review it soon after learning. So after class, spend ten minutes looking over your notes. Do not wait until the night before the exam. A short review each day works much better than one long study session.",
            "Another useful rule is to put the phone away. Research shows that even a phone on the desk can take away part of your attention. Try to study in a quiet place, and give yourself a short break every thirty minutes.",
            "Good study habits also need rest. Sleep is the time when the brain organizes what we learned during the day. Students who sleep well often remember more and feel less worried. Small changes like these can make a big difference over a whole term.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'Why Sleep Matters for Your Memory',
        'category': '健康',
        'paragraphs': [
            "Most people know that sleep is important for the body, but few understand how much it helps the brain. During deep sleep, the brain moves new information from short-term memory into long-term memory. In other words, if you learn something today, you will remember it better after a good night of sleep.",
            "Scientists have found that students who sleep seven to nine hours a night usually do better on tests than those who sleep only five or six hours. Losing sleep does more than make you tired. It makes it harder to pay attention, to make decisions, and to control your feelings.",
            "There are simple ways to improve sleep. Try to go to bed at the same time every night, even on weekends. Keep the room dark and cool. Put away phones and computers at least thirty minutes before bed, because bright light tricks the brain into thinking it is still daytime.",
            "Some people think they can catch up on sleep by resting late on weekends. But doctors say this habit may hurt the body clock. A steady sleep schedule works better than a few long nights. The message is clear: good sleep is not wasted time. It is a key part of learning and health.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'Small Steps to Protect the Environment',
        'category': '环境',
        'paragraphs': [
            "Every year, the world produces millions of tons of plastic waste, and much of it ends up in rivers and oceans. Fish, birds, and other animals often mistake small pieces of plastic for food. Scientists say this problem is getting worse, but they also believe that small actions by ordinary people can help.",
            "One of the easiest changes is to carry a reusable bag when you go shopping. Many stores now charge money for plastic bags, so this simple habit saves both money and resources. Using a water bottle instead of buying bottled drinks is another good step.",
            "At home, we can save energy by turning off lights and unplugging machines that are not in use. Washing clothes in cold water also cuts energy use. And instead of throwing things away, try to repair them or give them to someone who needs them.",
            "Protecting the environment does not require a perfect life. If millions of people make one or two small changes, the total effect can be very large. The most important thing is to start today, and to help friends and family do the same.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'How AI Is Helping Doctors Work',
        'category': '科技',
        'paragraphs': [
            "Artificial intelligence is changing the way doctors work. In many hospitals, computer programs now help doctors read X-ray pictures and find early signs of disease. These systems can study thousands of images in minutes and point out problems that human eyes might miss.",
            "AI is also useful for organizing hospital information. Software can look at a patient's records, remind nurses about medicines, and suggest the best time for the next check. This gives doctors more time to talk with patients instead of spending hours on paper work.",
            "However, experts warn that AI is not a replacement for human judgment. A machine can make mistakes, and it does not understand a patient's feelings or personal history. The best results come when doctors use AI as a helper, not as a boss. Hospitals are now training workers to use these tools carefully.",
            "In many parts of the world, there are not enough doctors for the number of patients. AI may provide part of the solution, especially in small towns and country areas. But building fair systems takes time, money, and careful rules, so the technology must grow step by step.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'How the World Came to Love Tea',
        'category': '文化',
        'paragraphs': [
            "Tea is one of the oldest drinks in the world. The story begins in China thousands of years ago, and the plant later moved from East Asia to India, Europe, and America through trade. Today people drink more tea than any other beverage except water.",
            "Different places developed different tea cultures. In Britain, afternoon tea became a social event with cakes and conversation. In Japan, the tea ceremony is a quiet art that teaches patience and respect. In the Middle East, sweet tea is a sign of welcome to every visitor.",
            "Tea also played a real part in history. In the 1700s, heavy taxes on tea pushed American colonists to throw tea into the sea at Boston. The event became a symbol of the fight for independence and helped shape a new nation.",
            "Even today, tea connects people. Sharing a cup gives friends and strangers a chance to slow down and talk. That may explain why the simple leaf has kept its place in the world for so long.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'College Libraries Change with the Times',
        'category': '新闻',
        'paragraphs': [
            "Libraries on college campuses used to be silent places full of paper books. Today many of them look more like technology centers. Students still borrow books, but they also check out computers, cameras, and even rooms for making videos. The change follows the growth of digital study and online classes.",
            "Librarians say the goal of the library has not changed. It remains a public space where anyone can find information and a quiet corner to think. What changed is the form of that information. A student today may read a report on a screen, then borrow a paper book for deeper study.",
            "The redesign brings new challenges. Old buildings need new electric wires and better internet service. Money is always limited, so schools must choose between buying digital tools and keeping older paper collections complete.",
            "Students seem happy with the mix. Surveys show that busy and lively first floors attract group work, while upper floors stay quiet for serious reading. The library of the future, experts say, will be both a community center and a place of deep focus.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'Reading English Every Day Works',
        'category': '教育',
        'paragraphs': [
            "Many English learners ask the same question: what is the fastest way to grow vocabulary? Teachers often give a simple answer that surprises them: read a little every day. Fifteen minutes of daily reading may bring more progress than three hours of study once a week.",
            "When you meet a new word in a story, the meaning often becomes clear from the words around it. This is how children learn their first language, and it works for adult learners too. You may not remember every new word, but each time you see it again, the memory grows stronger.",
            "Choosing the right material matters. If a text is too hard, reading becomes slow and tiring. If it is too easy, you learn little. The best choice is a text where you understand most of the words, but still meet a few new ones on every page.",
            "Experts suggest keeping a small notebook of interesting words. After reading, write down three or four words that you want to remember, and review them later the same day. Over a year, three words a day add up to more than one thousand words. Little by little, daily reading turns new words into old friends.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
    {
        'title': 'The Ocean Plastic Problem and Simple Fixes',
        'category': '环境',
        'paragraphs': [
            "Deep in the ocean, large areas of floating plastic continue to grow. Scientists who study these places say that old fishing nets, bottles, and tiny plastic pieces now cover wide parts of the sea. The material breaks into smaller and smaller bits, but it almost never goes away.",
            "The danger reaches far beyond the ocean. Small fish eat the plastic, larger fish eat the small fish, and some of these fish later appear on dinner tables. Studies have found tiny pieces of plastic in drinking water and even in the air of big cities.",
            "Governments are beginning to act. A growing number of countries have banned free plastic bags, and some cities now tax single-use cups and boxes. Companies are also trying to design products that are easier to recycle, and scientists are testing new materials made from plants.",
            "Yet the fastest change still comes from daily choices. Refusing a straw, choosing glass instead of plastic, and picking up waste on a walk all seem small. But when millions of people repeat these actions, the amount of new plastic entering the ocean drops quickly. The problem is huge, but the tools to fight it are already in our hands.",
        ],
        'source': '内置示例',
        'sourceUrl': '',
    },
]

# ---------------- 基础工具 ----------------

def load_hot_vocab() -> set[str]:
    """从 CET4 词库分片读取 S/A 重点词集合（word 小写）。"""
    hot: set[str] = set()
    for f in sorted(DATA.glob('cet4-*.json')):
        for w in json.loads(f.read_text(encoding='utf-8')):
            if w.get('fs', 0) >= HOT_FS:
                hot.add(str(w['word']).lower())
    return hot


def strip_html(s: str) -> str:
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    return htmlmod.unescape(s)


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text) if len(t) > 1]


def split_sentences(text: str) -> list[str]:
    return [x.strip() for x in re.split(r'(?<=[.!?])\s+', text) if x.strip()]


def slugify(title: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:48] or 'article'


def classify(title: str, text: str, rss_category: str = '') -> str:
    """按 RSS 栏目或关键词分类到：教育/科技/健康/文化/环境/新闻/其他。"""
    sample = f'{rss_category} {title} {text[:400]}'.lower()
    for cat, keys in CATEGORY_RULES:
        if any(k in sample for k in keys.split()):
            return cat
    return '其他'


def difficulty_of(text: str) -> tuple[int, int]:
    """返回 (difficulty 0-100, level 1-5)：句长 + 平均词长近似 Flesch。"""
    toks = tokenize(text)
    sents = split_sentences(text)
    n = max(len(toks), 1)
    avg_sent = n / max(len(sents), 1)
    avg_len = sum(len(t) for t in toks) / n
    raw = (avg_sent - 8) / 1.8 + (avg_len - 3.5) * 12
    difficulty = max(0, min(100, round(raw * 4)))
    level = 1 if difficulty < 25 else 2 if difficulty < 45 else 3 if difficulty < 62 else 4 if difficulty < 78 else 5
    return difficulty, level


def audit_text(text: str, hot_vocab: set[str]) -> dict | None:
    """机审：返回 {words, coverage, difficulty, level, hotWords}，不通过返回 None。"""
    toks = tokenize(text)
    words = len(toks)
    if not (MIN_WORDS <= words <= MAX_WORDS):
        return None
    hot_hits = [t for t in toks if t in hot_vocab]
    coverage = len(hot_hits) / words * 100
    if coverage < MIN_COVERAGE:
        return None
    difficulty, level = difficulty_of(text)
    hot_words: list[str] = []
    for t in hot_hits:
        if t not in hot_words:
            hot_words.append(t)
    return {'words': words, 'coverage': round(coverage, 1), 'difficulty': difficulty,
            'level': level, 'hotWords': hot_words[:60]}


def summarize(text: str) -> str:
    sents = split_sentences(text)
    head = ' '.join(sents[:2])
    return head if len(head) <= 160 else head[:157].rstrip() + '…'


# ---------------- 仓库读写 ----------------

def load_existing() -> tuple[dict, list, set[str]]:
    """返回 (changelog_existing_meta:index文件或{}, 现有meta列表, 现有slug集)。"""
    idx_path = ARTICLES / 'index.json'
    if not idx_path.exists():
        return {}, [], set()
    idx = json.loads(idx_path.read_text(encoding='utf-8'))
    metas = idx.get('articles', [])
    return idx, metas, {m['slug'] for m in metas}


def write_outputs(new_metas: list[dict], new_articles: list[dict], fetched_date: str) -> None:
    """写 index.json / 各文章 / changelog.json。new_metas 与 new_articles 已按 slug 对齐。"""
    ARTICLES.mkdir(parents=True, exist_ok=True)
    idx, metas, _ = load_existing()
    by_slug = {m['slug']: m for m in metas}
    added, updated = [], []
    for meta, art in zip(new_metas, new_articles):
        existed = meta['slug'] in by_slug
        (added if not existed else updated).append(meta['slug'])
        with (ARTICLES / f"{meta['slug']}.json").open('w', encoding='utf-8') as fh:
            json.dump(art, fh, ensure_ascii=False, indent=2)
        by_slug[meta['slug']] = meta
    metas = sorted(by_slug.values(), key=lambda m: m['published_at'], reverse=True)
    with ARTICLES.joinpath('index.json').open('w', encoding='utf-8') as fh:
        json.dump({'updatedAt': fetched_date, 'articles': metas}, fh, ensure_ascii=False, indent=2)

    changelog: list[dict] = []
    cl_path = ARTICLES / 'changelog.json'
    if cl_path.exists():
        changelog = json.loads(cl_path.read_text(encoding='utf-8'))
    for slug in added + updated:
        meta = by_slug[slug]
        changelog.insert(0, {
            'date': fetched_date[:10],
            'action': 'added' if slug in added else 'updated',
            'title': meta['title'],
            'slug': slug,
        })
    with cl_path.open('w', encoding='utf-8') as fh:
        json.dump(changelog[:50], fh, ensure_ascii=False, indent=2)
    print(f'added={len(added)} updated={len(updated)} total={len(metas)}')


def make_article(raw: dict, hot_vocab: set[str], now_iso: str) -> dict | None:
    text = ' '.join(p.strip() for p in raw['paragraphs'] if p.strip())
    if raw.get('rss_description'):
        text = strip_html(raw['rss_description'])
        raw['paragraphs'] = [p.strip() for p in text.split('\n') if len(p.strip()) > 24][:8]
        text = ' '.join(raw['paragraphs'])
    audit = audit_text(text, hot_vocab)
    if not audit:
        return None
    meta = {
        'id': raw['slug'],
        'slug': raw['slug'],
        'title': raw['title'],
        'category': raw['category'],
        'level': audit['level'],
        'difficulty': audit['difficulty'],
        'hotCoverage': audit['coverage'],
        'wordCount': audit['words'],
        'source': raw['source'],
        'sourceUrl': raw.get('sourceUrl', ''),
        'published_at': raw.get('published_at', now_iso[:10]),
        'updated_at': now_iso[:10],
        'reviewed': 'ok',  # 机审通过；人工审核 = PR 合并环节
    }
    return {**meta, 'summary': summarize(text), 'paragraphs': raw['paragraphs'],
            'hotWords': audit['hotWords']}


# ---------------- RSS 拉取 ----------------

def fetch_rss(url: str):  # -> list[dict]
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    root = ET.fromstring(data)
    items = []
    chan_cat = ''
    for el in root.iter():
        if el.tag.lower().endswith('channel') and chan_cat == '':
            pass
    for item in root.iter():
        tag = item.tag.lower().split('}')[-1]
        if tag != 'item':
            continue
        entry = {}
        for child in item:
            ctag = child.tag.lower().split('}')[-1]
            if ctag in ('title', 'link', 'description', 'pubdate', 'category'):
                entry[ctag] = (child.text or '').strip()
        items.append(entry)
    return items


def discover_rss_url(home_url: str) -> str:
    """从首页发现 RSS 链接；失败回退常见路径。"""
    candidates = []
    try:
        req = urllib.request.Request(home_url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode('utf-8', 'ignore')
        candidates = re.findall(r'href="([^"]*(?:rss|feed)[^"]*)"', html, re.I)
    except Exception as e:
        print(f'[warn] 首页探测失败：{e}')
    unique = list(dict.fromkeys(candidates))
    if unique:
        u = unique[0]
        if u.startswith('/'):
            u = home_url.rstrip('/') + u
        print(f'[info] 发现 RSS：{u}')
        return u
    fallback = home_url.rstrip('/') + '/rss/'
    print(f'[warn] 未发现 RSS 链接，使用回退地址 {fallback}')
    return fallback


# ---------------- 主流程 ----------------

def main() -> int:
    ap = argparse.ArgumentParser(description='VOA 慢速英语文章拉取与机审管线')
    ap.add_argument('--seed', action='store_true', help='写入内置示例文章（无网络）')
    ap.add_argument('--dry-run', action='store_true', help='仅校验不写盘')
    ap.add_argument('--rss', default='', help='RSS 地址（默认从 VOA 首页发现）')
    args = ap.parse_args()

    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    hot = load_hot_vocab()
    print(f'[info] S/A 重点词表 {len(hot)} 词')

    raw_list: list[dict] = []
    if args.seed:
        raw_list = []
        for i, s in enumerate(SEED_ARTICLES):
            t = s['paragraphs'][0]
            raw_list.append({
                'title': s['title'], 'category': s['category'],
                'paragraphs': s['paragraphs'], 'source': s['source'],
                'sourceUrl': '', 'slug': slugify(s['title']) + (f'-{i + 1}' if slugify(s['title']) in [slugify(x['title']) for x in SEED_ARTICLES[:i]] else ''),
                'published_at': now_iso[:10],
            })
    else:
        rss_url = args.rss or discover_rss_url(VOA_HOME)
        print(f'[info] 拉取 RSS：{rss_url}')
        try:
            items = fetch_rss(rss_url)
        except Exception as e:
            print(f'[error] RSS 拉取失败：{e}')
            return 2
        print(f'[info] RSS 条目 {len(items)} 条')
        for it in items[:30]:
            title = it.get('title', '').strip()
            link = it.get('link', '').strip()
            if not title:
                continue
            raw_list.append({
                'title': title,
                'category': classify(title, it.get('description', ''), it.get('category', '')),
                'paragraphs': [],
                'rss_description': it.get('description', ''),
                'source': 'VOA Learning English',
                'sourceUrl': link,
                'slug': slugify(title),
                'published_at': (it.get('pubdate', '')[:16] or now_iso[:10]),
            })

    existing_idx, existing_metas, existing_slugs = load_existing()
    planned: list[tuple[dict, dict]] = []
    skipped: list[str] = []
    used_slugs: set[str] = set(existing_slugs)
    for raw in raw_list:
        slug = raw['slug']
        base = slug
        n = 2
        while slug in used_slugs:
            slug = f'{base}-{n}'
            n += 1
        raw['slug'] = slug
        article = make_article(raw, hot, now_iso)
        if not article:
            skipped.append(f"{raw['title'][:40]}（词数/覆盖率不达标）")
            continue
        used_slugs.add(slug)
        planned.append((article, article))

    print(f'[info] 通过机审 {len(planned)} 篇，跳过 {len(skipped)} 篇')
    for s in skipped:
        print('  [skip]', s)
    if args.dry_run:
        for meta, _ in planned:
            print(f"  [ok] {meta['slug']} L{meta['level']} 难度{meta['difficulty']} "
                  f"覆盖率{meta['hotCoverage']}% 词数{meta['wordCount']} {meta['category']}")
        levels = {a['level'] for a, _ in planned}
        if len(levels) < 3 and planned:
            print('[warn] 本批文章难度档不足 3 档（跨档多样性提示，不阻止收录）')
        return 0
    if not planned:
        print('[info] 无新文章，收工')
        return 0
    write_outputs([m for m, _ in planned], [a for _, a in planned], now_iso[:19] + 'Z')
    print('[done] 已写入 public/data/articles/')
    return 0


if __name__ == '__main__':
    sys.exit(main())