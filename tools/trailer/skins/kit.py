"""Werkzeugkasten für eigene Minecraft-Skins (64×64, beide Ebenen): Teile, Flächen, Farbrampen, Rauschen.

Koordinaten (für die Malfunktionen): X quer (−4 … +4 am Körper, negativ = rechte Seite der Figur, also von vorne
gesehen links), Y von oben (0 = Scheitel, 8 = Hals, 20 = Hüfte, 32 = Sohle), Z nach vorne (+ = Brust, − = Rücken).
Jeder Bildpunkt einer Fläche bekommt seinen Mittelpunkt in diesen Koordinaten (X, Y, Z) und seine Lage im Teil
(x, y, z ab 0, Größe w×h×d). So lassen sich Muster über Flächen hinweg malen (Streifen, Reißverschluss, Haarlänge).

Die Lage der Flächen im Bild entspricht dem Minecraft-Skin-Format (Kopf 0|0, Körper 16|16, rechter Arm 40|16,
linker Arm 32|48, rechtes Bein 0|16, linkes Bein 16|48; zweite Ebene: Kopf +32 in x, sonst +16 in y bzw. 48|48 und
0|48). Schmale Arme („slim“) sind 3 statt 4 Bildpunkte breit.
"""
import colorsys, math, random
from PIL import Image

FACES = ('top', 'bottom', 'right', 'front', 'left', 'back')

# Teil: (u, v) der ersten Ebene, (u, v) der zweiten Ebene, Ursprung (X, Y, Z) der Ecke rechts-oben-hinten, Größe
BOXES = {
    'head': ((0, 0), (32, 0), (-4, 0, -4), (8, 8, 8)),
    'body': ((16, 16), (16, 32), (-4, 8, -2), (8, 12, 4)),
    'rarm': ((40, 16), (40, 32), (-8, 8, -2), (4, 12, 4)),
    'larm': ((32, 48), (48, 48), (4, 8, -2), (4, 12, 4)),
    'rleg': ((0, 16), (0, 32), (-4, 20, -2), (4, 12, 4)),
    'lleg': ((16, 48), (0, 48), (0, 20, -2), (4, 12, 4)),
}
PARTS = tuple(BOXES)
ARMS, LEGS = ('rarm', 'larm'), ('rleg', 'lleg')


def face_rects(u, v, w, h, d):
    return {'top': (u + d, v, w, d), 'bottom': (u + d + w, v, w, d), 'right': (u, v + d, d, h),
            'front': (u + d, v + d, w, h), 'left': (u + d + w, v + d, d, h), 'back': (u + d + w + d, v + d, w, h)}


class P:
    """Ein Bildpunkt einer Fläche mit allen Angaben, die eine Malfunktion braucht."""
    __slots__ = ('part', 'face', 'layer', 'i', 'j', 'x', 'y', 'z', 'w', 'h', 'd', 'X', 'Y', 'Z', 'img')

    def __repr__(self):
        return f'P({self.part} {self.face} {self.layer} x{self.x} y{self.y} z{self.z})'

    # Ränder der Fläche (für Säume, Kanten, Schatten)
    @property
    def side(self):  # Außen-/Innenseite eines Arms oder Beins
        if self.face in ('right', 'left'):
            outer = {'rarm': 'right', 'rleg': 'right', 'larm': 'left', 'lleg': 'left'}.get(self.part)
            return 'outer' if self.face == outer else 'inner' if outer else self.face
        return self.face

    @property
    def u(self):  # 0 oben … 1 unten im Teil
        return self.y / max(1, self.h - 1)

    @property
    def front(self):
        return self.face == 'front'


def _hue_toward(h, target, amount):
    d = (target - h + 0.5) % 1.0 - 0.5
    return (h + max(-abs(d), min(abs(d), amount)) * (1 if d >= 0 else -1)) % 1.0


def hexrgb(c):
    if isinstance(c, tuple):
        return c
    c = c.lstrip('#')
    return tuple(int(c[k:k + 2], 16) for k in (0, 2, 4))


def shade(c, k, cool=0.62, warm=0.12, sat=1.0):
    """Farbe k Stufen dunkler (k < 0) oder heller (k > 0) – mit Farbverschiebung wie bei Pixel-Künstlern:
    Schatten kühler und satter, Lichter wärmer und blasser."""
    r, g, b = (v / 255 for v in hexrgb(c))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if k < 0:
        a = -k
        l = l * (1 - 0.15 * a) - 0.006 * a * a
        s = min(1.0, s * (1 + 0.07 * a * sat))
        if s > 0.05:
            h = _hue_toward(h, cool, 0.016 * a)
    elif k > 0:
        l = l + (1 - l) * 0.2 * k
        s = s * (1 - 0.07 * k)
        if s > 0.05:
            h = _hue_toward(h, warm, 0.012 * k)
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return (round(r * 255), round(g * 255), round(b * 255))


def mix(a, b, t):
    a, b = hexrgb(a), hexrgb(b)
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def noise(*key):
    """Fester Zufallswert 0…1 für einen Ort (gleich bei jedem Lauf)."""
    h = 2166136261
    for v in key:
        for ch in str(v):
            h = ((h ^ ord(ch)) * 16777619) & 0xffffffff
        h = ((h ^ 0x9e) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    h ^= h >> 15
    return (h & 0xffffff) / 0x1000000


class Skin:
    def __init__(self, slim, seed):
        self.slim = slim
        self.seed = seed
        self.rng = random.Random(seed)
        self.img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        self.pix = self.img.load()
        self.boxes = dict(BOXES)
        if slim:
            self.boxes['rarm'] = ((40, 16), (40, 32), (-7, 8, -2), (3, 12, 4))
            self.boxes['larm'] = ((32, 48), (48, 48), (4, 8, -2), (3, 12, 4))
        self._points = {}

    # -------------------------------------------------------------- Bildpunkte
    def points(self, part, layer=0, faces=FACES):
        key = (part, layer)
        if key not in self._points:
            (u0, v0), (u1, v1), (X0, Y0, Z0), (w, h, d) = self.boxes[part]
            u, v = (u0, v0) if layer == 0 else (u1, v1)
            out = []
            for face, (fx, fy, fw, fh) in face_rects(u, v, w, h, d).items():
                for j in range(fh):
                    for i in range(fw):
                        if face == 'front':
                            x, y, z = i, j, d - 1
                        elif face == 'back':
                            x, y, z = w - 1 - i, j, 0
                        elif face == 'right':
                            x, y, z = 0, j, i
                        elif face == 'left':
                            x, y, z = w - 1, j, d - 1 - i
                        elif face == 'top':
                            x, y, z = i, 0, j
                        else:  # bottom
                            x, y, z = i, h - 1, d - 1 - j
                        p = P()
                        p.part, p.face, p.layer, p.i, p.j = part, face, layer, fx + i, fy + j
                        p.x, p.y, p.z, p.w, p.h, p.d = x, y, z, w, h, d
                        p.X, p.Y, p.Z = X0 + x + 0.5, Y0 + y + 0.5, Z0 + z + 0.5
                        out.append(p)
            self._points[key] = out
        return [p for p in self._points[key] if p.face in faces]

    def paint(self, parts, fn, layer=0, faces=FACES):
        """fn(p) → Farbe (Tupel/Hex), None = nichts ändern, 'clear' = durchsichtig machen."""
        if isinstance(parts, str):
            parts = (parts,)
        for part in parts:
            for p in self.points(part, layer, faces):
                c = fn(p)
                if c is None:
                    continue
                if c == 'clear':
                    self.pix[p.i, p.j] = (0, 0, 0, 0)
                else:
                    c = hexrgb(c)
                    self.pix[p.i, p.j] = c + (255,) if len(c) == 3 else c

    def get(self, p):
        return self.pix[p.i, p.j]

    def at(self, part, face, x, y, layer=0):
        """Bildpunkt (Spalte x, Zeile y) einer Fläche, wie im Bild (nicht in Raum-Koordinaten)."""
        (u0, v0), (u1, v1), _, (w, h, d) = self.boxes[part]
        u, v = (u0, v0) if layer == 0 else (u1, v1)
        fx, fy, fw, fh = face_rects(u, v, w, h, d)[face]
        return fx + x, fy + y

    def put(self, part, face, x, y, c, layer=0):
        i, j = self.at(part, face, x, y, layer)
        self.pix[i, j] = (0, 0, 0, 0) if c is None else hexrgb(c) + (255,)

    def save(self, path):
        self.img.save(path)


def light(p, top=1.0, grad=1.6, sides=0.0):
    """Grund-Licht eines Bildpunkts in Stufen: oben heller, unten dunkler; Deckel/Böden; leicht von links-vorne."""
    k = 0.0
    if p.face == 'top':
        return top
    if p.face == 'bottom':
        return -1.5
    k += grad * (0.5 - p.u)
    if p.face in ('right', 'left'):
        k -= sides
    return k
