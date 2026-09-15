#!/usr/bin/env python3
"""原创高难度文章入库脚本（python3 标准库，无第三方依赖）

复用 scripts/fetch-articles.py 的全部机审管线（词数 150–500、S/A 词覆盖率 ≥ 8%、
按 slug 去重、难度分档），在其之上叠加本批次的目标门槛：
  1. 难度分必须在 68–90 区间
  2. level 必须为 4 或 5（高难度批次）
  3. slug 不得与现有文章冲突（保护既有 8 篇不被覆盖）

用法：
  python scripts/add-articles.py --dry-run   # 仅机审校验 + 报告，不落盘
  python scripts/add-articles.py             # 校验通过后写入 public/data/articles/

内容说明：NEW_ARTICLES 为原创英文文章（source=原创精选），仅教学用途。
"""
import argparse
import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent

# fetch-articles.py 文件名含连字符，无法常规 import，须动态加载
_spec = importlib.util.spec_from_file_location('fetch_articles', HERE / 'fetch-articles.py')
fa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fa)

# 本批次目标门槛（严于管线默认门槛）
TARGET_MIN_DIFFICULTY = 68
TARGET_MAX_DIFFICULTY = 90
TARGET_MIN_LEVEL = 4

# ---------------- 原创高难度文章（难度分目标 68–90，level 4–5 为主） ----------------
NEW_ARTICLES = [
    {
        'title': 'Why Universities Are Rethinking the Lecture',
        'category': '教育',
        'paragraphs': [
            "For more than a hundred years, the lecture has stood at the heart of college teaching. To question it once seemed almost a crime. Today, more and more schools ask whether an hour of talk truly produces learning. Studies that compare methods have returned hard answers. Students in lecture courses score lower than students taught by active methods. In those, they must explain and use ideas while the class is still in the room.",
            "The reasons are not hard to find. Attention fades after about fifteen minutes of listening. Even careful notes cannot make up for not thinking at all. A student who watches an expert solve a problem has practiced watching, not solving. When students must try the problem first, the struggle itself prepares the mind. Experts link that to deeper mental work.",
            "Defenders of the lecture raise fair points. A gifted speaker can light a fire that no worksheet can. Some subjects reward range and beauty, and there is joy in hearing a trained mind at work. These claims deserve respect. Yet they describe a show, not learning, and schools exist for learning.",
            "The new balance treats class time as too costly to spend on one-way talk. Recorded lessons carry the content. Classrooms become spaces for doubt, debate, and correction. The teacher, freed from the podium, moves among students whose errors finally have somewhere to surface.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'What Chronic Stress Does to the Human Body',
        'category': '健康',
        'paragraphs': [
            "Stress was designed as an emergency tool, a short and violent call on the body's resources in the face of danger. The modern arrangement keeps that machinery running for months or years, because pressures arrive every day and never quite depart. The results reach nearly every organ. Doctors call the pattern chronic stress, and its chemistry is now well understood.",
            "Cortisol, which should rise briefly and then fall, stays high all the time. It pushes the abdomen to store fat, thins the skin, weakens the bones, and dulls the immune system's ability to tell dangerous cells from harmless ones. Inflammation, normally a precise repair crew, spreads through tissues like a fire that nobody remembers to put out.",
            "The heart and its vessels suffer the most visible damage. Blood pressure meant to jump for seconds stays high around the clock, thickening the vessel walls. It prepares the ground for strokes and heart attacks. The brain is not spared either. Long exposure to stress hormones appears to shrink the hippocampus, the structure behind memory, and to enlarge the amygdala, which governs fear.",
            "The hopeful news is that the body can be pulled back. Regular exercise, enough sleep, and steady company measurably lower cortisol. Studies of meditation report falling signs of inflammation. The body, it turns out, forgives a great deal, provided the emergency is finally allowed to end.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'Rewilding: Letting Nature Take Back the Land',
        'category': '环境',
        'paragraphs': [
            "For a long time, to protect nature meant to keep a place frozen as it was when someone first judged it worth saving. A newer idea, known as rewilding, says that nature should be given room, animals, and above all time. Damaged places, its supporters claim, can then go back to governing themselves.",
            "The most famous test began with wolves. Fourteen were set free in Yellowstone in the 1990s. The results moved in ways nobody had fully foreseen. Hunted deer stopped standing in the valleys. Willows and cottonwoods came back and the riverbanks held. Even the shape of the channels changed. Beavers, songbirds, and the insects that fish eat followed. Experts now call such chains trophic cascades, in which one predator rewrites a whole landscape.",
            "Critics answer that the romance hides hard facts. Bringing back wolves, bison, or bears to land worked by farmers has a price. Country people must pay costs that city supporters never feel. Where such programs have worked, payments and local support usually came before the animals, not after them.",
            "The deeper appeal of rewilding lies in its modesty. Instead of managing every result, it puts back a few keystone species and steps aside. It accepts that the outcome will surprise the planners. In an age of climate doubt, wild systems that run themselves may prove tougher than any land we could design.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'Museums and the Problem of Contested Treasures',
        'category': '文化',
        'paragraphs': [
            "Behind the glass cases of the great museums lies a question that the keepers once managed to avoid and can avoid no longer. By what right are these objects here? Much of what was gathered in the nineteenth century left its home under a cloud. Some pieces were bought from dealers at prices far below their worth. Others were simply carried off by armies that had already won.",
            "The case for keeping them has grown weaker under study. The claim that big museums protect objects that would otherwise perish falls apart in most cases. The objects were usually taken because they were precious in the first place. The claim that London or Paris offers access to all mankind forgets one thing. The peoples who made the works usually cannot get visas. Even the record of care includes harsh cleanings that stripped original surfaces in the name of taste.",
            "Restitution, once a word found only in activist papers, has entered official policy. Several European governments have set up commissions to weigh particular claims. A growing number of objects have gone home. There they often transform national museums that had told their own stories through pictures and empty pedestals.",
            "What is at stake is not the survival of the great museum but its moral frame. Such places can remain monuments to the unfairness that assembled them. Or they can become places whose holdings rest on consent. The first road requires nothing. The second requires only the courage to start giving back what was never truly given.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'The Four-Day Week Moves From Promise to Practice',
        'category': '新闻',
        'paragraphs': [
            "For most of the past century, the belief that work should eat five days out of every seven has been treated as a law of nature rather than an accident of history. It was born in factory bargaining and survived the move into offices without much question. Recent trials on several continents have now tested, with unusual care, what happens when the fifth day simply vanishes.",
            "The results have embarrassed the doubters. In trials covering hundreds of companies, revenue held steady or rose, while measures of tiredness and burnout fell sharply. The cause, participants report, is hardly a mystery. A tighter schedule forces the death of empty meetings, pointless messages, and the general padding with which office work fills whatever time it is given.",
            "The obstacles are real all the same, above all in hospitals, restaurants, and factories. There, output depends on bodies being present rather than on concentrated thought. A shorter personal week can be kept up there only by hiring more hands. Whether societies will pay that price has become the real question, one that has less to do with output than with how its gains should be shared.",
            "The quiet meaning of these trials lies in how they are framed. They treat time, not money, as the part of the job that can be bargained over. In doing so they have revived a talk that industrial history dropped: how much of a life should be given to work, asked again a century after it was thought settled.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'Deep-Sea Mining and the Race for Battery Minerals',
        'category': '科技',
        'paragraphs': [
            "The floor of the Pacific holds scattered fields of nodules, potato-sized growths that have gathered nickel, cobalt, copper, and manganese over millions of years. These are the very metals on which the batteries of electric cars depend. The nodules lie in international waters, ruled by a body that has not yet finished writing its own rules. The race that has begun is not easy to overstate.",
            "The industry calls the work surgical: collector vehicles would crawl across the deep plain, lifting the nodules while leaving the mud around them alone. Biologists who have actually been down there describe something else. They have seen clouds of dust that drift for kilometers, settling on the small creatures that feed by filtering the water, and noise whose effect on whales remains unknown.",
            "What lifts the dispute above ordinary environmental quarrels is the nature of the place at risk. The deep abyss is among the slowest corners of the Earth to heal. The nodules, growing by millimeters per million years, are the only hard ground in a world of mud. The specialized animals anchored on them cannot simply move.",
            "The tension comes down to a mismatch of time that no deal seems able to fix. The urgent demand for batteries meets a world whose wounds are measured in geological time. Whether the rule-makers choose to forbid or to permit, they will be deciding for a public that will never see the seafloor. They must judge whether ease is worth losses that no repair project could ever undo.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
    {
        'title': 'Quantum Computing: Hype, Hope, and Hard Physics',
        'category': '科技',
        'paragraphs': [
            "Of all the technologies said to be about to change the world, quantum computing is the hardest to judge. It draws both big promises and deep doubt. The machines do not, as popular stories keep saying, try every answer at once. They use the delicate math of superposition to make certain interference calculations possible. The difference matters a lot.",
            "The road from lab to useful machines is brutal. Qubits, the basic units of quantum data, lose their coherence within microseconds, since they interact with everything around them. The errors must then be fixed by designs that need hundreds of physical qubits for every logical one. The price of that ratio runs from cryogenic cooling to radiation shields. It has humbled generations of able physicists.",
            "The uses truly worth the trouble are narrower than the hype says but more solid than doubters admit. Simulating molecules whose chemistry defeats ordinary computers could speed the search for catalysts and materials. Attacking the cryptographic roots of digital security has already pushed governments to move their standards. So do hard search problems whose sheer number of cases overwhelms ordinary processors.",
            "The mature view holds both truths at once. Quantum computers will surely not replace ordinary ones, just as particle accelerators never replaced hammers, for each is built for problems the other cannot touch. The change, when it comes, will be invisible to the user. It will be buried in labs, in codes, and in new materials. The overheated hopes of today will quietly dissolve into the plain miracle of a tool that works.",
        ],
        'source': '原创精选',
        'sourceUrl': '',
    },
]


def main() -> int:
    ap = argparse.ArgumentParser(description='原创高难度文章入库（复用 fetch-articles.py 机审管线）')
    ap.add_argument('--dry-run', action='store_true', help='仅机审校验 + 报告，不写盘')
    args = ap.parse_args()

    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    hot = fa.load_hot_vocab()
    print(f'[info] S/A 重点词表 {len(hot)} 词')

    existing_slugs = fa.load_existing()[2]
    planned: list[tuple[dict, dict]] = []
    rejected: list[str] = []
    used_slugs: set = set(existing_slugs)

    for s in NEW_ARTICLES:
        slug = fa.slugify(s['title'])
        base = slug
        n = 2
        while slug in used_slugs:
            slug = f'{base}-{n}'
            n += 1
        raw = {
            'title': s['title'],
            'category': s['category'],
            'paragraphs': s['paragraphs'],
            'source': s['source'],
            'sourceUrl': s.get('sourceUrl', ''),
            'slug': slug,
            'published_at': now_iso[:10],
        }
        article = fa.make_article(raw, hot, now_iso)  # 标准机审（词数/覆盖率/难度分档）
        if not article:
            rejected.append(f"{s['title']}（词数 150–500 或覆盖率 ≥ 8% 不达标）")
            continue
        if not (TARGET_MIN_DIFFICULTY <= article['difficulty'] <= TARGET_MAX_DIFFICULTY):
            rejected.append(f"{s['title']}（难度分 {article['difficulty']} 超出目标区间 "
                            f'{TARGET_MIN_DIFFICULTY}–{TARGET_MAX_DIFFICULTY}）')
            continue
        if article['level'] < TARGET_MIN_LEVEL:
            rejected.append(f"{s['title']}（level {article['level']} 低于 {TARGET_MIN_LEVEL}）")
            continue
        used_slugs.add(slug)
        planned.append((article, article))

    print(f'[info] 通过机审 {len(planned)} 篇 / 目标门槛内，淘汰 {len(rejected)} 篇')
    for r in rejected:
        print('  [reject]', r)
    print()
    print(f"{'slug':<52} {'分类':<4} {'L':<2} {'难度':<4} {'覆盖率%':<6} {'词数':<4}")
    for meta, _ in planned:
        print(f"{meta['slug']:<52} {meta['category']:<4} {meta['level']:<2} "
              f"{meta['difficulty']:<4} {meta['hotCoverage']:<6} {meta['wordCount']:<4}")
    print()

    if args.dry_run:
        print('[dry-run] 未写盘')
        return 0 if planned and not rejected else (0 if planned else 1)
    if not planned:
        print('[error] 无符合门槛的文章，收工（未写盘）')
        return 1
    fa.write_outputs([m for m, _ in planned], [a for _, a in planned], now_iso[:19] + 'Z')
    print('[done] 已写入 public/data/articles/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
