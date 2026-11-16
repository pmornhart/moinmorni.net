#!/usr/bin/env python3
"""Eigene Skins für die Darsteller der Trailer (Pixelkunst, mit festen Startwerten – jeder Lauf gibt dieselben Bilder).

Achtzehn Figuren – je eine für die neun Standard-Skins von Minecraft in breit („wide“, Arme 4 Bildpunkte) und schmal
(„slim“, Arme 3). Sie ersetzen nur im Aufnahme-Client über ein lokales Ressourcenpaket die Standard-Skins: Darsteller
ohne Konto (offline) bekommen ihren Standard-Skin aus der UUID – und damit unsere Figur (siehe README, actors.json).

  python3 skins.py png                      # png/<modell>/<name>.png + figuren.json schreiben
  python3 skins.py paket [ordner]           # Ressourcenpaket bauen (Standard /home/user/mm-cache/trailer/skins-paket)
  python3 skins.py vorschau <bild.png>      # 3D-Vorschau aller 18 (ohne Minecraft)

Alles hier ist eigene Pixelkunst – keine Vorlagen, keine Kopien bestehender Skins, Figuren oder Marken.
"""
import json, os, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit import Skin, shade, mix, noise, ARMS, LEGS, PARTS  # noqa: E402
from teile import (lit, q, tex, col, skin_all, hands, face, beard, hair, long_back, top_wear, pants, shoes,  # noqa: E402
                   socks, overlay_top, overlay_legs, beanie, cap, headphones, glasses, face_map, face_pal, strand)

FIGUREN = []


def figur(model, texture, ident, seed, text):
    def reg(fn):
        FIGUREN.append({'model': model, 'texture': texture, 'id': ident, 'seed': seed, 'beschreibung': text, 'fn': fn})
        return fn
    return reg


def braid(sk, part, face, x, y0, y1, color, layer=1, ribbon=None):
    """Zopf (2 Bildpunkte breit) senkrecht auf einer Fläche, geflochtenes Muster."""
    for y in range(y0, y1):
        a, b = (1, -1) if y % 2 == 0 else (-1, 1)
        sk.put(part, face, x, y, shade(color, a - (0 if y < y1 - 2 else 1)), layer)
        sk.put(part, face, x + 1, y, shade(color, b - (0 if y < y1 - 2 else 1)), layer)
    if ribbon:
        sk.put(part, face, x, y1, ribbon, layer)
        sk.put(part, face, x + 1, y1, shade(ribbon, -1), layer)


# ======================================================================== Figuren

def braid(sk, part, face_, x, y0, y1, color, layer=1, ribbon=None):
    """Zopf (2 Bildpunkte breit) senkrecht auf einer Fläche: schräg geflochtene Glieder in drei Tönen."""
    seq = ((1, 0), (0, -1), (-1, 1))
    for y in range(y0, y1):
        a, b = seq[(y - y0) % 3]
        d = -1 if y >= y1 - 1 else 0
        sk.put(part, face_, x, y, shade(color, a + d), layer)
        sk.put(part, face_, x + 1, y, shade(color, b + d), layer)
    if ribbon:
        sk.put(part, face_, x, y1, ribbon, layer)
        sk.put(part, face_, x + 1, y1, shade(ribbon, -1), layer)


def braid_band(sk, color, row, faces=('front', 'right', 'left', 'back')):
    """Geflochtener Kranz um den Kopf (zweite Ebene) in einer Reihe."""
    def f(p):
        if p.face in faces and p.y == row:
            s = p.x if p.face in ('front', 'back') else p.z
            return shade(color, (1, 0, -1)[s % 3])
        return None
    sk.paint('head', f, layer=1)


@figur('slim', 'zuri', 'resi', 101, 'Dirndl: grünes Mieder, hellblaue Schürze, roter Rock, blonder Zopfkranz und zwei Zöpfe')
def resi(sk):
    T, H = '#f2c9a6', '#dcae4a'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 3 if z >= 4 else 6, back=7, over_side=1, over_back=3, gloss=1.0)
    pal = face_pal(T, H, '#3f7fd6', lips='#d8737d', lash='#5a3a22')
    face_map(sk, ["HLHHhHLH",
                  "hHSSSSHh",
                  "sSSSSSSd",
                  "sllsslld",
                  "swissiwd",
                  "scssdscd",
                  "sssmMssd",
                  "dsssssdd"], pal)
    braid_band(sk, H, 0)
    # Knoten hinten
    face_map(sk, ["________", "________", "________", "__hHHh__", "_hLPLHh_", "_hHLHHh_", "__hhhh__", "________"],
             face_pal(T, H, '#000000'), face_='back', layer=1)
    GREEN, RED, APRON, WHITE = '#2f6b3a', '#a5283a', '#7db6dc', '#f4f0e6'

    def body(p):
        if p.part != 'body' or p.face == 'top':
            return None
        k = lit(p)
        if p.face == 'front':
            if p.y <= 1 and 2 <= p.x <= 5:
                return col(WHITE, k + (0.7 if p.y == 1 and p.x % 2 == 0 else 0.2))  # Bluse mit Spitze
            if p.y == 9:
                return col(APRON, k - 0.3)
            if p.y >= 10:
                return col(APRON if 1 <= p.x <= 6 else RED, k)
            if p.x in (3, 4) and 3 <= p.y <= 8:  # Schnürung: Silberösen und Bänder
                return col('#d6d8de', 1.2 if p.x == 3 else 0.4) if p.y % 2 == 1 else col(GREEN, k - 1.4)
            if p.y == 2:
                return col(RED, k + 0.3)  # Borte oben am Mieder
            return col(GREEN, k)
        if p.y == 9:
            return col(APRON, k - 0.3)
        if p.y >= 10:
            return col(RED, k)
        return col(GREEN, k - (0.7 if p.face == 'back' and p.x in (2, 5) else 0))
    sk.paint('body', body)

    def arms(p):
        if p.y > 2 or p.face == 'bottom':
            return None
        if p.y == 2:
            return col(RED, lit(p) + 0.2)  # Bändchen am Puffärmel
        return col(WHITE, lit(p) + (1.0 if p.y == 0 else 0.0) + (0.5 if (p.x + p.z) % 2 == 0 else -0.3))
    sk.paint(ARMS, arms)

    def legs(p):
        if p.face == 'bottom':
            return None
        k = lit(p, 1.0)
        if p.y <= 6:
            if p.face == 'front':
                if p.y == 6:
                    return col(WHITE, k + 0.6)  # Spitze am Saum
                return col(APRON, k + (0.6 if (p.x + 2 * p.y) % 5 == 0 else 0))
            return col(RED, k - (0.7 if p.y == 6 else 0))
        if p.y <= 9:
            return col(WHITE, k + (0.5 if (p.x + p.z) % 2 == 0 else -0.2))  # Strümpfe
        return None
    sk.paint(LEGS, legs)
    shoes(sk, '#2a2224', kind='haferl', sole='#3a2c24')
    sk.put('rleg', 'front', 1, 10, '#c9ccd4')
    sk.put('lleg', 'front', 2, 10, '#c9ccd4')
    overlay_legs(sk, RED, 6, amp=0.1)

    def apron_o(p):
        if p.face == 'front' and p.y <= 5:
            return col(APRON, lit(p, 1.0) + 0.4 + (0.6 if (p.x + 2 * p.y) % 5 == 0 else 0))
        return None
    sk.paint(LEGS, apron_o, layer=1)
    braid(sk, 'body', 'front', 0, 0, 6, H, ribbon=RED)
    braid(sk, 'body', 'front', 6, 0, 6, H, ribbon=RED)
    sk.put('body', 'front', 2, 4, '#ffffff')   # Edelweiß-Anstecker
    sk.put('body', 'front', 2, 5, '#f2d64b')


@figur('wide', 'steve', 'sepp', 102, 'Lederhose, rot-weiß kariertes Hemd, Hosenträger mit Stickerei, Trachtenhut mit Gamsbart')
def sepp(sk):
    T, H = '#e3ad85', '#4b2f1d'
    skin_all(sk, T)
    hair(sk, H, back=6, over_side=0, over_back=0, top=True, gloss=0.6)
    pal = face_pal(T, H, '#4a7a3a', beard_c='#5a3a24')
    face_map(sk, ["hHHHHHHh",
                  "HhHHHhHH",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "gssdssgd",
                  "ggsMMsgd",
                  "dgggggdd"], pal)
    beard(sk, '#5a3a24', 'stubble')
    RED, WHITE, LEATHER = '#c4323b', '#f3efe6', '#7a4a28'

    def check(p, c, k):  # Karo: 2 Bildpunkte breite rote Streifen, Kreuzungen dunkler
        X = p.X + 8 if p.face in ('front', 'back', 'top', 'bottom') else p.Z + 8
        v = int(X) % 4 < 2
        h = int(p.Y) % 4 < 2
        if v and h:
            return col(RED, k - 0.4)
        if v or h:
            return col(mix(RED, WHITE, 0.35), k)
        return col(WHITE, k)
    top_wear(sk, WHITE, sleeves='elbow', neck='collar', pattern=check, amp=0.0)
    hands(sk, T, rows=7)

    def braces(p):
        if p.part != 'body' or p.face in ('top', 'bottom') or p.y >= 10:
            return None
        k = lit(p) - 0.3
        if p.face == 'front':
            if p.y in (4, 5) and 1 <= p.x <= 6:
                if p.x in (3, 4):
                    return col('#f1efe6' if p.y == 4 else '#3f8a4a', 0.8 if p.y == 4 else 0.2)  # Edelweiß-Stickerei
                return col(LEATHER, k + 0.5)
            if p.x in (1, 6):
                return col(LEATHER, k + (0.7 if p.x == 1 else 0))
        if p.face == 'back' and (p.x in (2, 5) or p.y == 3 and 2 <= p.x <= 5):
            return col(LEATHER, k)
        return None
    sk.paint('body', braces)

    def lederhose(p):
        if p.part == 'body':
            if p.y < 10 or p.face in ('top', 'bottom'):
                return None
            if p.face == 'front' and p.y == 10 and p.x in (2, 5):
                return col('#e8dcc2', 0.6)  # Hirschhorn-Knöpfe
            return col(LEATHER, lit(p) - 0.1)
        if p.y > 4 or p.face in ('bottom', 'top'):
            return None
        k = lit(p, 1.0) + tex(sk, p, 0.4, 'l')
        if p.y == 4:
            return col('#3f6b3a', k)  # grüner Saum
        if p.face == 'front' and p.y <= 1 and ((p.part == 'rleg' and p.x == 3) or (p.part == 'lleg' and p.x == 0)):
            return col('#3f8a4a', k + 0.6)  # Stickerei am Latz
        if p.side == 'outer' and p.z == 2:
            return col(LEATHER, k + 1.0)  # helle Naht
        return col(LEATHER, k)
    sk.paint(('body',) + LEGS, lederhose)
    socks(sk, '#c8c0ad', 6, 10)
    shoes(sk, '#4a2e1c', kind='haferl', sole='#2a1d14')
    FELT = '#3f5b36'

    def hat(p):
        if p.face == 'bottom':
            return None
        if p.face == 'top':
            return col(FELT, 0.9 - (0.7 if p.x in (3, 4) and 2 <= p.z <= 5 else 0))  # Kniff oben
        if p.y > 2:
            return None
        if p.y == 2:
            return shade('#c0392b' if (p.x + p.z) % 2 == 0 else '#f2efe9', -0.0 if p.face != 'back' else -1)
        if p.face == 'left' and p.z in (1, 2):
            return shade('#8a8f96' if p.y == 0 else '#4f5156', 1)  # Gamsbart
        return col(FELT, lit(p, 0.8) + 0.4 - p.y * 0.5)
    sk.paint('head', hat, layer=1)
    for a in ARMS:  # aufgekrempelte Ärmel
        sk.paint(a, lambda p: col(WHITE, lit(p) + 0.9) if p.y == 5 and p.face not in ('top', 'bottom') else None, layer=1)


@figur('wide', 'ari', 'jayden', 103, 'Schwarzer Hoodie mit grünen Kordeln und Berg-Aufdruck, Kopfhörer, Locken')
def jayden(sk):
    T, H = '#7b4b33', '#1c1613'
    skin_all(sk, T)
    hair(sk, H, back=5, side=lambda z: 5 if z <= 2 else 3 if z <= 4 else 2, over_side=2, over_back=4, gloss=0.6)
    curls = lambda p: col(H, 1.2 if (p.x * 2 + p.y + p.z) % 3 == 0 else -0.3 if (p.x + p.z) % 2 else 0.3) \
        if sk.get(p)[3] else None
    sk.paint('head', lambda p: curls(p) if p.face == 'top' else None, layer=1)
    pal = face_pal(T, H, '#3a2316', lips='#5e3328', white='#efe9e2')
    face_map(sk, ["KhKKhKhK",
                  "hKhhKhKh",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "sssdsssd",
                  "ssmMMmsd",
                  "dsssssdd"], pal)
    face_map(sk, ["hK_KhK_K", "________", "________", "________", "________", "________", "________", "________"], pal, layer=1)
    HOOD, NEON = '#2b2c33', '#3ddc84'

    def logo(p, c, k):
        if p.part == 'body' and p.face == 'front':
            m = {(4, 3): 'P', (3, 4): 'W', (4, 4): 'W', (5, 4): 'W', (2, 5): 'G', (3, 5): 'G', (4, 5): 'G', (5, 5): 'G', (6, 5): 'G'}
            if (p.x, p.y) in m:
                return {'P': shade('#ffffff', 0), 'W': shade('#e9e9e9', 0), 'G': shade(NEON, -1)}[m[(p.x, p.y)]]
            if 8 <= p.y <= 9 and 1 <= p.x <= 6:  # Bauchtasche
                return col(HOOD, k + (-1.0 if p.y == 8 or p.x in (1, 6) else 0.4))
        return None
    top_wear(sk, HOOD, sleeves='long', neck='round', pattern=logo, amp=0.15, cuff='#1f2025', hem='#1f2025')
    hands(sk, T, rows=2)
    for y in (1, 2, 3):
        sk.put('body', 'front', 3, y, shade(NEON, 0 if y < 3 else -1))
    for y in (1, 2):
        sk.put('body', 'front', 5, y, shade(NEON, -1 if y < 2 else -2))
    pants(sk, '#5d6169', kind='joggers', amp=0.15, rows=10)
    shoes(sk, '#eeeeee', kind='sneaker', sole='#2b2b2f', accent=NEON, lace='#ffffff')
    overlay_top(sk, HOOD, open_front=False, rows=0, sleeves=0, collar=False, hood=shade(HOOD, 1))
    headphones(sk, '#2a2d34', '#17181c', accent=NEON)


@figur('slim', 'alex', 'lena', 104, 'Rote lange Haare, Sommersprossen, cremefarbener Pulli, olivgrüner Parka mit Fellkapuze')
def lena(sk):
    T, H = '#f7dbc7', '#c4542a'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 8, back=8, over_side=lambda z: 6 if z <= 5 else 3, over_back=8, gloss=1.1,
         cool=0.98, warm=0.1)
    pal = face_pal(T, H, '#3f8f5a', lips='#d17a73', lash='#6a2e16')
    face_map(sk, ["HHLHHHLH",
                  "LHHHHhHH",
                  "HHhhSSSh",
                  "Hllsslld",
                  "Hwissiwh",
                  "Hcfsdfch",
                  "hssmMsdh",
                  "hdssssdh"], pal)
    face_map(sk, ["LHHLHHPH",
                  "HHHHh__H",
                  "HHh____H",
                  "H______H",
                  "H______h",
                  "h______h",
                  "________",
                  "________"], pal, layer=1)
    top_wear(sk, '#ece1cc', sleeves='long', neck='high', amp=0.0,
             pattern=lambda p, c, k: col('#ece1cc', k + (0.4 if p.x % 2 == 0 else -0.2)))
    hands(sk, T)
    pants(sk, '#2d4270', kind='jeans', rows=8)
    shoes(sk, '#6f4526', kind='boot', sole='#2c1d14', rows=4)
    PARKA = '#6b7a3c'
    overlay_top(sk, PARKA, open_front=True, rows=12, sleeves=10, gap=(2, 3, 4, 5), hood='#d6c4a1',
                pockets={'rows': (8, 9), 'cols': (0, 1, 6, 7)}, cuff=shade(PARKA, -1))
    overlay_legs(sk, PARKA, 3)
    long_back(sk, H, to_y=15, cool=0.98, warm=0.1)


def scarf_k(p):
    """Falten in Tüchern: schräge dunklere Linien."""
    return -0.8 if (p.x + p.y + p.z) % 4 == 0 else 0.2 if (p.x + p.y + p.z) % 4 == 2 else 0


@figur('slim', 'ari', 'mia', 105, 'Rosa Hoodie, weiße Kopfhörer, schwarzer Bob mit Pony, graue Jogginghose')
def mia(sk):
    T, H = '#d9a27e', '#231d22'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 7, back=7, over_side=lambda z: 6 if z <= 4 else 2, over_back=6, gloss=1.3,
         cool=0.66, warm=0.66)
    pal = face_pal(T, H, '#4a2c1a', lips='#c76d6f', lash='#140f12')
    pal['L'] = shade('#3a3f5c', 0)   # bläulicher Glanz im Schwarz
    pal['P'] = shade('#4c5578', 0)
    face_map(sk, ["HLHHPHHL",
                  "HHHHHHHH",
                  "hHhHHhHh",
                  "Hllsslld",
                  "Hwissiwh",
                  "Hcssdsch",
                  "hssmMssh",
                  "dsssssdd"], pal)
    face_map(sk, ["LHHPHHLH",
                  "HHHHHHHH",
                  "h_h__h_h",
                  "H______H",
                  "H______H",
                  "h______h",
                  "h______h",
                  "________"], pal, layer=1)
    PINK = '#f2a3bf'

    def print_(p, c, k):
        if p.part == 'body' and p.face == 'front':
            star = {(3, 3): 1, (4, 3): 1, (2, 4): 1, (3, 4): 1, (4, 4): 1, (5, 4): 1, (3, 5): 1, (4, 5): 1}
            if (p.x, p.y) in star:
                return shade('#ffffff', 0 if p.y < 5 else -1)
            if 8 <= p.y <= 9 and 1 <= p.x <= 6:
                return col(PINK, k + (-1.0 if p.y == 8 or p.x in (1, 6) else 0.4))
        return None
    top_wear(sk, PINK, sleeves='long', neck='round', pattern=print_, amp=0.1, cuff=shade(PINK, -1), hem=shade(PINK, -1))
    hands(sk, T)
    for y in (1, 2, 3):
        sk.put('body', 'front', 3, y, '#f7f7f7')
        sk.put('body', 'front', 4, y, '#e6e6e6' if y < 3 else '#cfcfcf')
    pants(sk, '#b9bdc6', kind='joggers', rows=10)
    shoes(sk, '#f4f4f4', kind='sneaker', sole='#e9e3dc', accent=PINK, lace='#ffffff')
    overlay_top(sk, PINK, open_front=False, rows=0, sleeves=0, collar=False, hood=shade(PINK, 0))
    headphones(sk, '#f2f2f2', '#fbfbfb', accent=PINK, rows=(3, 6), cols=(2, 5))


@figur('slim', 'efe', 'amara', 106, 'Gelber Regenmantel, Afro-Puffs, schwarze Leggings, blaue Gummistiefel')
def amara(sk):
    T, H = '#5c3a27', '#1d1512'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 2, back=3, over_side=0, over_back=0, gloss=0.4)
    pal = face_pal(T, H, '#2e1a10', lips='#6e3a2e', lash='#0d0907', white='#f1ebe3')
    face_map(sk, ["KhKhhKhK",
                  "hSSSSSSh",
                  "SSSSSSSs",
                  "sllsslld",
                  "swissiwd",
                  "sssdsssd",
                  "ssmMMmsd",
                  "dsssssdd"], pal)

    def puffs(p):  # zwei Afro-Puffs oben rechts und links
        def coil(k):
            return col(H, k + (0.9 if (p.x * 2 + p.y + p.z * 3) % 5 == 0 else -0.2 if (p.x + p.z) % 2 else 0.3))
        if p.face == 'top':
            for cx in (1.5, 6.5):
                if (p.x - cx) ** 2 + (p.z - 3.5) ** 2 <= 5.5:
                    return coil(0.6)
            return None
        if p.face == 'front' and p.y <= 1 and (p.x <= 2 or p.x >= 5):
            return coil(0.2 - p.y * 0.5)
        if p.face in ('right', 'left') and p.y <= 1 and 1 <= p.z <= 6:
            return coil(0.0 - p.y * 0.5)
        if p.face == 'back' and p.y <= 0 and (p.x <= 2 or p.x >= 5):
            return coil(-0.3)
        return None
    sk.paint('head', puffs, layer=1)
    for f_ in ('right', 'left'):  # goldene Kreolen
        sk.put('head', f_, 3 if f_ == 'right' else 4, 6, '#e8b93e')
    top_wear(sk, '#2d3b6b', sleeves='long', neck='round', amp=0.1)
    hands(sk, T)
    pants(sk, '#25252c', kind='leggings', amp=0.05, rows=7)
    shoes(sk, '#2f4a8a', kind='rubber', sole='#1b2440', rows=5)
    YEL = '#f4c430'
    overlay_top(sk, YEL, open_front=False, rows=12, sleeves=10, collar=True, cuff=shade(YEL, -1),
                pockets={'rows': (8, 9), 'cols': (0, 1, 6, 7)}, hood=shade(YEL, 0))
    for y in (2, 5, 8):  # Knebelknöpfe
        sk.put('body', 'front', 3, y, '#3a2a1a', layer=1)
        sk.put('body', 'front', 4, y, '#5a4430', layer=1)
    overlay_legs(sk, YEL, 2)


@figur('slim', 'kai', 'kiki', 107, 'Schwarze Lederjacke mit Nieten, Undercut in Türkis und Pink, zerrissene Jeans, Stiefel')
def kiki(sk):
    T, H = '#f2d3c4', '#35c1bd'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 1, back=2, over_side=lambda z: 0, over_back=1, gloss=1.2, cool=0.6, warm=0.5)
    # ausrasierte Seite (rechts) und Hinterkopf: Stoppeln
    def shaved(p):
        if (p.face in ('right', 'back') and 1 <= p.y <= 5) or (p.face == 'left' and 2 <= p.y <= 4 and p.z <= 3):
            return mix(sk.get(p)[:3], '#2a2a2e', 0.35)
        return None
    sk.paint('head', shaved)
    PINK = '#ff6fae'

    def swoop(p):  # lange Strähnen oben, nach links (Figur) gekämmt, Spitzen pink
        if p.face == 'top':
            return col(H if p.x < 5 else PINK, 1.0 + (0.8 if (p.x + p.z) % 3 == 0 else 0))
        if p.face == 'left' and p.y <= 2 + (1 if p.z >= 4 else 0):
            return col(PINK, 0.4 - p.y * 0.5)
        if p.face == 'front' and p.y <= 1:
            return col(H if p.x < 4 else PINK, 0.8 - p.y * 0.6)
        if p.face == 'front' and p.y == 2 and p.x >= 5:
            return col(PINK, -0.2)
        if p.face == 'back' and p.y <= 1 and p.x <= 4:
            return col(PINK if p.x <= 2 else H, 0.2)
        return None
    sk.paint('head', swoop, layer=1)
    pal = face_pal(T, H, '#6f8fa8', lips='#8a4a5a', lash='#121214', extra={'x': '#d9dde3'})
    pal['h'] = shade('#2a2a2e', 0)
    face_map(sk, ["HHLPLHHH",
                  "HHHLHHHh",
                  "hhSSSSSs",
                  "sllsslld",
                  "swissiwd",
                  "sssxdssd",
                  "sssmMssd",
                  "dsssssdd"], pal)
    sk.put('head', 'right', 3, 4, '#d9dde3')
    sk.put('head', 'right', 3, 5, '#d9dde3')

    def tee(p, c, k):
        if p.part == 'body' and p.face == 'front' and (p.x, p.y) in ((4, 3), (3, 4), (4, 4), (3, 5), (2, 6)):
            return shade('#e23b3b', 0)  # eigener Blitz-Aufdruck
        return None
    top_wear(sk, '#e9e4dc', sleeves='short', neck='round', pattern=tee, amp=0.05)

    def jeans(p):
        if p.part in LEGS and p.y < 9:
            k = lit(p, 1.2) + (0.4 if (p.x + p.y + p.z) % 3 == 0 else 0)
            if p.face == 'front' and p.y in (4, 5) and p.x in (1, 2):
                return col(T, -0.3 if p.y == 4 else 0.2)  # Risse am Knie
            if p.face == 'front' and p.y in (4, 6) and p.x in (0, 3):
                return col('#e9e4dc', -0.5)  # Fäden
            return col('#2b2b31', k)
        if p.part == 'body' and p.y >= 10 and p.face != 'top':
            if p.y == 10:
                return col('#3a3a3a', lit(p)) if p.x not in (3, 4) else col('#c9ccd2', 1)
            return col('#2b2b31', lit(p))
        return None
    sk.paint(('body',) + LEGS, jeans)
    sk.put('body', 'front', 6, 11, '#c9ccd2')  # Kette
    sk.put('body', 'left', 1, 11, '#c9ccd2')
    shoes(sk, '#1d1d20', kind='combat', sole='#111111', lace='#4a4a50', rows=4)
    LEATHER = '#1f1f24'
    overlay_top(sk, LEATHER, open_front=True, rows=11, sleeves=10, gap=(2, 3, 4, 5), lapel='#33333a',
                cuff=shade(LEATHER, 1), amp=0.05)
    for f_, xs in (('front', (1, 6)), ('back', (1, 3, 5))):  # Nieten
        for x in xs:
            sk.put('body', f_, x, 0, '#d9dde3', layer=1)
    for a in ARMS:
        sk.paint(a, lambda p: shade('#d9dde3', 0) if p.face == 'top' and (p.x + p.z) % 2 == 0 else None, layer=1)
    # eigener Aufnäher hinten: Stern
    for x, y in ((3, 3), (4, 3), (2, 4), (3, 4), (4, 4), (5, 4), (3, 5), (4, 5)):
        sk.put('body', 'back', x, y, '#ff6fae' if y == 4 else '#ffd84a', layer=1)


@figur('slim', 'makena', 'yasmin', 108, 'Fliederfarbenes Kopftuch, cremefarbene lange Strickjacke, langer dunkelblauer Rock')
def yasmin(sk):
    T, Q = '#c99070', '#a68bd1'
    skin_all(sk, T)

    def scarf(p):
        if p.face == 'front':
            return None
        k = lit(p, 0.8) + scarf_k(p)
        return col(Q, k + 0.2)
    sk.paint('head', scarf)
    pal = face_pal(T, '#2a1d17', '#3b2316', lips='#b35e64', lash='#120c0a',
                   extra={'Q': shade(Q, 0), 'q': shade(Q, -1), 'O': shade(Q, 1), 'o': shade(Q, -2)})
    face_map(sk, ["OQQOQQQq",
                  "QqQQQQqq",
                  "QSSSSSSq",
                  "Qllsslld",
                  "Qwissiwq",
                  "Qcssdscq",
                  "qssmMssq",
                  "qqdssdqo"], pal)
    face_map(sk, ["OQQOQQOQ",
                  "Q______q",
                  "Q______q",
                  "q______q",
                  "q______q",
                  "q______q",
                  "q______o",
                  "qq____qo"], pal, layer=1)
    sk.paint('head', lambda p: None if p.face in ('front', 'bottom') else col(Q, lit(p, 0.8) + 0.6 + scarf_k(p)), layer=1)
    sk.put('head', 'left', 1, 2, '#e8c34a', layer=1)  # Nadel
    TEAL = '#2f8a8a'
    top_wear(sk, TEAL, sleeves='long', neck='round', amp=0.05)
    hands(sk, T)
    SKIRT = '#2b3556'
    pants(sk, SKIRT, kind='trousers', amp=0.05, rows=11)
    shoes(sk, '#f0eee9', kind='sneaker', sole='#d9d3cb', rows=1)
    CREAM = '#e9dfcf'
    overlay_top(sk, CREAM, open_front=True, rows=12, sleeves=10, gap=(2, 3, 4, 5), amp=0.0,
                cuff=shade(CREAM, -1), pockets={'rows': (8, 9), 'cols': (0, 1, 6, 7)})
    sk.paint(('body',) + ARMS, lambda p: col(CREAM, lit(p) + (0.5 if p.x % 2 == 0 else -0.2)) if sk.get(p)[3] and p.face in ('front', 'back') and (p.part != 'body' or p.y < 8) else None, layer=1)
    overlay_legs(sk, CREAM, 4)
    overlay_legs(sk, SKIRT, 11, start=4)

    def drape(p):  # Tuch fällt über die Schultern
        if p.y > 2 or p.face == 'bottom':
            return None
        if p.face == 'front' and 2 <= p.x <= 5 and p.y >= 1:
            return None
        return col(Q, lit(p) + 0.6 - p.y * 0.4 + scarf_k(p))
    sk.paint('body', drape, layer=1)


@figur('slim', 'noor', 'lotte', 109, 'Lila Trainingsanzug mit mintgrüner Paspel, hoher Pferdeschwanz, Stirnband')
def lotte(sk):
    T, H = '#e8b892', '#5b3a24'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 3 if z <= 3 else 2, back=7, over_side=1, over_back=3, gloss=1.2)
    pal = face_pal(T, H, '#4a86c8', lips='#d27b78', lash='#2a1a10', extra={'W': '#f5f5f5', 'V': '#4fe0c0'})
    face_map(sk, ["HLHHLHHL",
                  "HHHHHHHH",
                  "SSSSSSSs",
                  "sllsslld",
                  "swissiwd",
                  "scssdscd",
                  "sssmMssd",
                  "dsssssdd"], pal)
    # Stirnband (zweite Ebene, Reihe 1) und Pferdeschwanz
    sk.paint('head', lambda p: (shade('#4fe0c0', 0) if (p.x + p.z) % 4 == 0 else shade('#f5f5f5', -0.0 if p.face != 'back' else -1))
             if p.face in ('front', 'right', 'left', 'back') and p.y == 1 else None, layer=1)
    for y in range(0, 8):
        for x in (3, 4):
            sk.put('head', 'back', x, y, shade(H, (1 if (x + y) % 3 == 0 else 0) - (1 if y > 5 else 0)), layer=1)
    for y in range(0, 6):
        for x in (3, 4):
            sk.put('body', 'back', x, y, shade(H, (1 if (x + y) % 3 == 1 else -0.0) - (1 if y >= 4 else 0)), layer=1)
    PURPLE, MINT = '#6a3fb3', '#4fe0c0'

    def piping(p, c, k):
        if p.part in ARMS and p.side == 'outer' and p.z == 2:
            return shade(MINT, 0)
        if p.part == 'body' and p.face in ('right', 'left') and p.z == 2:
            return shade(MINT, -1)
        if p.part == 'body' and p.face == 'front' and p.x == 3:
            return shade('#e9e4f2', 0 if p.y % 2 else -1)  # Reißverschluss
        if p.part == 'body' and p.face == 'front' and p.y == 0 and p.x in (2, 5):
            return shade('#f5f5f5', 0)
        return None
    top_wear(sk, PURPLE, sleeves='long', neck='high', pattern=piping, amp=0.05, cuff=shade(PURPLE, -1), hem=shade(PURPLE, -1))
    hands(sk, T)
    pants(sk, PURPLE, kind='joggers', amp=0.05, rows=10)
    sk.paint(LEGS, lambda p: shade(MINT, 0) if p.side == 'outer' and p.z == 2 and p.y < 10 else None)
    shoes(sk, '#ff6b5a', kind='sneaker', sole='#f7f3ee', accent='#ffffff', lace='#ffffff')


@figur('slim', 'steve', 'jule', 110, 'Hellblaue Skijacke, rote Strickmütze mit Muster, Skibrille, dunkle Skihose')
def jule(sk):
    T, H = '#f3d1b6', '#a26f3d'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 8, back=8, over_side=0, over_back=0, gloss=0.8)
    pal = face_pal(T, H, '#3f9a6a', lips='#d47374', lash='#3a2412', blush='#ff8f9a')
    face_map(sk, ["HHHHHHHH",
                  "HHHHHHHH",
                  "HhSSSShH",
                  "Hllsslll",
                  "Hwissiwh",
                  "Hcssdsch",
                  "hssmMssh",
                  "hdssssdh"], pal)
    sk.put('head', 'front', 7, 3, pal['h'])
    RED = '#d23a3a'

    def pattern(p, c):
        if p.face != 'top' and p.y == 1:
            return shade('#f4f4f4', 0) if (p.x + p.z) % 3 != 1 else shade(RED, -1)
        return None
    beanie(sk, RED, band=shade(RED, -1), cuff_row=2, pattern=pattern)
    for (x, z), k in {(3, 3): 1, (4, 3): 0, (3, 4): 0, (4, 4): -1}.items():  # Bommel
        sk.put('head', 'top', x, z, shade('#f4f4f4', k), 1)

    def goggles(p):  # Skibrille auf der Mütze: Gläser vorne, Band rundum
        if p.face == 'front' and p.y == 1:
            if p.x in (0, 7):
                return shade('#1c1c22', 0)
            return shade('#ff9a3c' if p.x in (1, 2, 5, 6) else '#b85aa8', 1 if p.x in (1, 5) else 0)
        if p.face in ('right', 'left', 'back') and p.y == 1:
            return shade('#1c1c22', 0)
        return None
    sk.paint('head', goggles, layer=1)
    BLUE, WHITE, NAVY = '#7cc6ef', '#f2f6fa', '#25314f'

    def ski(p, c, k):
        if p.part == 'body' and p.y <= 2 or p.part in ARMS and p.y <= 2:
            return col(WHITE, k)
        if p.part == 'body' and p.face == 'front' and p.x == 3:
            return shade('#d4d9e2', 0 if p.y % 2 else -1)
        if p.part == 'body' and p.y == 3 or p.part in ARMS and p.y == 3:
            return col(NAVY, k)
        return None
    top_wear(sk, BLUE, sleeves='long', neck='high', pattern=ski, amp=0.05, cuff=NAVY)
    sk.paint(ARMS, lambda p: col(NAVY, lit(p) - 0.2) if p.y >= 10 else None)  # Handschuhe
    pants(sk, NAVY, kind='trousers', amp=0.05)
    shoes(sk, '#8a5a36', kind='boot', sole='#2b2420', rows=4)
    sk.paint(LEGS, lambda p: col('#efe8dc', 0.6 + (0.5 if (p.x + p.z) % 2 else -0.3)) if p.y == 8 and p.face != 'bottom' else None)
    overlay_top(sk, BLUE, open_front=False, rows=1, sleeves=0, collar=True, amp=0.0)


@figur('slim', 'sunny', 'ella', 111, 'Hellblaues Sommerkleid mit Blumen, Sonnenbrille, blonde Wellen, Sandalen')
def ella(sk):
    T, H = '#ecb894', '#e9c56b'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 8, back=8, over_side=lambda z: 7 if z <= 5 else 4, over_back=8, gloss=1.2)
    pal = face_pal(T, H, '#3f86b8', lips='#d0706f', lash='#5a3a1a')
    face_map(sk, ["LHPHLHHL",
                  "HLHHHHLH",
                  "HHhSSShH",
                  "Hssssssh",
                  "Hwissiwh",
                  "Hcssdsch",
                  "hssmMssh",
                  "hdssssdh"], pal)
    face_map(sk, ["LHPHLHHL",
                  "HLHHHH_H",
                  "HHh____H",
                  "H______H",
                  "H______H",
                  "h______h",
                  "h______h",
                  "h______h"], pal, layer=1)
    glasses(sk, '#c99a3a', lens='#2a2f3a', row=4, sun=True)
    for xy, c in (((5, 1), '#ff6f61'), ((5, 2), '#ffd84a'), ((6, 1), '#ff6f61')):  # Blume im Haar
        sk.put('head', 'left', xy[0] - 4, xy[1], c, layer=1)
    long_back(sk, H, to_y=13)
    SKY = '#8cc8ec'

    def flowers(p, c, k):
        if (p.x * 3 + p.y * 2 + p.z) % 7 == 0:
            return shade('#ffffff', 0)
        if (p.x * 3 + p.y * 2 + p.z) % 7 == 3:
            return shade('#ffb3c7', 0)
        return None

    def dress(p):
        if p.part == 'body':
            if p.face == 'top' or p.face == 'bottom':
                return None
            if p.y <= 1 and p.face == 'front' and p.x not in (1, 6):
                return None  # Ausschnitt / Träger
            if p.y == 0 and p.face == 'back' and p.x not in (1, 6):
                return None
            if p.y == 6:
                return col('#ffffff', lit(p) + 0.4)  # Band an der Taille
            k = lit(p)
            return flowers(p, None, k) or col(SKY, k)
        if p.part in LEGS and p.y <= 4 and p.face != 'bottom':
            k = lit(p, 1.0)
            if p.y == 4:
                return col(SKY, k - 0.6)
            return flowers(p, None, k) or col(SKY, k)
        return None
    sk.paint(('body',) + LEGS, dress)
    overlay_legs(sk, SKY, 5)
    sk.paint(LEGS, lambda p: (flowers(p, None, 0) or col(SKY, lit(p, 1.0) + 0.3)) if sk.get(p)[3] and p.face != 'top' else None, layer=1)
    shoes(sk, '#c7955f', kind='sandal', sole='#a8774a')


@figur('wide', 'alex', 'hanni', 112, 'Latzhose aus Jeans, gelbes Shirt, rotes Kopftuch, kupferroter Dutt, Gummistiefel')
def hanni(sk):
    T, H = '#f2cfb1', '#c7743a'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 5 if z <= 3 else 2, back=6, over_side=1, over_back=4, gloss=1.1, cool=0.98, warm=0.1)
    pal = face_pal(T, H, '#7d6a2a', lips='#cf7470', lash='#5a2a14')
    face_map(sk, ["HLHHHLHH",
                  "hHHhHHhH",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "sfsdsfsd",
                  "sssmMssd",
                  "dsssssdd"], pal)
    RED = '#c8323a'
    sk.paint('head', lambda p: (shade('#ffffff', 0) if (p.x + p.z * 2 + p.y) % 4 == 0 else col(RED, lit(p, 0.6) + 0.2))
             if p.face in ('front', 'right', 'left', 'back') and p.y == 1 else None, layer=1)
    for x, y in ((3, 2), (4, 2), (3, 3)):  # Knoten hinten
        sk.put('head', 'back', x, y, shade(RED, -1 if y == 3 else 0), layer=1)
    # Dutt oben
    sk.paint('head', lambda p: col(H, 1.3 - abs(p.x - 3.5) * 0.4 - abs(p.z - 2.5) * 0.4 + (0.7 if (p.x + p.z) % 3 == 0 else 0))
             if p.face == 'top' and 2 <= p.x <= 5 and 1 <= p.z <= 4 else None, layer=1)
    YEL = '#f2c94c'
    top_wear(sk, YEL, sleeves='short', neck='round', amp=0.05)
    sk.paint(ARMS, lambda p: col(YEL, lit(p) + 0.8) if p.y == 3 and p.face != 'bottom' else None)  # Umschlag
    DEN = '#3d6fb6'

    def overalls(p):
        if p.part == 'body':
            if p.face in ('top', 'bottom'):
                return None
            k = lit(p) + (0.35 if (p.x + p.y + p.z) % 3 == 0 else 0)
            if p.face == 'front':
                if p.y >= 3:
                    if p.y == 3 and p.x in (1, 6):
                        return col('#e8c34a', 1.0)  # Knöpfe
                    if 5 <= p.y <= 6 and 2 <= p.x <= 5:
                        return col(DEN, k - (1.0 if p.y == 5 else 0.3))  # Brusttasche
                    return col(DEN, k)
                if p.x in (1, 6):
                    return col(DEN, k + 0.3)  # Träger
                return None
            if p.face == 'back':
                if p.y >= 6 or (p.x in (1, 2, 5, 6) and abs((p.x - 3.5) - (3 - p.y) * (1 if p.x > 3 else -1)) < 1.5):
                    return col(DEN, k)
                if p.y <= 5 and p.x in (2 + p.y // 2, 5 - p.y // 2):
                    return col(DEN, k)
                return None
            if p.y >= 6:
                return col(DEN, k)
            return None
        if p.part in LEGS and p.y < 8 and p.face != 'bottom':
            k = lit(p, 1.2) + (0.35 if (p.x + p.y + p.z) % 3 == 0 else 0)
            if p.y == 7:
                return col('#9cc0ea', k + 0.4)  # umgekrempelt
            return col(DEN, k)
        return None
    sk.paint(('body',) + LEGS, overalls)
    shoes(sk, '#4f8a3a', kind='rubber', sole='#2c4a22', rows=4)


@figur('wide', 'efe', 'yuki', 113, 'Grün-weißes Fußballtrikot mit der 10, weiße Hose, Stutzen, schwarze Fußballschuhe')
def yuki(sk):
    T, H = '#f1caa1', '#17151b'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 5 if z <= 2 else 3 if z <= 4 else 2, back=5, over_side=1, over_back=3, gloss=0.9,
         cool=0.66, warm=0.66)
    pal = face_pal(T, H, '#2a1c14', lash='#0f0d10')
    pal['L'] = shade('#3d4250', 0)
    face_map(sk, ["HHLHHLHH",
                  "HHHHHHHH",
                  "hHhSSHhH",
                  "sbbssbbd",
                  "swissiwd",
                  "sssdsssd",
                  "sssMMssd",
                  "dsssssdd"], pal)
    face_map(sk, ["HLHHLHHL", "HHHH_HHH", "h_h___h_", "________", "________", "________", "________", "________"], pal, layer=1)
    GREEN, WHITE = '#1f9a5a', '#f3f3f1'
    DIGITS = {'1': ['.#.', '##.', '.#.', '.#.', '###'], '0': ['###', '#.#', '#.#', '#.#', '###']}

    def jersey(p, c, k):
        if p.part == 'body':
            if p.y == 0 and p.face == 'front' and 2 <= p.x <= 5:
                return shade(WHITE, 0)  # Kragen
            if p.face == 'back' and 2 <= p.y <= 6:  # Nummer 10 hinten (Bildspalte, Rückseite ist gespiegelt)
                x = (p.w - 1 - p.x) - 1
                for dx, d in ((0, '1'), (3, '0')):
                    if 0 <= x - dx < 3 and DIGITS[d][p.y - 2][x - dx] == '#':
                        return shade(WHITE, 0)
            if p.face == 'front' and (p.x - p.y) % 8 in (0, 1):
                return col(WHITE, k)  # Schärpe
            if p.face == 'front' and p.x == 5 and p.y == 2:
                return shade('#e8c34a', 1)  # Wappen
        if p.part in ARMS and p.y == 3:
            return col(WHITE, k)
        return None
    top_wear(sk, GREEN, sleeves='short', neck='round', pattern=jersey, amp=0.05, folds=False)
    sk.paint(ARMS, lambda p: col(WHITE, lit(p) + 0.6) if p.y == 9 and p.face != 'bottom' else None)  # Schweißband
    pants(sk, WHITE, kind='shorts', amp=0.05, rows=5)
    socks(sk, GREEN, 6, 10, stripe={6: WHITE})
    shoes(sk, '#1b1b1f', kind='football', sole='#f3f3f1', accent=WHITE, rows=2)


@figur('wide', 'kai', 'toni', 114, 'Orange Softshelljacke, grüner Rucksack, Vollbart, Wanderhose, Wanderschuhe')
def toni(sk):
    T, H = '#d9a07c', '#8a6a3c'
    skin_all(sk, T)
    hair(sk, H, back=6, over_side=1, over_back=3, gloss=1.0)
    pal = face_pal(T, H, '#5d84a8', beard_c='#7b5a33')
    face_map(sk, ["HLHHHLHH",
                  "HHhHHHhH",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "BsssdssB",
                  "BBRmMRBG",
                  "GBBBBBBG"], pal)
    beard(sk, '#7b5a33', 'full')
    top_wear(sk, '#7b8288', sleeves='long', neck='round', amp=0.05)
    hands(sk, T)
    pants(sk, '#7d7356', kind='cargo', amp=0.1, rows=9, belt='#3a2e22', buckle='#9a9a9a')
    sk.paint(LEGS, lambda p: col('#6a614a', lit(p) - 0.2) if p.face == 'front' and p.y in (4, 5) else None)  # Knieflicken
    shoes(sk, '#6a4428', kind='hiking', sole='#2a211a', lace='#d23a3a', rows=3)
    ORANGE, GREY = '#e2522f', '#3a3f45'

    def shell(p):
        if p.part == 'body' and p.face in ('right', 'left'):
            return GREY
        if p.part in ARMS and p.side == 'inner':
            return GREY
        return None
    overlay_top(sk, ORANGE, open_front=False, rows=11, sleeves=10, zipper='#2a2e33', collar=True, cuff=GREY, amp=0.05)
    sk.paint(('body',) + ARMS, lambda p: col(shell(p), lit(p) + 0.2) if shell(p) and sk.get(p)[3] else None, layer=1)
    for y in (2, 3):  # Brusttasche
        sk.put('body', 'front', 6, y, shade(ORANGE, -1 if y == 2 else 0), layer=1)
    # Rucksack hinten, Gurte vorne
    BAG = '#2f5d46'

    def bag(p):
        if p.part != 'body':
            return None
        if p.face == 'back' and 1 <= p.x <= 6 and 1 <= p.y <= 9:
            k = lit(p) + 0.4
            if p.y <= 2:
                return col('#5f7d9a', k + (0.6 if p.y == 1 else -0.4))  # Isomatte
            if p.y == 6 and 2 <= p.x <= 5:
                return col(BAG, k - 1.2)  # Deckel
            if p.y in (7, 8) and 2 <= p.x <= 5:
                return col(BAG, k - 0.4)  # Fach
            return col(BAG, k)
        if p.face == 'front' and p.x in (1, 6) and p.y <= 8:
            return col('#2a2d30', lit(p) + (0.8 if p.y == 4 else 0))
        if p.face == 'front' and p.y == 4 and p.x in (2, 3, 4, 5):
            return col('#2a2d30', 0.3 if p.x in (3, 4) else 0)
        if p.face == 'top' and p.x in (1, 6):
            return col('#2a2d30', 0.5)
        return None
    sk.paint('body', bag, layer=1)


@figur('wide', 'makena', 'kuno', 115, 'Ritterrüstung: Nasalhelm, Kettenhemd, blauer Wappenrock mit eigenem Berg-Wappen')
def kuno(sk):
    T, H = '#c58b62', '#1f1915'
    skin_all(sk, T)
    hair(sk, H, back=6, over_side=0, over_back=0, gloss=0.3)
    pal = face_pal(T, H, '#3a2416', beard_c='#2a1f18')
    face_map(sk, ["KhKKhKhK",
                  "hKhKKhKh",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "gssdssgd",
                  "ggsMMsgd",
                  "dggggggd"], pal)
    STEEL = '#9aa3ad'

    def helmet(p):
        if p.face == 'bottom':
            return None
        if p.face == 'top':
            k = 1.2 - (abs(p.x - 3.5) + abs(p.z - 3.5)) * 0.25 + (0.8 if p.x == 3 else 0)
            return col(STEEL, k, cool=0.62, warm=0.62)
        lim = 2 if p.face == 'front' else 4
        if p.face == 'front' and p.x in (3, 4) and p.y <= 4:
            return col(STEEL, 0.8 - p.y * 0.4)  # Nasal
        if p.y > lim:
            return None
        k = lit(p, 0.8) + 0.4 + (0.9 if p.y == 0 else 0)
        if p.y == lim:
            k -= 0.8
            if (p.x + p.z) % 2 == 0:
                return col('#d9dde3', 1.0)  # Nieten
        return col(STEEL, k, cool=0.62, warm=0.62)
    sk.paint('head', helmet, layer=1)

    def mail(p, c, k):  # Kettenhemd: Ringmuster
        return col('#7d858f', k + (0.9 if (p.x + p.y) % 2 == 0 else -0.6), cool=0.62, warm=0.62)
    top_wear(sk, '#7d858f', sleeves='long', neck='round', pattern=mail, amp=0.0, folds=False)
    sk.paint(ARMS, lambda p: col(STEEL, lit(p) + 0.5 + (0.9 if p.side == 'outer' else 0)) if p.y >= 9 else None)  # Handschuhe
    pants(sk, '#4a3f36', kind='trousers', amp=0.05)
    shoes(sk, STEEL, kind='boot', sole='#3a3a40', rows=2)
    BLUE, GOLD = '#2a4a8f', '#d8b04a'

    def tabard(p):
        if p.part != 'body' or p.face in ('top', 'bottom') or p.face in ('right', 'left'):
            return None
        if p.x in (0, 7):
            return None
        k = lit(p) + 0.3
        if p.y == 8:
            return col('#5a3a22', k) if p.x not in (3, 4) else col(GOLD, 1.0)  # Gürtel
        if p.x in (1, 6) or p.y == 11:
            return col(GOLD, k - 0.2)  # Borte
        if p.face == 'front':  # eigenes Wappen: weißer Berg mit goldenem Stern
            m = {(4, 2): GOLD, (3, 4): '#ffffff', (4, 4): '#ffffff', (2, 5): '#ffffff', (3, 5): '#ffffff',
                 (4, 5): '#ffffff', (5, 5): '#ffffff', (3, 3): '#ffffff'}
            if (p.x, p.y) in m:
                return shade(m[(p.x, p.y)], 0)
        return col(BLUE, k)
    sk.paint('body', tabard, layer=1)

    def plates(p):  # Schulterplatten und Beinschienen
        if p.part in ARMS and p.y <= 3 and p.face != 'bottom':
            k = lit(p) + 0.8 - p.y * 0.3 + (0.8 if p.y in (0, 2) and p.face != 'top' else 0)
            return col(STEEL, k, cool=0.62, warm=0.62)
        if p.part in LEGS and 5 <= p.y <= 9 and p.face in ('front', 'right', 'left'):
            return col(STEEL, lit(p, 1.0) + 0.5 + (0.9 if p.y == 5 else 0), cool=0.62, warm=0.62)
        return None
    sk.paint(ARMS + LEGS, plates, layer=1)


@figur('wide', 'noor', 'luchs', 116, 'Grüner Kapuzenumhang mit Goldsaum, Halbmaske, Lederweste mit Gurt und Taschen')
def luchs(sk):
    T, H = '#a76c49', '#2a1d17'
    skin_all(sk, T)
    hair(sk, H, back=7, over_side=0, over_back=0, gloss=0.3)
    pal = face_pal(T, H, '#e2a032', lash='#0f0b09', white='#efe6d6')
    face_map(sk, ["KhKKhKhK",
                  "hKhhKhKh",
                  "hSSSSSSh",
                  "sbbssbbd",
                  "swissiwd",
                  "sssdsssd",
                  "sssMMssd",
                  "dsssssdd"], pal)
    HOOD, GOLD = '#2c4a3a', '#c9a646'

    def hood(p):
        if p.face == 'bottom':
            return None
        if p.face == 'front':
            if p.y <= 1:
                return col(GOLD if p.y == 1 else HOOD, 0.4 if p.y == 1 else 0.8)
            if p.x in (0, 7):
                return col(GOLD, -0.2 + (0.6 if p.y % 2 else 0))
            if p.y >= 5:
                return col('#24262a', 0.2 - (p.y - 5) * 0.4 + (0.6 if (p.x + p.y) % 3 == 0 else 0))  # Halbmaske
            return None
        k = lit(p, 0.8) + 0.4 + scarf_k(p)
        if p.face == 'top' and p.z <= 1:
            k -= 0.6  # Spitze der Kapuze hinten
        return col(HOOD, k)
    sk.paint('head', hood, layer=1)
    LEATHER = '#5d3f2a'
    top_wear(sk, '#3d3a34', sleeves='long', neck='round', amp=0.1)
    sk.paint('body', lambda p: (col(LEATHER, lit(p) + 0.2) if p.face != 'top' else None))
    sk.paint(ARMS, lambda p: col(LEATHER, lit(p) + (0.7 if p.y in (5, 9) else 0)) if 5 <= p.y <= 9 else None)  # Armschienen
    hands(sk, '#2b2622', rows=2)
    pants(sk, '#3a3a3e', kind='trousers', amp=0.05)
    shoes(sk, '#4a3020', kind='boot', sole='#1e1612', rows=5)
    sk.paint(LEGS, lambda p: col('#4a3020', lit(p) + 1.0) if p.y == 7 and p.face != 'bottom' else None)  # Stulpe

    def belt(p):  # Gurt schräg über die Brust mit Taschen
        if p.part != 'body' or p.face not in ('front', 'back'):
            return None
        on = (p.x == p.y - 1 if p.face == 'front' else p.x == 8 - p.y) and 0 <= p.y <= 8
        if on:
            return col('#2d1f15', lit(p) + 0.4)
        if p.face == 'front' and p.y == 9:
            return col('#2d1f15', 0) if p.x not in (3, 4) else shade(GOLD, 0)
        if p.face == 'front' and p.y == 10 and p.x in (1, 6):
            return col('#6b4a30', 0.3)  # Taschen
        return None
    sk.paint('body', belt)
    CLOAK = HOOD

    def cloak(p):
        if p.part == 'body':
            if p.face == 'back':
                return col(CLOAK, lit(p) + 0.4 + scarf_k(p) - (0.6 if p.y == 11 else 0))
            if p.face in ('right', 'left'):
                return col(CLOAK, lit(p) + 0.2 + scarf_k(p))
            if p.face == 'front' and p.y <= 1 and p.x not in (3, 4):
                return col(GOLD if p.y == 1 else CLOAK, 0.3)
            if p.face == 'top':
                return col(CLOAK, 0.6)
            return None
        if p.part in ARMS and p.y <= 2 and p.face != 'bottom':
            return col(CLOAK, lit(p) + 0.6 - p.y * 0.3)
        return None
    sk.paint(('body',) + ARMS, cloak, layer=1)


@figur('wide', 'sunny', 'matze', 117, 'Schirmmütze verkehrt herum, offenes Flanellhemd über weißem Shirt, Jeans, rote Sneaker')
def matze(sk):
    T, H = '#c08b5d', '#3b2517'
    skin_all(sk, T)
    hair(sk, H, back=6, over_side=0, over_back=0, gloss=0.6)
    pal = face_pal(T, H, '#7a5a2a', beard_c='#2e1d12')
    face_map(sk, ["hHHhHHhH",
                  "HhHHHHhH",
                  "SSSSSSSs",
                  "sbbssbbd",
                  "swissiwd",
                  "sssdsssd",
                  "sgsMMsgd",
                  "dgggggdd"], pal)
    cap(sk, '#1f2e4f', backwards=True, bill='#16223a', button='#e8e8e8')

    def tee(p, c, k):
        if p.part == 'body' and p.face == 'front' and (p.x, p.y) in ((3, 3), (4, 3), (2, 4), (5, 4), (3, 5), (4, 5)):
            return shade('#f2a33a', 0)  # eigener Sonnen-Aufdruck
        return None
    top_wear(sk, '#f1f0ec', sleeves='short', neck='round', pattern=tee, amp=0.05)
    pants(sk, '#3a5f9e', kind='jeans', rows=9)
    shoes(sk, '#9e2b2b', kind='sneaker', sole='#f2f0ea', accent='#f2f0ea', lace='#f2f0ea', rows=3)
    FL = '#2f6f6a'

    def flannel(p):
        X = p.X + 8 if p.face in ('front', 'back', 'top', 'bottom') else p.Z + 8
        v = int(X) % 4 == 0
        h = int(p.Y) % 4 == 0
        k = lit(p) + 0.3
        if v and h:
            return col('#1d3b39', k)
        if v or h:
            return col('#c8423a' if (v and int(p.Y) % 8 < 4) else '#1d3b39', k)
        return col(FL, k)
    overlay_top(sk, FL, open_front=True, rows=12, sleeves=9, gap=(2, 3, 4, 5), amp=0.0)
    sk.paint(('body',) + ARMS, lambda p: flannel(p) if sk.get(p)[3] and p.face not in ('top',) else None, layer=1)
    sk.paint(ARMS, lambda p: col(FL, lit(p) + 0.9) if p.y == 8 and sk.get(p)[3] else None, layer=1)  # Krempel


@figur('wide', 'zuri', 'ewald', 118, 'Strickpullover mit Alpenmuster, Brille, graue Haare, Schnurrbart, Cordhose')
def ewald(sk):
    T, H = '#e2b693', '#b6b1a8'
    skin_all(sk, T)
    hair(sk, H, side=lambda z: 6 if z <= 3 else 4, back=6, over_side=1, over_back=4, top=False, gloss=0.8,
         cool=0.62, warm=0.12)
    sk.paint('head', lambda p: col(T, 1.0 + (0.5 if (p.x + p.z) % 5 == 0 else 0), cool=0.97, warm=0.09) if p.face == 'top' and 2 <= p.x <= 5 else
             col(H, 0.6) if p.face == 'top' else None)
    pal = face_pal(T, H, '#5a7fb0', beard_c='#c9c4bb')
    face_map(sk, ["SSSSSSSs",
                  "HSdSSdSH",
                  "HSSSSSSH",
                  "sbbssbbd",
                  "swissiwd",
                  "sssdsssd",
                  "sBBMMBBd",
                  "dsssssdd"], pal)
    pal['b'] = shade('#d8d4cc', 0)
    for x in (1, 2, 5, 6):
        sk.put('head', 'front', x, 3, pal['b'])
    glasses(sk, '#4a3a2a', row=4)
    RED = '#8c2f39'

    def knit(p, c, k):
        if p.part == 'body' and p.face == 'front' and p.y == 0 and 2 <= p.x <= 5:
            return shade('#f1f0ec', 0)  # Hemdkragen
        if (p.part == 'body' or p.part in ARMS) and 3 <= p.Y - 8 <= 5 and p.face != 'top':
            r = int(p.Y - 8) - 3
            X = p.X + 8 if p.face in ('front', 'back') else p.Z + 8
            m = ('#f1f0ec' if (int(X) + r) % 2 == 0 else '#2f6b3a') if r != 1 else ('#f1f0ec' if int(X) % 4 == 1 else '#2f6b3a')
            return col(m, k)
        return col(RED, k + (0.4 if p.x % 2 == 0 else -0.2))
    top_wear(sk, RED, sleeves='long', neck='round', pattern=knit, amp=0.0, cuff=shade(RED, -1), hem=shade(RED, -1))
    hands(sk, T)
    pants(sk, '#6d5236', kind='trousers', amp=0.0, rows=10)
    sk.paint(LEGS, lambda p: col('#6d5236', lit(p, 1.2) + (0.5 if (p.x + p.z) % 2 == 0 else -0.3)) if p.y < 10 and p.face != 'bottom' and p.face != 'top' else None)
    shoes(sk, '#3a2618', kind='haferl', sole='#1a120c')


# ======================================================================== Ausgabe

PACK_DESC = 'Darsteller-Skins für Trailer (nur lokal)'


def build_all():
    out = []
    for f in FIGUREN:
        sk = Skin(f['model'] == 'slim', f['seed'])
        f['fn'](sk)
        out.append((f, sk))
    return out


def write_png():
    figs = []
    for f, sk in build_all():
        d = os.path.join(HERE, 'png', f['model'])
        os.makedirs(d, exist_ok=True)
        sk.save(os.path.join(d, f['texture'] + '.png'))
        figs.append({k: f[k] for k in ('id', 'model', 'texture', 'seed', 'beschreibung')})
    json.dump(figs, open(os.path.join(HERE, 'figuren.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(figs), 'Skins geschrieben')


def build_pack(target):
    """Ressourcenpaket (Ordner + ZIP): ersetzt textures/entity/player/{wide,slim}/<name>.png."""
    name = 'morni-darsteller'
    root = os.path.join(target, name)
    os.makedirs(root, exist_ok=True)
    meta = {'pack': {'description': PACK_DESC, 'pack_format': 97, 'min_format': 97, 'max_format': 97}}
    json.dump(meta, open(os.path.join(root, 'pack.mcmeta'), 'w'), ensure_ascii=False, indent=1)
    files = ['pack.mcmeta']
    for f in json.load(open(os.path.join(HERE, 'figuren.json'))):
        rel = f'assets/minecraft/textures/entity/player/{f["model"]}/{f["texture"]}.png'
        os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
        with open(os.path.join(HERE, 'png', f['model'], f['texture'] + '.png'), 'rb') as a, open(os.path.join(root, rel), 'wb') as b:
            b.write(a.read())
        files.append(rel)
    zp = os.path.join(target, name + '.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            info = zipfile.ZipInfo(rel, date_time=(2026, 11, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, open(os.path.join(root, rel), 'rb').read())
    print(root)
    print(zp)


def main():
    cmd, *rest = sys.argv[1:] or ['png']
    if cmd == 'png':
        write_png()
    elif cmd == 'paket':
        write_png()
        build_pack(rest[0] if rest else os.environ.get('MM_SKINS_PAKET', '/home/user/mm-cache/trailer/skins-paket'))
    elif cmd == 'vorschau':
        write_png()
        from vorschau import sheet
        from PIL import Image
        figs = json.load(open(os.path.join(HERE, 'figuren.json')))
        only = rest[1:] if len(rest) > 1 else None
        ent = [(Image.open(os.path.join(HERE, 'png', f['model'], f['texture'] + '.png')), f['model'] == 'slim', f['id'])
               for f in figs if not only or f['id'] in only]
        print(sheet(ent, rest[0]))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
