#!/usr/bin/env python3
"""Schnelle 3D-Vorschau eigener Skins (ohne Minecraft): Figur schräg von vorne und von hinten, beide Ebenen.

  python3 vorschau.py <ausgabe.png> <skin.png[:slim]> …      # Skins nebeneinander
  python3 vorschau.py <ausgabe.png> --alle                    # alle 18 aus png/ (vorne, darunter hinten)

Nur zum Zeichnen gedacht; das echte Bild kommt aus dem Client (siehe README).
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Skin, BOXES  # noqa: E402

LIGHT = {'top': 1.0, 'bottom': 0.5, 'front': 0.86, 'back': 0.86, 'right': 0.66, 'left': 0.66}
INFL = {'head': 0.5, 'body': 0.25, 'rarm': 0.25, 'larm': 0.25, 'rleg': 0.25, 'lleg': 0.25}


def quads(img, slim):
    """Alle sichtbaren Bildpunkt-Vierecke der Figur: (Ecken[4] in Modell-Koordinaten, Farbe, Fläche)."""
    sk = Skin(slim, 0)
    pix = img.convert('RGBA').load()
    out = []
    for part in BOXES:
        (u0, v0), (u1, v1), (X0, Y0, Z0), (w, h, d) = sk.boxes[part]
        for layer in (0, 1):
            e = INFL[part] if layer else 0.0
            cx, cy, cz = X0 + w / 2, Y0 + h / 2, Z0 + d / 2
            sx, sy, sz = (w + 2 * e) / w, (h + 2 * e) / h, (d + 2 * e) / d
            for p in sk.points(part, layer):
                r, g, b, a = pix[p.i, p.j]
                if layer == 0:
                    a = 255
                if a < 128:
                    continue
                X, Y, Z = p.X, p.Y, p.Z
                f = p.face
                if f == 'front':
                    c = [(X - .5, Y - .5, Z0 + d), (X + .5, Y - .5, Z0 + d), (X + .5, Y + .5, Z0 + d), (X - .5, Y + .5, Z0 + d)]
                elif f == 'back':
                    c = [(X - .5, Y - .5, Z0), (X + .5, Y - .5, Z0), (X + .5, Y + .5, Z0), (X - .5, Y + .5, Z0)]
                elif f == 'right':
                    c = [(X0, Y - .5, Z - .5), (X0, Y - .5, Z + .5), (X0, Y + .5, Z + .5), (X0, Y + .5, Z - .5)]
                elif f == 'left':
                    c = [(X0 + w, Y - .5, Z - .5), (X0 + w, Y - .5, Z + .5), (X0 + w, Y + .5, Z + .5), (X0 + w, Y + .5, Z - .5)]
                elif f == 'top':
                    c = [(X - .5, Y0, Z - .5), (X + .5, Y0, Z - .5), (X + .5, Y0, Z + .5), (X - .5, Y0, Z + .5)]
                else:
                    c = [(X - .5, Y0 + h, Z - .5), (X + .5, Y0 + h, Z - .5), (X + .5, Y0 + h, Z + .5), (X - .5, Y0 + h, Z + .5)]
                c = [(cx + (x - cx) * sx, cy + (y - cy) * sy, cz + (z - cz) * sz) for x, y, z in c]
                out.append((c, (r, g, b), f))
    return out


NORMAL = {'front': (0, 0, 1), 'back': (0, 0, -1), 'right': (-1, 0, 0), 'left': (1, 0, 0), 'top': (0, -1, 0), 'bottom': (0, 1, 0)}


def render(img, slim, yaw, pitch=12, scale=11, pad=14):
    """Figur zeichnen: yaw 0 = von vorne, 180 = von hinten. Rückgabe RGBA-Bild."""
    ss = 3
    a, b = math.radians(yaw), math.radians(pitch)

    def rot(x, y, z):
        # Modell: X nach links (der Figur), Y nach unten, Z nach vorne. Kamera schaut aus +Z.
        x1 = x * math.cos(a) + z * math.sin(a)
        z1 = -x * math.sin(a) + z * math.cos(a)
        y1 = y * math.cos(b) + z1 * math.sin(b)
        z2 = -y * math.sin(b) + z1 * math.cos(b)
        return x1, y1, z2

    qs = []
    for c, col, f in quads(img, slim):
        n = rot(*NORMAL[f])
        if n[2] <= 0.02:
            continue
        r = [rot(x - 0, y - 16, z) for x, y, z in c]
        depth = sum(p[2] for p in r) / 4
        k = LIGHT[f]
        qs.append((depth, [(p[0], p[1]) for p in r], tuple(min(255, round(v * k)) for v in col)))
    qs.sort(key=lambda q: q[0])
    W, H = int((20 + 2 * pad / scale) * scale * ss), int((38 + 2 * pad / scale) * scale * ss)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    ox, oy = W / 2, H / 2
    for _, pts, col in qs:
        dr.polygon([(ox + x * scale * ss, oy + y * scale * ss) for x, y in pts], fill=col + (255,))
    return im.resize((W // ss, H // ss), Image.LANCZOS)


def sheet(entries, out, label=True):
    """entries: [(Bild, slim, Beschriftung)] → zwei Reihen (schräg vorne, schräg hinten)."""
    tiles = []
    for img, slim, name in entries:
        tiles.append((render(img, slim, -28), render(img, slim, 152), name))
    tw, th = tiles[0][0].size
    W, H = tw * len(tiles), th * 2 + (40 if label else 0)
    bg = Image.new('RGBA', (W, H), (226, 232, 238, 255))
    dr = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / H
        dr.line([(0, y), (W, y)], fill=(round(170 + 50 * t), round(205 + 30 * t), round(235 + 10 * t), 255))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
    except OSError:
        font = ImageFont.load_default()
    for k, (fr, bk, name) in enumerate(tiles):
        bg.alpha_composite(fr, (k * tw, 0))
        bg.alpha_composite(bk, (k * tw, th))
        if label:
            tw_ = dr.textlength(name, font=font)
            dr.text((k * tw + (tw - tw_) / 2, 2 * th + 10), name, fill=(20, 30, 40, 255), font=font)
    bg.convert('RGB').save(out)
    return out


def main():
    out, *args = sys.argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    entries = []
    if args == ['--alle']:
        import json
        figs = json.load(open(os.path.join(here, 'figuren.json')))
        for f in figs:
            entries.append((Image.open(os.path.join(here, 'png', f['model'], f['texture'] + '.png')), f['model'] == 'slim', f['id']))
    else:
        for a in args:
            path, _, kind = a.partition(':')
            entries.append((Image.open(path), kind == 'slim', os.path.basename(path)))
    print(sheet(entries, out))


if __name__ == '__main__':
    main()
