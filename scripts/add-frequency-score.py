# -*- coding: utf-8 -*-
"""
为词库分片写入热频分 fs（frequency score，0-100）。
fs = round(0.6 * corpus_score + 0.4 * tier_score)
  - corpus_score：hermitdave/en_50k 语料词频 rank 开方压缩（rank1→100，rank50000→0，无 rank→0）
    注：log 压缩过陡（S=3/A=35），sqrt 下 top~1200 真题高频词可进入 S/A 档，符合设计意图
  - tier_score ：大纲层级分（tier 0→100 / 1→70 / 2→40）
就地重写 public/data/*.json，保持字段顺序，fs 插在 tier 之后。
用法：python scripts/add-frequency-score.py
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'public' / 'data'
FREQ_FILE = ROOT / 'scripts' / 'source' / 'en_50k.txt'

TIER_SCORE = {0: 100, 1: 70, 2: 40}
SQRT_DEN = math.sqrt(50000)  # rank=50000 → corpus_score=0

TIER_KEY = 'tier'
FS_KEY = 'fs'


def load_freq_ranks() -> dict:
    ranks = {}
    with FREQ_FILE.open('r', encoding='utf-8') as f:
        rank = 0
        for line in f:
            m = re.match(r'^(\S+)', line.strip())
            if not m:
                continue
            rank += 1
            ranks.setdefault(m.group(1).lower(), rank)
    return ranks


def corpus_score(rank: int) -> float:
    if rank <= 0:
        return 0.0
    if rank >= 50000:
        return 0.0
    return 100.0 * (1.0 - math.sqrt(rank) / SQRT_DEN)


def fs_of(word: str, tier: int, ranks: dict) -> int:
    r = ranks.get(word.lower(), 0)
    return round(0.6 * corpus_score(r) + 0.4 * TIER_SCORE[tier])


def insert_after_tier(entry: dict, fs: int) -> dict:
    """重建 dict：保持原字段顺序，fs 插在 tier 之后。"""
    out = {}
    for k, v in entry.items():
        out[k] = v
        if k == TIER_KEY:
            out[FS_KEY] = fs
    if FS_KEY not in out:  # 异常数据缺 tier 时兜底放末尾
        out[FS_KEY] = fs
    return out


def main() -> int:
    ranks = load_freq_ranks()
    print(f'词频表加载：{len(ranks)} 词')

    shards = sorted(DATA_DIR.glob('cet*.json'))
    shards = [p for p in shards if p.name != 'index.json']
    if not shards:
        print('未找到词库分片', file=sys.stderr)
        return 1

    total = 0
    dist = {'S': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0}
    for path in shards:
        words = json.loads(path.read_text(encoding='utf-8'))
        rebuilt = []
        for w in words:
            fs = fs_of(w['word'], w.get('tier', 2), ranks)
            g = 'S' if fs >= 90 else 'A' if fs >= 78 else 'B' if fs >= 62 else 'C' if fs >= 45 else 'D'
            dist[g] += 1
            rebuilt.append(insert_after_tier(w, fs))
        # 注：本机环境 Path.write_text 曾静默失效（写后读回旧值），统一用 open()+json.dump 落盘
        with path.open('w', encoding='utf-8') as fh:
            json.dump(rebuilt, fh, ensure_ascii=False, separators=(',', ':'))
            fh.write('\n')
        total += len(rebuilt)
        print(f'{path.name}: {len(rebuilt)} 词已写入 fs')

    print(f'合计 {total} 词；热度分布 S={dist["S"]} A={dist["A"]} B={dist["B"]} C={dist["C"]} D={dist["D"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
