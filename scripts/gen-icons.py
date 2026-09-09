# 生成 PWA 图标：512 / 192 / apple-touch-180，科技风霓虹渐变「词」
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
BG = (10, 14, 26)          # #0A0E1A 深空
C1 = (56, 189, 248)        # #38BDF8 电子蓝
C2 = (139, 92, 246)        # #8B5CF6 紫
C3 = (45, 212, 191)        # #2DD4BF 青绿
FONT = r'C:\Windows\Fonts\msyhbd.ttc'


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    """左下->右上 三站渐变"""
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(0, size, 1):
            t = (x + y) / (2 * size)
            c = lerp(C1, C2, t / 0.5) if t < 0.5 else lerp(C2, C3, (t - 0.5) / 0.5)
            px[x, y] = c
    return img


def make(size, fname, radius_ratio=0.22):
    S = size
    # 圆角底板
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=BG + (255,))

    # 细网格纹理（裁剪进圆角）
    grid = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = max(S // 8, 8)
    for i in range(0, S + 1, step):
        gd.line([(i, 0), (i, S)], fill=C1 + (14,), width=max(S // 256, 1))
        gd.line([(0, i), (S, i)], fill=C1 + (14,), width=max(S // 256, 1))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
    base.alpha_composite(Image.composite(grid, Image.new('RGBA', (S, S), (0, 0, 0, 0)), mask))

    # 「词」字形遮罩
    font = ImageFont.truetype(FONT, int(S * 0.52))
    txt = Image.new('L', (S, S), 0)
    td = ImageDraw.Draw(txt)
    td.text((S / 2, S / 2), '词', font=font, anchor='mm', fill=255)

    grad = gradient(S).convert('RGBA')
    # 辉光：模糊遮罩 + 渐变
    glow = txt.filter(ImageFilter.GaussianBlur(S * 0.035))
    glow_img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glow_img.paste(grad, (0, 0), glow.point(lambda v: v * 0.75))
    base.alpha_composite(glow_img)
    # 主体渐变字
    base.paste(grad, (0, 0), txt)

    # 右上青绿点缀圆环
    rd = ImageDraw.Draw(base)
    r = S * 0.045
    cx, cy = S * 0.80, S * 0.20
    rd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=C3 + (230,), width=max(int(S * 0.014), 2))

    base.save(os.path.join(OUT, fname))
    print('saved', fname, S)


make(512, 'icon-512.png')
make(192, 'icon-192.png')
# apple-touch-icon：不透明、圆角更小（iOS 自行裁圆角）
make(180, 'apple-touch-icon.png', radius_ratio=0.18)
