"""Trailer: Wolkenkampf – Kampf auf schwebenden Inseln: Ballon-Gondeln, Truhen, Brücken, Nachschub, Gewitter, Nebel.

Gedreht auf einem eigenen Test-Server (Morni-Wolkenkampf `test/run.sh` mit SERVER_DIR=…/wolkenkampf-trailer, Port
25810, RCON 25910, ViaVersion/ViaBackwards für den 26.3-Client). Wolkenhafen und Karten stehen in der eigenen Welt
`minecraft:wolkenkampf` (DIM): Wolkenhafen bei 0|0, Wolkenalm bei x 1000, Kristallgipfel bei x 2000, Inselboden y 100.

Alles Spielgeschehen ist echt und läuft im Plugin: Runde mit `/wolkenkampf start`, Gondeln (Countdown, Boden klappt
auf, Ballons steigen davon), Truhen öffnen und ausräumen (Darsteller schicken das echte Klick-Paket), Brücke aus den
Brettern der Truhe (echte Bau-Pakete), Kampf mit echten Schlägen, Hinunterstoßen (Kill zählt), Nachschub, Gewitter mit
Blitzen (`/wolkenkampf blitz`), steigender Nebel, Sieg mit Feuerwerk – Zeitpunkte per `/wolkenkampf vorspulen`.
Aus dem Drehbuch kommen nur die Wege der Darsteller (der Server bewegt sie per tp, sie haben keine eigene Physik –
auch das Hinunterschweben und der Sturz) und der Kamera.

Hilfsmittel nur lokal im Test-Server: Regie-Plugin (`regie als <spieler> <befehl>`, `regie raus <spieler>` nimmt die
Kamera aus dem Wolkenhafen, damit sie in keine Runde kommt; Quelle ~/mm-cache/trailer/wolkenkampf/regie-plugin/).
Darsteller: wolkenkampf/wk-actors.cjs (Anna Bert Carl Dora Emil). Kamera: echter Client „WkKamera“ (chatScale 0, F1).
Konfiguration des Test-Servers (config.yml): mindestens-spieler 12 (Start nur per Befehl), gondel-sekunden 90,
Ereignisse 600/700/800 (nur per vorspulen), nebel-dauer 30.

Die Inseln der Darsteller lost das Plugin bei jedem Start neu aus – `runde` schreibt sie nach runde.json, die
Einstellungen der Runde rechnen damit.

  python3 trailers/wolkenkampf.py runde               # Runde auf der Wolkenalm starten, Inseln merken
  python3 trailers/wolkenkampf.py <einstellung …>     # vorbereiten + drehen (in der Reihenfolge der Runde)
"""
import json, math, os, re, subprocess, sys, time

STYLE = 'wolkenkampf'
FILE = 'MorniNet-Trailer-Wolkenkampf.mp4'
SLOW = 15
DIM = 'minecraft:wolkenkampf'
CAM = os.environ.get('MM_CAMERA', 'WkKamera')
ACTORS = ['Anna', 'Bert', 'Carl', 'Dora', 'Emil']
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer'), 'wolkenkampf')
O = 1000.0    # Wolkenalm (Mitte x)
K = 2000.0    # Kristallgipfel (Mitte x)
MID = 104     # Füße auf der Mittelinsel der Wolkenalm

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'morni.net · Spielmodus', 'title': 'Wolkenkampf',
     'text': 'Kampf auf schwebenden Inseln über den Wolken'},
    {'file': 'lt-hafen.png', 'kind': 'lower', 'title': 'Der Wolkenhafen', 'text': 'Karte wählen, Ausrüstung aussuchen, bereit sagen'},
    {'file': 'lt-gondel.png', 'kind': 'lower', 'title': 'Ballon-Gondeln', 'text': 'Jeder startet über seiner eigenen Insel'},
    {'file': 'lt-los.png', 'kind': 'lower', 'title': 'Boden auf!', 'text': 'Sanft hinunterschweben – die Ballons steigen davon'},
    {'file': 'lt-truhe.png', 'kind': 'lower', 'title': 'Truhen plündern', 'text': 'Waffen, Rüstung und Blöcke für die erste Brücke'},
    {'file': 'lt-bruecke.png', 'kind': 'lower', 'title': 'Brücken bauen', 'text': 'Block für Block hinüber zu den anderen'},
    {'file': 'lt-kampf.png', 'kind': 'lower', 'title': 'Kämpfen', 'text': 'Wer hinunterfällt, ist raus'},
    {'file': 'lt-nachschub.png', 'kind': 'lower', 'title': 'Nachschub!', 'text': 'Alle Truhen füllen sich neu – auch in der Kapelle'},
    {'file': 'lt-gewitter.png', 'kind': 'lower', 'title': 'Gewitter', 'text': 'Erst knistert es – dann schlägt der Blitz ein'},
    {'file': 'lt-nebel.png', 'kind': 'lower', 'title': 'Der Nebel steigt', 'text': 'Von unten verschluckt er Insel um Insel'},
    {'file': 'lt-sieg.png', 'kind': 'lower', 'title': 'Wer zuletzt steht, gewinnt', 'text': 'Allein oder zu zweit, 2 bis 12 Leute'},
    {'file': 'lt-kristall.png', 'kind': 'lower', 'title': 'Zweite Karte: Kristallgipfel', 'text': 'Verschneite Felsen, Eisnadeln und Amethyst'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'morni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Wolkenkampf“ anklicken'},
]

# ------------------------------------------------------------------ Runde (Inseln der Darsteller)

RUNDE_FILE = os.path.join(OUT, 'runde.json')


def _runde():
    try:
        return json.load(open(RUNDE_FILE))
    except (OSError, ValueError):  # noch keine Runde: Platzhalter, damit sich das Drehbuch laden lässt
        ring = [(0, -42, 0), (21, -36, 1), (36, -21, 0), (42, 0, 1), (36, 21, 0), (21, 36, 1), (0, 42, 0),
                (-21, 36, 1), (-36, 21, 0), (-42, 0, 1), (-36, -21, 0), (-21, -36, 1)]
        out = {}
        for n, i in zip(ACTORS, (8, 10, 0, 3, 5)):
            x, z, t = ring[i]
            out[n] = {'island': i, 'x': O + x, 'z': z, 'floor': 100 + t, 'gondola': 110 + t}
        out['bridge'] = {'actor': 'Bert', 'dir': [0, 1], 'edge': 4}
        return out


R = _runde()


def isl(n):
    """Mitte der Insel eines Darstellers: (x, z, Füße auf der Insel, Füße in der Gondel)."""
    r = R[n]
    return r['x'] + 0.5, r['z'] + 0.5, r['floor'] + 1, r['gondola'] + 1


def outward(n):
    """Einheitsvektor von der Kartenmitte zur Insel."""
    x, z = R[n]['x'] - O, R[n]['z']
    d = math.hypot(x, z) or 1
    return x / d, z / d


def chest(n, side=1):
    """Truhe auf der Startinsel (wie MapLayout.startChests): Block-Ecke (x, y, z)."""
    x, z = R[n]['x'] - O, R[n]['z']
    ox, oz = outward(n)
    px, pz = -oz, ox
    return O + x + round(ox * 2 + px * side * 3), R[n]['floor'] + 1, z + round(oz * 2 + pz * side * 3)


# ------------------------------------------------------------------ Bausteine für Wege

def walk(points, T_, look=None, share=1.0):
    """Gehweg mit gleichmäßigem Tempo in share·T Sekunden; danach stehen bleiben (optional mit Blickziel) bis T."""
    total = sum(math.dist(a, b) for a, b in zip(points, points[1:])) or 1
    out = [{'p': list(points[0]), 't': 0}]
    for a, b in zip(points, points[1:]):
        out.append({'p': list(b), 't': share * T_ * math.dist(a, b) / total})
    if share < 1:
        q = {'p': list(points[-1]), 't': 0.3}
        r = {'p': list(points[-1]), 't': (1 - share) * T_ - 0.3}
        if look:
            q['look'] = r['look'] = look
        out += [q, r]
    return out


def stand(p, look, hold=8.0):
    return [{'p': list(p), 't': 0, 'look': look}, {'p': list(p), 't': hold, 'look': look}]


def act(t, a, what, arg=''):
    return {'at': t, 'actor': a, 'act': what, 'arg': arg}


def cmd(t, c):
    return {'at': t, 'cmd': f'execute in {DIM} run {c}'}


def raw(t, c):
    return {'at': t, 'cmd': c}


def fall(p, out_dir, T0, drop=40.0, push=2.2):
    """Hinunterstoßen: kurzer Stoß nach außen und oben, dann immer schneller in die Tiefe (Stücke einer Wurfparabel)."""
    x, y, z = p
    dx, dz = out_dir
    pts = [{'p': [x, y, z], 't': 0, 'hold': T0}]
    steps = 8
    for i in range(1, steps + 1):
        u = i / steps
        # Waagrecht gleichmäßig (Stoß), senkrecht erst hoch, dann Fall (Parabel).
        h = 0.9 * 4 * u * (1 - u) * 0.5 - drop * max(0.0, u - 0.25) ** 2 / 0.5625
        pts.append({'p': [x + dx * push * (1 + 1.6 * u), y + h, z + dz * push * (1 + 1.6 * u)], 't': 0.22})
    return pts


# ------------------------------------------------------------------ Einstellungen

def _gondola_shot():
    n = 'Dora'
    x, z, fy, gy = isl(n)
    ox, oz = outward(n)
    px, pz = -oz, ox
    eye = [x, gy + 1.5, z]
    # Kamera kreist außen um den Korb (Abstand 7), etwas über dem Rand.
    cam = []
    for i, (a, t) in enumerate([(-40, 0), (-10, 2.6), (20, 2.6)]):
        r = math.radians(a)
        cx = x + 8.5 * (ox * math.cos(r) + px * math.sin(r))
        cz = z + 8.5 * (oz * math.cos(r) + pz * math.sin(r))
        cam.append({'p': [cx, gy + 3.6 - i * 0.3, cz], 'look': [x, gy + 1.2, z], 't': t, **({'ease': 1} if i == 2 else {})})
    actors = {}
    for m in ACTORS:
        mx, mz, _, mg = isl(m)
        look = [mx + px * 4, mg + 1.2, mz + pz * 4] if m == n else [O, 106, 0]
        actors[m] = stand([mx, mg, mz], look if m != n else [x - ox * 6, gy + 1.0, z - oz * 6], 5.2)
    return {'camera': cam, 'actors': actors,
            'events': [act(1.0, n, 'swing'), act(2.3, n, 'swing'), act(3.4, n, 'swing')]}


def _open_shot():
    """Boden klappt auf, alle schweben auf ihre Insel, danach steigen die Ballons davon. 8 s Spielzeit."""
    n = 'Carl'
    x, z, fy, gy = isl(n)
    ox, oz = outward(n)
    px, pz = -oz, ox
    side = [x + px * 9 + ox * 3, 0, z + pz * 9 + oz * 3]
    cam = [{'p': [side[0] + ox * 1.2, gy + 1.8, side[2] + oz * 1.2], 'look': [x, gy + 0.9, z], 't': 0},
           {'p': [side[0], gy + 1.5, side[2]], 'look': [x, gy + 0.6, z], 't': 1.6},
           {'p': [side[0], gy + 0.5, side[2]], 'look': [x, gy, z], 't': 1.2},
           {'p': [side[0] + px * 2, fy + 3.5, side[2] + pz * 2], 'look': [x, fy + 1.4, z], 't': 2.6, 'ease': 1},
           {'p': [side[0] + px * 3 + ox * 2, fy + 2.0, side[2] + pz * 3 + oz * 2], 'look': [x, gy + 6, z], 't': 3.0, 'ease': 1}]
    actors = {}
    for m in ACTORS:
        mx, mz, mf, mg = isl(m)
        mo = outward(m)
        look = [mx - mo[0] * 8, mf + 1.6, mz - mo[1] * 8]
        actors[m] = [{'p': [mx, mg, mz], 't': 0, 'hold': 2.75, 'look': look},
                     {'p': [mx, mg - 1.2, mz], 't': 0.45, 'look': look},
                     {'p': [mx, mf + 0.15, mz], 't': 2.2, 'look': look},
                     {'p': [mx, mf, mz], 't': 0.3, 'look': look},
                     {'p': [mx, mf, mz], 't': 2.9, 'look': [mx, mg + 8, mz]}]
    return {'fit': False, 'camera': cam, 'actors': actors,
            'events': [raw(2.55, 'wolkenkampf vorspulen oeffnen')]}


CHEST_SIDE = int(os.environ.get('WK_CHEST_SIDE', '1'))
CHEST_CAM = int(os.environ.get('WK_CHEST_CAM', '1'))


def _chest_shot():
    """Bert geht zur Truhe, öffnet sie (Deckel geht auf) und räumt sie aus – Kamera hinter der Truhe, man sieht sein Gesicht."""
    n = 'Bert'
    x, z, fy, gy = isl(n)
    side = CHEST_SIDE
    cx, cy, cz = chest(n, side)
    ox, oz = outward(n)
    px, pz = -oz, ox
    c = [cx + 0.5, cy, cz + 0.5]
    st = [c[0] - ox * 1.5, fy, c[2] - oz * 1.5]
    start = [x - ox * 1.5 + px * side * 0.5, fy, z - oz * 1.5 + pz * side * 0.5]
    tgt = [c[0], cy + 0.5, c[2]]
    look = [st[0], fy + 1.0, st[2]]
    # Kamera hinter der Truhe (außen), etwas seitlich und erhöht: Deckel geht auf, man sieht Berts Gesicht.
    q = CHEST_CAM
    cam = [{'p': [c[0] + ox * 3.6 + px * q * 1.5, fy + 3.7, c[2] + oz * 3.4 + pz * q * 1.7], 'look': [st[0], fy + 0.9, st[2]], 't': 0},
           {'p': [c[0] + ox * 2.9 + px * q * 1.0, fy + 3.2, c[2] + oz * 2.6 + pz * q * 1.1], 'look': [st[0], fy + 0.9, st[2]],
            't': 5.0, 'ease': 1}]
    if 'truhe' in R:  # für diese Runde von Hand gewählt (Bäume, Heuballen im Weg)
        o_ = R['truhe']
        st, start = o_['stand'], o_['start']
        cx, cy, cz = o_.get('chest', [cx, cy, cz])
        tgt = [cx + 0.5, cy + 0.5, cz + 0.5]
        cam = [{'p': o_['cam'][0], 'look': o_['look'], 't': 0},
               {'p': o_['cam'][1], 'look': [o_['look'][0], o_['look'][1] - 0.1, o_['look'][2]], 't': 5.0, 'ease': 1}]
    ev = [act(1.35, n, 'open', f'{cx} {cy} {cz}'), act(2.1, n, 'take'), act(3.4, n, 'close'),
          act(3.6, n, 'equip', 'sword|axe|pickaxe'), act(4.1, n, 'swing'), act(4.6, n, 'swing')]
    return {'camera': cam, 'actors': {n: walk([start, st], 5.0, tgt, 0.24)}, 'events': ev}


def _bridge_shot():
    b = R['bridge']
    n = b['actor']
    x, z, fy, gy = isl(n)
    dx, dz = b['dir']
    edge = b['edge']  # Abstand des letzten Inselblocks von der Mitte (Blöcke)
    bx, bz = math.floor(x), math.floor(z)
    by = fy - 1  # oberste Schicht der Insel
    pts = [[x + dx * (edge - 2), fy, z + dz * (edge - 2)], [x + dx * edge, fy, z + dz * edge]]
    path = [{'p': pts[0], 't': 0, 'yaw': 0}, {'p': pts[1], 't': 0.7}]
    ev = [act(0.0, n, 'equip', 'planks'), raw(0.02, f'gamemode survival {n}')]
    t = 0.8
    for k in range(1, 7):
        last = edge + k - 1
        face = {(1, 0): 'east', (-1, 0): 'west', (0, 1): 'south', (0, -1): 'north'}[(dx, dz)]
        ev.append(act(t, n, 'place', f'{bx + dx * last} {by} {bz + dz * last} {face}'))
        path.append({'p': [x + dx * (edge + k - 0.05), fy, z + dz * (edge + k - 0.05)], 't': 0.62})
        t += 0.62
    path = [dict(q, look=[q['p'][0] + dx * 3, fy - 0.8, q['p'][2] + dz * 3]) for q in path]
    path[0]['look'] = [x + dx * 9, fy - 0.8, z + dz * 9]
    # Kamera von der Seite, etwas tiefer, man sieht die Leere darunter.
    sx, sz = -dz, dx
    mid = [x + dx * (edge + 3), fy, z + dz * (edge + 3)]
    cam = [{'p': [mid[0] + sx * 6.0 - dx * 2.5, fy + 2.6, mid[2] + sz * 6.0 - dz * 2.5], 'look': [mid[0] - dx * 1.5, fy - 0.2, mid[2] - dz * 1.5], 't': 0},
           {'p': [mid[0] + sx * 5.2 + dx * 0.5, fy + 2.0, mid[2] + sz * 5.2 + dz * 0.5], 'look': [mid[0] + dx * 1.0, fy - 0.4, mid[2] + dz * 1.0],
            't': 5.0, 'ease': 1}]
    return {'camera': cam, 'actors': {n: path}, 'events': ev}


def _fight_shot():
    """Auf Berts neuer Brücke: Emil kommt von der Insel, drei echte Schläge – beim dritten fliegt Bert seitlich hinunter."""
    b = R['bridge']
    x, z, fy, gy = isl(b['actor'])
    dx, dz = b['dir']
    sx, sz = dz, -dx  # Seite, auf die Bert fällt (weg von der Kamera)
    at_ = lambda k, side=0.0: [x + dx * k + sx * side, fy, z + dz * k + sz * side]
    bert0, emil0, emil1 = at_(b['edge'] + 3.3), at_(b['edge'] - 0.5), at_(b['edge'] + 1.9)
    eye = lambda p: [p[0], fy + 1.5, p[2]]
    bert = [{'p': bert0, 't': 0, 'look': eye(emil1)}, {'p': at_(b['edge'] + 3.4, -0.15), 't': 2.2, 'look': eye(emil1)},
            {'p': at_(b['edge'] + 3.5, -0.3), 't': 0.7, 'look': eye(emil1)}]
    # Bert fliegt zur Kamera hin vom Brückenrand und stürzt unter ihr vorbei in die Tiefe (unter die Leere-Grenze: raus).
    bert += fall(at_(b['edge'] + 3.5, -0.3), (-sx, -sz), 0.0, 52, 0.9)[1:]
    for q in bert[3:]:
        q['look'] = eye(emil1)
    emil = [{'p': emil0, 't': 0}, {'p': emil1, 't': 1.3, 'look': eye(bert0)},
            {'p': at_(b['edge'] + 2.1, 0.1), 't': 1.6, 'look': eye(bert0)},
            {'p': at_(b['edge'] + 2.2, 0.2), 't': 2.2, 'look': [x + dx * (b['edge'] + 4) + sx * 3, fy - 3, z + dz * (b['edge'] + 4) + sz * 3]}]
    m = at_(b['edge'] + 2.4)
    cam = [{'p': [m[0] - sx * 5.6 - dx * 1.4, fy + 2.3, m[2] - sz * 5.6 - dz * 1.4], 'look': [m[0] + sx * 0.4, fy + 0.7, m[2] + sz * 0.4], 't': 0},
           {'p': [m[0] - sx * 4.7 + dx * 0.2, fy + 2.0, m[2] - sz * 4.7 + dz * 0.2], 'look': [m[0] + sx * 0.2 + dx, fy + 0.3, m[2] + sz * 0.2 + dz], 't': 3.2},
           {'p': [m[0] - sx * 4.5 + dx * 0.6, fy + 2.2, m[2] - sz * 4.5 + dz * 0.6], 'look': [m[0] - sx * 1.8 + dx, fy - 3.5, m[2] - sz * 1.8 + dz],
            't': 1.8, 'ease': 1}]
    ev = [act(0.0, 'Emil', 'equip', 'sword|axe'), act(0.0, 'Bert', 'equip', 'sword|pickaxe'),
          act(1.5, 'Emil', 'hit', 'Bert'), act(1.95, 'Bert', 'hit', 'Emil'), act(2.5, 'Emil', 'hit', 'Bert'),
          act(2.75, 'Bert', 'swing'), act(3.15, 'Emil', 'hit', 'Bert')]
    return {'camera': cam, 'actors': {'Bert': bert, 'Emil': emil}, 'events': ev}


def _refill_shot():
    """In der Kapelle: Nachschub (Funken an den Truhen), Anna öffnet die Truhe am Altar."""
    cam = [{'p': [O + 0.3, MID + 2.3, 3.4], 'look': [O + 0.5, MID + 1.0, -4.5], 't': 0},
           {'p': [O + 0.1, MID + 1.9, 0.4], 'look': [O + 0.8, MID + 0.7, -4.3], 't': 5.0, 'ease': 1}]
    anna = stand([O + 0.75, MID, -2.6], [O + 2.5, MID + 0.5, -3.5], 5.2)
    ev = [raw(0.2, 'wolkenkampf vorspulen nachschub wolkenalm'), act(2.9, 'Anna', 'open', f'{O + 2:.0f} {MID} -4'),
          act(3.8, 'Anna', 'take'), act(4.8, 'Anna', 'close')]
    return {'camera': cam, 'actors': {'Anna': anna}, 'events': ev}


GROUP = {'Anna': [O - 3.0, MID, 8.6], 'Emil': [O + 3.2, MID, 8.2], 'Carl': [O - 0.4, MID, 10.6], 'Dora': [O + 1.6, MID, 7.0]}


def _storm_shot():
    look_mid = [O + 0.5, MID + 2, 4]
    cam = [{'p': [O + 9.5, MID + 3.8, 18.0], 'look': [O + 0.3, MID + 2.4, 8.0], 't': 0},
           {'p': [O + 7.0, MID + 2.9, 16.2], 'look': [O + 0.3, MID + 2.2, 8.0], 't': 5.0, 'ease': 1}]
    actors = {n: stand(p, [O + 0.5, MID + 1.4, 9.0] if n != 'Carl' else look_mid, 5.2) for n, p in GROUP.items()}
    ev = [raw(t, 'wolkenkampf blitz wolkenalm') for t in (0.1, 1.0, 1.9, 2.8)]
    ev += [act(1.4, 'Anna', 'swing'), act(2.6, 'Emil', 'swing')]
    return {'camera': cam, 'actors': actors, 'events': ev}


def _fog_shot():
    cam = [{'p': [O + 22.0, MID + 9.0, 30.0], 'look': [O + 8.0, 98.0, 14.0], 't': 0},
           {'p': [O + 18.0, MID + 6.5, 26.0], 'look': [O + 2.0, 101.0, 8.0], 't': 5.0, 'ease': 1}]
    actors = {n: stand(p, [O + 20, 100, 30], 5.2) for n, p in GROUP.items()}
    return {'camera': cam, 'actors': actors}


def _win_shot():
    a = [O - 5.0, MID, 4.8]
    cam = [{'p': [O - 9.6, MID + 1.8, 9.6], 'look': [a[0], MID + 1.4, a[2]], 't': 0},
           {'p': [O - 10.4, MID + 1.4, 9.2], 'look': [a[0], MID + 3.6, a[2] - 0.5], 't': 5.0, 'ease': 1}]
    anna = [{'p': a, 't': 0, 'look': [O - 9.6, MID + 1.8, 9.6]}, {'p': a, 't': 5.2, 'look': [O - 10, MID + 3.0, 9.5]}]
    ev = [raw(0.15, 'damage Emil 1000 minecraft:generic'), raw(0.2, 'damage Carl 1000 minecraft:generic'),
          raw(0.25, 'damage Dora 1000 minecraft:generic'), raw(0.3, 'damage Bert 1000 minecraft:generic')]
    ev += [act(t, 'Anna', 'swing') for t in (0.9, 1.3, 2.4, 2.8, 3.9)]
    return {'camera': cam, 'actors': {'Anna': anna}, 'events': ev}


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'phase': 'hafen', 'spec': {
        'camera': [{'p': [46.0, 132.0, 62.0], 'look': [0.5, 108.0, 0.5], 't': 0},
                   {'p': [26.0, 118.0, 38.0], 'look': [0.5, 108.0, 0.5], 't': 4.2},
                   {'p': [9.5, 107.5, 21.0], 'look': [0.5, 110.0, 0.5], 't': 4.2, 'ease': 1}],
        'actors': {
            'Anna': walk([[-3.5, 101, 17.0], [-1.0, 101, 9.5]], 8.4),
            'Bert': walk([[2.5, 101, 18.0], [1.6, 101, 10.5]], 8.4)}}},
    {'id': '02-hafen', 'bars': 2, 'card': 'lt-hafen.png', 'phase': 'hafen', 'spec': {
        'camera': [{'p': [3.0, 102.9, 15.0], 'look': [-1.0, 102.6, 4.0], 't': 0},
                   {'p': [-1.5, 103.4, 13.6], 'look': [-1.0, 104.5, 1.0], 't': 5.0, 'ease': 1}],
        'actors': {
            'Anna': stand([-9.8, 101, 3.5], [-12.0, 102.2, 3.5], 5.0),
            'Bert': walk([[0.5, 101, 12.5], [-1.0, 101, 5.5]], 5.0, [-5.5, 102.6, -3.5], 0.7),
            'Carl': stand([3.5, 101, 4.5], [0.5, 109.0, 0.5], 5.0),
            'Dora': stand([-5.6, 101, -1.6], [-7.0, 102.0, -4.0], 5.0),
            'Emil': walk([[5.5, 101, 10.0], [6.0, 101, 7.5]], 5.0, [0.5, 108, 0.5], 0.5)},
        'events': [act(0.6, 'Anna', 'swing'), act(1.4, 'Dora', 'swing'), act(2.2, 'Anna', 'swing'), act(3.4, 'Dora', 'swing'),
                   act(2.9, 'Emil', 'swing')]}},
    {'id': '03-gondel', 'bars': 2, 'card': 'lt-gondel.png', 'phase': 'gondel', 'spec': _gondola_shot()},
    {'id': '04-oeffnen', 'bars': 4, 'card': 'lt-los.png', 'cardAt': 0.3, 'phase': 'oeffnen', 'spec': _open_shot()},
    {'id': '05-truhe', 'bars': 2, 'card': 'lt-truhe.png', 'phase': 'kampf', 'spec': _chest_shot()},
    {'id': '06-bruecke', 'bars': 2, 'card': 'lt-bruecke.png', 'phase': 'kampf', 'spec': _bridge_shot()},
    {'id': '07-kampf', 'bars': 2, 'card': 'lt-kampf.png', 'phase': 'kampf', 'spec': _fight_shot()},
    {'id': '08-nachschub', 'bars': 2, 'card': 'lt-nachschub.png', 'phase': 'nachschub', 'spec': _refill_shot()},
    {'id': '09-gewitter', 'bars': 2, 'card': 'lt-gewitter.png', 'phase': 'gewitter', 'spec': _storm_shot()},
    {'id': '10-nebel', 'bars': 2, 'card': 'lt-nebel.png', 'phase': 'nebel', 'spec': _fog_shot()},
    {'id': '11-sieg', 'bars': 2, 'card': 'lt-sieg.png', 'phase': 'sieg', 'spec': _win_shot()},
    {'id': '12-kristall', 'bars': 2, 'card': 'lt-kristall.png', 'phase': 'frei', 'spec': {
        'camera': [{'p': [K + 10.0, 121.0, 30.0], 'look': [K, 110.0, 0.0], 't': 0},
                   {'p': [K + 11.0, 113.0, 23.0], 'look': [K - 1.0, 110.0, 0.0], 't': 5.0, 'ease': 1}]}},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'phase': 'frei', 'spec': {
        'camera': [{'p': [O + 12.0, 111.0, 24.0], 'look': [O + 0.5, 108.0, 0.5], 't': 0},
                   {'p': [O + 16.0, 130.0, 32.0], 'look': [O, 106.0, 0.0], 't': 4.0},
                   {'p': [O + 26.0, 146.0, 44.0], 'look': [O, 105.0, 0.0], 't': 4.0, 'ease': 1}]}},
]
for _s in SHOTS:
    _s['spec']['dim'] = DIM

# ------------------------------------------------------------------ Regie

sys.path.insert(0, os.path.join(HERE, '..'))
_rc = None


def rc(c):
    global _rc
    if _rc is None:
        from shot import Rcon
        _rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    return re.sub('§.', '', _rc(c))


def at(c):
    return rc(f'execute in {DIM} run {c}')


def say(*lines):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        for line in lines:
            f.write(line + '\n')


def until(cond, t=20, step=0.3, what=''):
    end = time.time() + t
    while time.time() < end:
        v = cond()
        if v:
            return v
        time.sleep(step)
    raise SystemExit(f'Zeit abgelaufen: {what}')


def status():
    """Zeile der Runde auf der Wolkenalm aus /wolkenkampf status als Wörterbuch (oder None)."""
    for line in rc('wolkenkampf status').split('\n'):
        if line.startswith('karte=wolkenalm'):
            return dict(part.split('=', 1) for part in line.split(' ') if '=' in part)
    return None


def tough(*names):
    for n in names:
        rc(f'effect give {n} minecraft:resistance infinite 3 true')
        rc(f'effect give {n} minecraft:regeneration infinite 2 true')
        rc(f'effect give {n} minecraft:saturation infinite 0 true')


def camera_out():
    """Kamera aus dem Wolkenhafen nehmen (sonst kommt sie in die nächste Runde) und Zuschauer machen."""
    rc(f'regie raus {CAM}')
    rc(f'gamemode spectator {CAM}')


def start_round():
    camera_out()
    if status():
        rc('wolkenkampf stopp wolkenalm')
        until(lambda: status() is None, 40, 1, 'Runde zu Ende')
        time.sleep(3)
        camera_out()
    print(rc('wolkenkampf start wolkenalm allein'))
    s = until(status, 10, 0.5, 'Runde startet')
    out = {}
    for n in ACTORS:
        team = s[n].split(':')[1][1:]
        isl_, x, z, fy, gy = map(int, s['team' + team].split(':'))
        out[n] = {'island': isl_, 'x': x, 'z': z, 'floor': fy, 'gondola': gy}
    # Brücke: vom Darsteller, dessen Insel genau auf einer Achse liegt (Richtung Mitte); sonst Bert in Hauptrichtung.
    def axis(n):
        dx, dz = out[n]['x'] - O, out[n]['z']
        return (int(-math.copysign(1, dx)), 0) if abs(dx) > abs(dz) else (0, int(-math.copysign(1, dz)))
    n = 'Bert'  # Baumeister: hat Bretter aus der Ausrüstung
    d = axis(n)
    cx, cz = out[n]['x'], out[n]['z']
    time.sleep(3)  # Chunks rund um die Inseln erst laden lassen (sonst meldet „execute if block“ nur „failed“)
    edge = 1
    for k in range(1, 10):
        if 'passed' in at(f'execute if block {cx + d[0] * k} {out[n]["floor"]} {cz + d[1] * k} minecraft:air').lower():
            break
        edge = k
    out['bridge'] = {'actor': n, 'dir': list(d), 'edge': edge}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(RUNDE_FILE, 'w'), indent=1)
    print(json.dumps(out))
    tough(*ACTORS)


def camera_spectate():
    """Kamera schaut der Runde zu – nur dann sieht sie den Regen des Gewitters und die Nebelschwaden."""
    rc(f'regie als {CAM} zuschauen wolkenalm')
    rc(f'tag {CAM} add mm_bleib')


def camera_at(p, look, settle=4.0):
    # Der Wolkenhafen nimmt beim Betreten das Fliegen (setAllowFlight false) – dann fällt die Kamera auch als Zuschauer.
    # Einmal umschalten setzt die Fähigkeiten zurück.
    rc(f'gamemode adventure {CAM}')
    rc(f'gamemode spectator {CAM}')
    at(f'tp {CAM} {p[0]} {p[1]} {p[2]} facing {look[0]} {look[1]} {look[2]}')
    time.sleep(settle)


def park(*names):
    """Darsteller, die nicht mitspielen, auf ihre Inseln (außer Bild)."""
    for n in names:
        x, z, fy, _ = isl(n)
        at(f'tp {n} {x} {fy} {z}')


def prepare(s):
    at('time set 6000')
    ph = s['phase']
    if ph in ('kampf', 'nachschub', 'gewitter', 'nebel', 'sieg'):
        st = status()
        alive = [n for n in ACTORS if st and st.get(n, '').startswith('ALIVE')]
        tough(*alive)
        for n in alive:
            rc(f'effect give {n} minecraft:instant_health 1 3 true')
        park(*[n for n in alive if n not in s['spec'].get('actors', {})])
    if ph in ('kampf', 'nachschub'):  # Uhr der Runde anhalten (sonst kommen Nachschub/Gewitter von selbst)
        rc('wolkenkampf vorspulen 100 wolkenalm')
    if ph in ('gewitter', 'nebel', 'sieg') and 'SPECTATOR' not in rc('wolkenkampf status'):
        camera_spectate()  # nur Zuschauer der Runde sehen Regen und Nebelschwaden
        time.sleep(1)
    if ph == 'gewitter':
        rc('wolkenkampf vorspulen 698 wolkenalm')
        time.sleep(2.5)
    if ph == 'nebel':
        rc('wolkenkampf vorspulen 806 wolkenalm')
    if ph == 'sieg':
        rc('wolkenkampf vorspulen 640 wolkenalm')  # Nebel wieder hinunter
    if s['id'] == '06-bruecke':  # Brücke eines früheren Versuchs wegräumen
        b = R['bridge']
        bx, bz, by = math.floor(isl(b['actor'])[0]), math.floor(isl(b['actor'])[1]), isl(b['actor'])[2] - 1
        for k in range(b['edge'] + 1, b['edge'] + 9):
            at(f"setblock {bx + b['dir'][0] * k} {by} {bz + b['dir'][1] * k} minecraft:air")
    c0 = s['spec']['camera'][0]
    camera_at(c0['p'], c0.get('look', c0['p']), s.get('settle', 5))
    for n, path in s['spec'].get('actors', {}).items():
        p = path[0]['p']
        at(f'tp {n} {p[0]} {p[1]} {p[2]}')
    time.sleep(1.0)


def main(args):
    if args == ['runde']:
        start_round()
        return
    if args == ['zuschauen']:
        camera_spectate()
        return
    if args == ['raus']:
        camera_out()
        return
    for s in SHOTS:
        if args and s['id'] not in args:
            continue
        print(f'== vorbereiten {s["id"]}', flush=True)
        prepare(s)
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'make.py'), 'wolkenkampf', 'shot', s['id']], check=True)


if __name__ == '__main__':
    main(sys.argv[1:])
