"""Bausteine für die Figuren: Licht, Haut, Gesicht, Haare, Kleidung, Zubehör.

Jeder Baustein malt auf einen Skin (kit.Skin). Farben sind die Mitteltöne; Schatten und Lichter kommen aus
kit.shade (in ganzen Stufen, damit es nach Pixelkunst aussieht und nicht nach Verlauf).
"""
import math
from kit import shade, mix, noise, hexrgb, ARMS, LEGS, PARTS

LIMBS = ARMS + LEGS


# ------------------------------------------------------------------ Licht

def lit(p, grad=1.5, rnd=0.9):
    """Grundlicht in Stufen (vor dem Runden): Deckel hell, Böden dunkel, oben heller als unten, Kanten rund."""
    if p.face == 'top':
        return 0.9
    if p.face == 'bottom':
        return -2.0
    k = grad * (0.4 - p.y / max(1, p.h - 1))
    if p.part in LIMBS:
        if p.side == 'inner':
            k -= 1.0
        elif p.side == 'outer':
            k += 0.15
        elif p.face == 'back':
            k -= 0.35
        if p.face in ('front', 'back'):  # quer über das Glied: innen dunkler
            inner_x = p.w - 1 if p.part in ('rarm', 'rleg') else 0
            t = abs(p.x - inner_x) / max(1, p.w - 1)  # 0 innen … 1 außen
            k += rnd * (t - 0.6)
    elif p.part == 'body':
        if p.face in ('right', 'left'):
            k -= 1.0
        else:
            a = (p.x - (p.w - 1) / 2) / ((p.w - 1) / 2)
            k -= rnd * 0.9 * a * a
            if p.face == 'back':
                k -= 0.3
    elif p.part == 'head':
        if p.face == 'back':
            k -= 0.3
        elif p.face in ('right', 'left'):
            k -= 0.25
    return k


def q(k, lo=-6, hi=3):
    return max(lo, min(hi, int(math.floor(k + 0.5))))


def tex(sk, p, amp, salt='t'):
    return amp * (noise(sk.seed, salt, p.layer, p.part, p.face, p.x, p.y, p.z) - 0.5)


def col(base, k, **kw):
    return shade(base, q(k), **kw)


# ------------------------------------------------------------------ Haut

def skin_all(sk, tone):
    """Haut auf der ganzen ersten Ebene (Grundlage für alles andere)."""
    def f(p):
        k = lit(p, 1.0, 0.7) + tex(sk, p, 0.1, 'haut')
        if p.part == 'head' and p.face == 'front':
            k += 0.4 if p.y <= 3 else 0.0
            k -= 0.9 if p.y == 7 else 0.0
            if p.x in (0, 7):
                k -= 0.5
        return col(tone, k, cool=0.97, warm=0.09)
    sk.paint(PARTS, f)


def hands(sk, tone, rows=2):
    """Hände: die untersten Reihen der Arme in Haut (über Ärmel gemalt)."""
    def f(p):
        if p.y < p.h - rows:
            return None
        k = lit(p, 1.0) - 0.2 + (0.4 if p.y == p.h - rows else 0)
        return col(tone, k, cool=0.97, warm=0.09)
    sk.paint(ARMS, f)


# ------------------------------------------------------------------ Gesicht

def face(sk, tone, eyes, brow, *, eye_row=4, brow_row=3, lashes=False, lips=None, blush=None, freckles=False,
         smile=False, look=0, white='#f4f2ee', lid=None):
    """Augen, Brauen, Nase, Mund auf der Vorderseite des Kopfes (erste Ebene)."""
    put = lambda x, y, c: sk.put('head', 'front', x, y, c)
    skin = lambda k: shade(tone, k, cool=0.97, warm=0.09)
    # Augen: außen weiß, innen die Iris (look = 1 → Blick nach rechts im Bild)
    ex = [(1, 2), (6, 5)]
    for outer, inner in ex:
        if look == 0:
            put(outer, eye_row, white)
            put(inner, eye_row, eyes)
        else:
            put(outer, eye_row, eyes if (look < 0) == (outer < 4) else white)
            put(inner, eye_row, white if (look < 0) == (outer < 4) else eyes)
    if lashes:
        lc = lid or shade(brow, -2)
        for x in (1, 2, 5, 6):
            put(x, eye_row - 1, lc)
        put(0, eye_row, mix(skin(0), lc, 0.55))
        put(7, eye_row, mix(skin(0), lc, 0.55))
    if brow_row is not None and brow is not None:
        bc = shade(brow, -1)
        for x in (1, 2, 5, 6):
            put(x, brow_row, bc if x in (2, 5) else mix(bc, skin(0), 0.35))
    # Nase (Licht von links oben): kleiner Schatten rechts unter der Mitte
    put(4, eye_row + 1, skin(-1))
    put(3, eye_row + 1, skin(0))
    # Mund
    if lips:
        put(3, eye_row + 2, lips)
        put(4, eye_row + 2, shade(lips, -1))
    else:
        put(3, eye_row + 2, skin(-2))
        put(4, eye_row + 2, skin(-2))
    if smile:
        put(2, eye_row + 2, skin(-1))
        put(5, eye_row + 2, skin(-1))
    if blush:
        put(1, eye_row + 1, mix(skin(0), blush, 0.4))
        put(6, eye_row + 1, mix(skin(0), blush, 0.4))
    if freckles:
        for x, y in ((1, eye_row + 1), (2, eye_row + 1), (5, eye_row + 1), (6, eye_row + 1), (2, eye_row + 2), (5, eye_row + 2)):
            if (x + y + sk.seed) % 2 == 0 or y == eye_row + 1:
                put(x, y, mix(skin(-1), '#a0522d', 0.45))
    # Kinn und Wangen: unterste Reihe dunkler (Schatten unter dem Kinn)
    for x in range(8):
        if (x, 7) not in ((3, 7), (4, 7)):
            pass
    # Ohren an den Seiten
    for face_ in ('right', 'left'):
        ox = 3 if face_ == 'right' else 4
        sk.put('head', face_, ox, eye_row, skin(-1))
        sk.put('head', face_, ox, eye_row + 1, skin(-1))
        sk.put('head', face_, ox + (1 if face_ == 'right' else -1), eye_row, skin(0))


def beard(sk, color, kind='full', tone=None):
    """Bart auf der ersten Ebene: full (Vollbart), stubble (Stoppeln), moustache (Schnurrbart)."""
    def f(p):
        if p.part != 'head' or p.face == 'top' or p.face == 'back':
            return None
        n = noise(sk.seed, 'bart', p.face, p.x, p.y)
        if p.face == 'front':
            if kind == 'moustache':
                return col(color, -0.3 + (n - 0.5)) if p.y == 5 and 1 <= p.x <= 6 and p.x not in (3, 4) or (p.y == 5 and p.x in (3, 4)) else None
            if kind == 'stubble':
                if p.y >= 5 and not (p.y == 6 and p.x in (3, 4)) and n < 0.55:
                    return mix(sk.get(p)[:3], color, 0.45)
                return None
            if p.y >= 5 and not (p.y == 6 and p.x in (3, 4)):
                return col(color, 0.3 - (p.y - 5) * 0.5 + (n - 0.5) * 1.2)
            if p.y == 4 and p.x in (0, 7):
                return col(color, -0.5)
            return None
        if p.face == 'bottom':
            return col(color, -1.5) if kind != 'moustache' else None
        # Seiten: vorne unten (Kinnlade bis zum Ohr)
        front_near = p.z >= 4
        if kind == 'full' and ((p.y >= 5 and front_near) or (p.y >= 4 and p.z >= 6)):
            return col(color, -0.4 + (n - 0.5))
        if kind == 'stubble' and p.y >= 5 and front_near and n < 0.5:
            return mix(sk.get(p)[:3], color, 0.4)
        return None
    sk.paint('head', f)


# ------------------------------------------------------------------ Haare

STRANDS = (0, 1, 0, -1, 1, 0, -1, 0, 1, -1)


def strand(sk, s, salt='s'):
    """Versatz einer Strähne (ganze Stufen), fest je Spalte – benachbarte Strähnen unterscheiden sich."""
    return STRANDS[(s * 3 + int(noise(sk.seed, salt) * 10)) % len(STRANDS)]


def hair_k(sk, p, *, gloss=1.0, band=1.5, salt='s'):
    """Licht im Haar: Strähnen als Büschel zu zwei Bildpunkten (links heller, rechts dunkler), oben vom Wirbel
    (hinten Mitte) strahlenförmig nach vorne, ein Glanzband auf Stirnhöhe."""
    if p.face == 'top':
        ang = math.atan2(p.x - 3.5, p.z + 0.5)
        s = int(round(ang / 0.3))
        k = 0.75 + 0.8 * strand(sk, s, salt) + 0.2 * (p.z - 3.5)
        if p.z >= 6 and (p.x + s) % 3 == 0:
            k += 0.8  # Glanz vorne oben
        return k
    s = p.x if p.face in ('front', 'back') else p.z
    k = 0.7 * strand(sk, s // 2, salt) + (0.45 if s % 2 == 0 else -0.35)
    if p.face == 'back':
        k -= 0.4
    elif p.face in ('right', 'left'):
        k -= 0.2
    b = band + (1 if noise(sk.seed, salt + 'b', p.face, s // 2) > 0.6 else 0)
    if abs(p.y - b) < 0.6 and s % 2 == 0:
        k += gloss
    return k


def hair(sk, color, *, side=None, back=7, over_side=1, over_back=None, top=True, gloss=1.0, salt='s',
         cool=0.72, warm=0.11, tips=True, extra=None):
    """Haare an Seiten, Hinterkopf und oben (erste Ebene) plus Volumen auf der zweiten Ebene.

    side: Funktion z → Länge an der Seite (z 0 = hinten … 7 = vorne), Standard kurz (Ohr frei)
    back: Länge hinten (Reihen); over_side/over_back: Länge auf der zweiten Ebene (None = wie erste Ebene − 1)
    Die Vorderseite malt die Gesichtskarte (face_map) – hier nur der Rest.
    """
    side = side or (lambda z: back if z <= 2 else 3 if z <= 4 else 2)
    over_back = back - 1 if over_back is None else over_back

    def length(p):
        if p.face == 'back':
            return back
        if p.face in ('right', 'left'):
            return side(p.z)
        return 99

    def base(p):
        if p.face in ('front', 'bottom') or (p.face == 'top' and not top):
            return None
        L = length(p)
        if p.y >= L:
            return None
        k = lit(p, 0.6, 0.3) - 0.2 + hair_k(sk, p, gloss=gloss, salt=salt)
        if tips and p.face != 'top' and p.y == L - 1:
            k -= 0.8
        return col(color, k, cool=cool, warm=warm)
    sk.paint('head', base)

    def outer(p):
        if p.face in ('front', 'bottom'):
            return None
        if p.face == 'top':
            return col(color, 1.0 + 0.9 * strand(sk, p.x + p.z // 3, salt + 'o') + 0.15 * (p.z - 3.5),
                       cool=cool, warm=warm) if top else None
        if p.face == 'back':
            L = over_back
        else:
            L = over_side(p.z) if callable(over_side) else over_side
        n = noise(sk.seed, 'ov', p.face, p.x, p.z)
        jag = 1 if n < 0.3 else 0
        if p.y >= L - jag:
            return None
        k = 0.3 + hair_k(sk, p, gloss=gloss, salt=salt + 'o') - 0.15 * p.y
        if tips and p.y == L - 1 - jag:
            k -= 0.7
        return col(color, k, cool=cool, warm=warm)
    sk.paint('head', outer, layer=1)
    if extra:
        extra(sk)


FACE_KEYS = 'SsdDHLhKwiIlbmMcfgGBpPrRxXyYzZ'


def face_map(sk, rows, pal, part='head', face_='front', layer=0):
    """Fläche von Hand malen: rows = 8 Zeichenketten (wie im Bild, links = rechte Seite der Figur), pal = Zeichen → Farbe.
    '.' bleibt, wie es ist; '_' macht durchsichtig (zweite Ebene)."""
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            if ch == '_':
                sk.put(part, face_, x, y, None, layer)
                continue
            c = pal[ch]
            sk.put(part, face_, x, y, c(x, y) if callable(c) else c, layer)


def face_pal(tone, hair_c, eyes, *, lips=None, blush='#f08a96', brow=None, lash=None, white='#f3f1ec',
             beard_c=None, extra=None):
    """Farben für Gesichtskarten: S hell, s Haut, d/D Schatten, H/L/h/K Haar, w Augenweiß, i/I Iris, l Wimpern,
    b Braue, m/M Mund, c Wange, f Sommersprosse, g Stoppeln, B/G Bart."""
    sh = lambda k: shade(tone, k, cool=0.97, warm=0.09)
    hs = lambda k: shade(hair_c, k)
    pal = {'S': sh(1), 's': sh(0), 'd': sh(-1), 'D': sh(-2), 'E': sh(-3),
           'H': hs(0), 'L': hs(1), 'P': hs(2), 'h': hs(-1), 'K': hs(-2),
           'w': hexrgb(white), 'i': hexrgb(eyes), 'I': shade(eyes, -2), 'j': shade(eyes, 1),
           'l': shade(lash or hair_c, -3) if lash or hair_c else sh(-4), 'b': shade(brow or hair_c, -1),
           'm': hexrgb(lips) if lips else sh(-2), 'M': shade(lips, -1) if lips else sh(-3),
           'c': mix(sh(0), blush, 0.35), 'f': mix(sh(-1), '#9c4a22', 0.5),
           'g': mix(sh(0), beard_c or hair_c, 0.35), 'B': hexrgb(beard_c or hair_c),
           'G': shade(beard_c or hair_c, -1), 'R': shade(beard_c or hair_c, 1)}
    if extra:
        pal.update({k: hexrgb(v) if isinstance(v, str) else v for k, v in extra.items()})
    return pal


def long_back(sk, color, to_y=14, over_front=False, width=None, strand=1.0, cool=0.72, warm=0.11):
    """Lange Haare über den Rücken (zweite Ebene des Körpers), optional vorne über die Schultern."""
    def f(p):
        if p.face == 'back':
            ww = width or 8
            x0 = (8 - ww) / 2
            if not (x0 <= p.x < x0 + ww):
                return None
            # unten in Strähnen auslaufen
            n = noise(sk.seed, 'lb', p.x)
            if p.Y > to_y - 1.5 * n:
                return None
            k = lit(p, 0.8) + (noise(sk.seed, 'lbs', p.x) - 0.5) * 1.6 * strand - (0.8 if p.Y > to_y - 2.5 else 0)
            return col(color, k + 0.3, cool=cool, warm=warm)
        if p.face in ('right', 'left') and p.z <= 1 and p.Y < to_y - 2:
            return col(color, lit(p, 0.8) - 0.2, cool=cool, warm=warm)
        if over_front and p.face == 'front' and p.x in (0, 7) and p.Y < to_y - 4:
            return col(color, 0.2 - (p.Y - 8) * 0.25, cool=cool, warm=warm)
        if p.face == 'top' and p.z <= 1:
            return col(color, 0.5, cool=cool, warm=warm)
        return None
    sk.paint('body', f, layer=1)


# ------------------------------------------------------------------ Kleidung (erste Ebene)

def top_wear(sk, color, *, sleeves='long', neck='round', amp=0.2, rows=12, pattern=None, cool=0.62, warm=0.12,
             folds=True, cuff=None, hem=None):
    """Oberteil auf Körper und Armen: sleeves = long|short|elbow|none, neck = round|v|collar|high|square."""
    sl_rows = {'long': 10, 'elbow': 5, 'short': 3, 'none': 0, 'cap': 1}[sleeves]

    def f(p):
        if p.part == 'body':
            if p.y >= rows:
                return None
            if p.face == 'front':
                if neck == 'v' and p.y <= 1 and p.x in (3, 4) or neck == 'v' and p.y == 2 and p.x in (3, 4) and False:
                    return None
                if neck == 'round' and p.y == 0 and p.x in (3, 4):
                    return None
                if neck == 'square' and p.y <= 1 and 2 <= p.x <= 5:
                    return None
        elif p.part in ARMS:
            if p.y >= sl_rows or p.face == 'bottom' and sl_rows < 12:
                return None
        else:
            return None
        k = lit(p) + tex(sk, p, amp, 'stoff')
        if folds and p.part == 'body' and p.face == 'front':
            # Falten: von den Achseln schräg zur Mitte, Bund unten
            if (p.y in (3, 4) and p.x == (1 if p.y == 3 else 2)) or (p.y in (3, 4) and p.x == (6 if p.y == 3 else 5)):
                k -= 1.0
            if p.y == rows - 2 and p.x in (2, 5):
                k -= 0.8
        if folds and p.part in ARMS and sl_rows >= 6 and p.y in (4, 5) and p.face in ('front', 'right', 'left', 'back'):
            if (p.y == 4 and p.z % 2 == 0) or (p.y == 5 and p.z % 2 == 1) or p.face == 'front' and p.y == 5:
                k -= 0.9
        c = color(p, k) if callable(color) else col(color, k, cool=cool, warm=warm)
        if pattern:
            c = pattern(p, c, k) or c
        if cuff and p.part in ARMS and p.y == sl_rows - 1:
            c = col(cuff, k - 0.3)
        if hem and p.part == 'body' and p.y == rows - 1:
            c = col(hem, k - 0.3)
        return c
    sk.paint(('body',) + ARMS, f)
    if neck in ('collar', 'high'):
        def coll(p):
            if p.part == 'body' and p.face == 'front' and p.y == 0 and p.x in (2, 3, 4, 5):
                return col(color if not callable(color) else '#ffffff', 1.0 if p.x in (2, 5) else -0.5)
            return None
        if not callable(color):
            sk.paint('body', coll)


def pants(sk, color, *, kind='jeans', amp=0.25, rows=None, belt=None, buckle='#d8b04a', cool=0.62, warm=0.12, waist=True):
    """Hose: jeans|trousers|joggers|leggings|shorts|cargo|skirt. rows = bis zu welcher Bein-Reihe (12 = ganz)."""
    rows = rows if rows is not None else {'shorts': 5, 'skirt': 7}.get(kind, 12)

    def f(p):
        if p.part in LEGS:
            if p.y >= rows:
                return None
            k = lit(p, 1.2) + tex(sk, p, amp, 'hose')
            if p.face == 'front' and p.y in (4, 5):
                k += 0.5 if p.y == 4 else -0.3  # Knie
            if kind in ('jeans', 'trousers', 'cargo', 'joggers') and p.y >= rows - 3 and rows == 12:
                if (p.y + p.x + p.z) % 3 == 0:
                    k -= 0.9  # Falten über dem Schuh
            if kind == 'jeans':
                k += 0.3 if (p.x + p.y + p.z) % 3 == 0 else 0  # Köper
                if p.side == 'outer' and p.z == 2:
                    k += 0.8  # Naht
            if kind == 'cargo' and p.side == 'outer' and 4 <= p.y <= 6 and 1 <= p.z <= 2:
                k -= 0.9 if p.y == 4 else 0.3
            if kind == 'joggers' and p.y == rows - 1:
                k -= 0.7
            return col(color, k, cool=cool, warm=warm)
        if p.part == 'body' and waist and p.y >= 10 and p.face != 'top':
            k = lit(p) + tex(sk, p, amp, 'hose') - 0.2
            if belt and p.y == 10:
                if p.face == 'front' and p.x in (3, 4):
                    return col(buckle, 0.8 if p.x == 3 else -0.3)
                return col(belt, lit(p) - 0.3)
            return col(color, k, cool=cool, warm=warm)
        return None
    sk.paint(('body',) + LEGS, f)


def shoes(sk, color, *, kind='sneaker', sole='#f2f0ea', accent=None, rows=None, lace=None):
    """Schuhe: sneaker|boot|hiking|haferl|sandal|rubber|football|combat. rows = Höhe in Reihen."""
    rows = rows or {'sneaker': 2, 'boot': 4, 'hiking': 3, 'haferl': 2, 'sandal': 1, 'rubber': 5, 'football': 2,
                    'combat': 4, 'ski': 4}[kind]

    def f(p):
        if p.y < p.h - rows and p.face != 'bottom':
            return None
        if p.face == 'bottom':
            return col(sole, -1.0)
        top = p.y == p.h - rows
        k = lit(p, 1.0) + (0.6 if top else 0)
        if p.y == p.h - 1:  # Sohle
            if kind == 'sandal':
                return col(sole, -0.6)
            return col(sole, -0.2 if p.face != 'back' else -0.6)
        if kind == 'sandal':
            return None
        c = col(color, k)
        if accent and kind in ('sneaker', 'football') and p.side == 'outer' and p.y == p.h - 2:
            c = col(accent, k)
        if kind in ('sneaker', 'hiking', 'boot', 'combat', 'football') and p.face == 'front' and lace:
            if p.y < p.h - 1 and p.x in (1, 2) and (p.y + p.x) % 2 == 0:
                c = col(lace, 0.4)
        if kind == 'rubber' and p.face == 'front' and p.x == 1 and p.y < p.h - 2:
            c = col(color, k + 1.4)  # Glanz
        if kind == 'haferl' and p.face == 'front' and p.y == p.h - 2 and p.x in (1, 2):
            c = col(color, k + 1.2)
        return c
    sk.paint(LEGS, f)
    if kind == 'sandal':
        def straps(p):
            if p.face in ('front', 'right', 'left') and p.y == p.h - 2 and (p.x + p.z) % 2 == 0:
                return col(color, lit(p))
            return None
        sk.paint(LEGS, straps)


def socks(sk, color, from_row, to_row, stripe=None, knit=True):
    def f(p):
        if not (from_row <= p.y < to_row) or p.face == 'bottom':
            return None
        k = lit(p, 1.0) + (0.5 if knit and (p.x + p.z) % 2 == 0 else -0.2)
        if stripe and p.y in stripe:
            return col(stripe[p.y], k)
        return col(color, k)
    sk.paint(LEGS, f)


# ------------------------------------------------------------------ zweite Ebene

def overlay_top(sk, color, *, open_front=True, rows=12, sleeves=10, collar=True, zipper=None, amp=0.15,
                pockets=None, hood=None, lapel=None, cool=0.62, warm=0.12, gap=(3, 4), cuff=None, trim=None,
                back=True, front_rows=None):
    """Jacke/Weste/Mantel auf der zweiten Ebene (Körper + Ärmel). hood = Farbe der Kapuze (hinten, unten)."""
    front_rows = front_rows or rows

    def f(p):
        if p.part == 'body':
            if p.y >= rows:
                return None
            if p.face == 'bottom':
                return None
            if p.face == 'top':
                return col(color, 0.8) if (p.x in (0, 1, 6, 7) or collar) else None
            if p.face == 'front':
                if p.y >= front_rows:
                    return None
                if open_front and p.x in gap:
                    return None
            if p.face == 'back' and not back:
                return None
            k = lit(p) + tex(sk, p, amp, 'jacke') + 0.3
            if p.face == 'front' and open_front and p.x in (gap[0] - 1, gap[-1] + 1):
                k -= 0.9  # Kante der Jacke
                if lapel and p.y <= 2:
                    return col(lapel, k + 0.5)
            if collar and p.y == 0 and p.face in ('front', 'right', 'left', 'back'):
                k += 0.8
            if trim and p.y == rows - 1:
                return col(trim, k)
            return col(color, k, cool=cool, warm=warm)
        if p.part in ARMS:
            if p.y >= sleeves or p.face == 'bottom':
                return None
            k = lit(p) + tex(sk, p, amp, 'jacke') + 0.3
            if p.y in (4, 5) and (p.z + p.y) % 2 == 0 and p.face != 'top':
                k -= 0.8
            if cuff and p.y == sleeves - 1:
                return col(cuff, k - 0.2)
            return col(color, k, cool=cool, warm=warm)
        return None
    sk.paint(('body',) + ARMS, f, layer=1)
    if zipper and not open_front:
        def z(p):
            if p.part == 'body' and p.face == 'front' and p.x == 3 and p.y < front_rows:
                return col(zipper, 0.5 if p.y % 2 == 0 else -0.5)
            if p.part == 'body' and p.face == 'front' and p.x == 4 and p.y < front_rows:
                return col(color, lit(p) - 0.6)
            return None
        sk.paint('body', z, layer=1)
    if pockets:
        def pk(p):
            if p.part == 'body' and p.face == 'front' and p.y in pockets['rows'] and p.x in pockets['cols']:
                if p.y == pockets['rows'][0]:
                    return col(pockets.get('color', color), lit(p) - 1.0)
                return col(pockets.get('color', color), lit(p) + 0.1)
            return None
        sk.paint('body', pk, layer=1)
    if hood:
        def hd(p):
            if p.part != 'body':
                return None
            if p.face == 'back' and p.y <= 3 and 1 <= p.x <= 6 - (p.y >= 3):
                k = 0.9 - p.y * 0.4 + (0.6 if p.y == 0 else 0)
                if p.y == 3 or p.x in (1, 6):
                    k -= 0.8
                return col(hood, k)
            if p.face == 'top':
                return col(hood, 0.6)
            if p.face in ('right', 'left') and p.y == 0:
                return col(hood, 0.2)
            return None
        sk.paint('body', hd, layer=1)


def overlay_legs(sk, color, rows, *, amp=0.15, cool=0.62, warm=0.12, start=0, front_only=False):
    def f(p):
        if not (start <= p.y < rows) or p.face in ('top', 'bottom'):
            return None
        if front_only and p.face not in ('front', 'right', 'left'):
            return None
        k = lit(p, 1.0) + tex(sk, p, amp, 'ueber') + 0.2
        return col(color, k, cool=cool, warm=warm)
    sk.paint(LEGS, f, layer=1)


def clear_layer(sk, part, faces=None):
    sk.paint(part, lambda p: 'clear' if faces is None or p.face in faces else None, layer=1)


# ------------------------------------------------------------------ Zubehör (zweite Ebene des Kopfes)

def beanie(sk, color, *, band=None, cuff_row=3, pattern=None, pom=None):
    """Mütze: bedeckt Kopf oben bis Reihe cuff_row, Umschlag in der letzten Reihe."""
    def f(p):
        if p.face == 'bottom':
            return None
        if p.face != 'top' and p.y > cuff_row:
            return None
        k = lit(p, 0.8) + (0.6 if (p.x + p.z) % 2 == 0 else -0.3) * 0.8  # Strick
        if p.face != 'top' and p.y == cuff_row:
            k = lit(p, 0.8) - 0.3 + (0.5 if (p.x + p.z) % 2 == 0 else -0.4)
            return col(band or color, k)
        if p.face == 'top' and pom and 2 <= p.x <= 5 and 2 <= p.z <= 5:
            d = abs(p.x - 3.5) + abs(p.z - 3.5)
            return col(pom, 1.5 - d * 0.5)
        c = col(color, k)
        if pattern:
            c = pattern(p, c) or c
        return c
    sk.paint('head', f, layer=1)


def cap(sk, color, *, backwards=False, bill=None, logo=None, button=None):
    """Schirmmütze: Krone über dem Kopf bis Reihe 2, Schirm als dunklerer Streifen (vorne oder hinten)."""
    bill = bill or color

    def f(p):
        if p.face == 'bottom':
            return None
        front = 'back' if backwards else 'front'
        if p.face == 'top':
            if button and p.x in (3, 4) and p.z in (3, 4):
                return col(button, 0.6)
            k = 0.8 - (0.5 if (p.x + p.z) % 4 == 0 else 0)
            if (p.z == 7 and not backwards) or (p.z == 0 and backwards):
                k -= 0.5
            return col(color, k)
        if p.y > 2:
            return None
        k = lit(p, 0.8) + 0.3
        if p.face == front and p.y == 2:
            return col(bill, -0.8)  # Schirm
        if p.face == front and logo and p.y == 1 and p.x in (3, 4):
            return col(logo, 0.6)
        if backwards and p.face == 'front' and p.y == 2 and p.x in (3, 4):
            return None  # Öffnung der Snapback
        if p.face in ('right', 'left') and p.y == 2:
            k -= 0.6
        return col(color, k)
    sk.paint('head', f, layer=1)


def headphones(sk, band, cup, accent=None, rows=(3, 7), cols=(2, 6)):
    """Kopfhörer: Bügel über den Kopf (oben, quer) und Muscheln an den Seiten."""
    def f(p):
        if p.face == 'top':
            if p.z in (3, 4):
                return col(band, 0.6 if p.z == 3 else 0.0)
            return None
        if p.face in ('right', 'left'):
            if rows[0] <= p.y <= rows[1] and cols[0] <= p.z <= cols[1]:
                rim = p.y in rows or p.z in cols
                if accent and rim:
                    return col(accent, 0.4 - (0.6 if p.y == rows[1] else 0))
                return col(cup, -0.3 + (0.9 if (p.y, p.z) == (rows[0] + 1, cols[0] + 1) else 0))
            if p.y < rows[0] and p.z in (3, 4):
                return col(band, 0.3 - p.y * 0.2)
        return None
    sk.paint('head', f, layer=1)


def glasses(sk, frame, lens=None, row=4, sun=False):
    def f(p):
        if p.face == 'front' and p.y == row:
            if p.x in (1, 2, 5, 6):
                if sun:
                    return col(lens or '#202430', 0.8 if p.x in (1, 5) else -0.3)
                return 'keep'
            if p.x in (0, 3, 4, 7):
                return col(frame, 0.2 if p.x in (3, 4) else -0.3)
        if p.face == 'front' and p.y in (row - 1, row + 1) and p.x in (1, 2, 5, 6) and not sun:
            return col(frame, 0.0 if p.y == row - 1 else -0.6)
        if p.face == 'front' and sun and p.y == row - 1 and p.x in (0, 1, 2, 5, 6, 7):
            return col(frame, 0.3)
        if p.face in ('right', 'left') and p.y == row and p.z >= 4:
            return col(frame, -0.2)
        return None
    sk.paint('head', lambda p: None if f(p) == 'keep' else f(p), layer=1)


def hex_or(c, d):
    return hexrgb(c) if c else hexrgb(d)
