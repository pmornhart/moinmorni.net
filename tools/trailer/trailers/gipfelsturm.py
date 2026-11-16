"""Trailer: Gipfelsturm – Parkour quer durch die Alpen: Basislager, acht Strecken, Bestzeiten, Strecke der Woche, Rennen.

Gedreht auf einem eigenen Test-Server mit Morni-Gipfelsturm (Paper 26.1.2 + ViaVersion/ViaBackwards für den 26.3-Client,
Fake-Netzwerk aus `test/fake-network` für das Party-Rennen, Port 25730, RCON 25830). Die Strecken stehen in der eigenen
Welt `minecraft:gipfelsturm` – alle Befehle mit Ort laufen über `execute in` (DIM).

Die Sprünge der Darsteller sind nachgerechnet wie im Spiel (Sprung 0,42, Schwerkraft 0,08, Luftwiderstand 0,98 pro
Tick, Leiter 2,35 Blöcke/s, Schleim federt zurück) – darum Einstellungen mit „fit: False“ (nicht gestreckt). Die Lage
der Sprungblöcke kommt aus `/gipfel pads <strecke>` (gespeichert in gipfelsturm-pads.json).

Echte Spielmechanik: In den Einstellungen mit Anzeige (hud) ist die Kamera selbst Läufer – die Zeit in der
Aktionsleiste, die Zwischenzeit am Checkpoint, der Titel „Geschafft!“ mit Medaille und der Countdown des Rennens kommen
vom Plugin. Dafür braucht der Server ein kleines Hilfs-Plugin (nur lokal im Test-Server): `regie als <spieler> <befehl>`
und „Spieler mit Tag mm_bleib bleiben Zuschauer“ (das Plugin setzt Läufer sonst auf Abenteuer – dann wäre die Kamera
weg); Quelle und Jar liegen lokal unter ~/mm-cache/trailer/gipfelsturm/regie-plugin/. Die Bestenlisten füllen echte
Läufe der Darsteller (`prep`). Kamera = echter Client „GipfelKamera“ (MM_CAMERA), mit `--option chatScale:0.0`
gestartet (Chat unsichtbar, Titel und Aktionsleiste bleiben). Darsteller: Anna Bert Clara Toni (actors.cjs, 26.1).

Gefunden beim Dreh: Die Tafel „Strecke der Woche“ (Chunk 0/0 bleibt geladen) fehlte der Kamera, nachdem sie auf einer
weit entfernten Strecke war – erst ein Sprachwechsel (`relang`) zeigt sie wieder.

Vorsicht: Die Kamera während eines Drehs nicht anderweitig teleportieren – ein langer Teleport-Weg quer durch eine
Ziel-Zone zählt für das Plugin als Zieleinlauf.

  python3 trailers/gipfelsturm.py prep                 # Bestenlisten füllen (echte Läufe der Darsteller)
  python3 trailers/gipfelsturm.py [einstellung …]      # vorbereiten + drehen (ohne Angabe: alle)
"""
import json, math, os, re, socket, subprocess, sys, time

STYLE = 'gipfelsturm'
FILE = 'MorniNet-Trailer-Gipfelsturm.mp4'
SLOW = 14
DIM = 'minecraft:gipfelsturm'
CAM = os.environ.get('MM_CAMERA', 'GipfelKamera')
ACTORS = ['Anna', 'Bert', 'Clara', 'Toni']
HERE = os.path.dirname(os.path.abspath(__file__))
COURSES = json.load(open(os.path.join(HERE, 'gipfelsturm-pads.json')))
SPB = 60 / 152 * 4  # Sekunden pro Takt (Musik „gipfelsturm“)
EXTRA = 0.35 + 0.25  # Überblendung + etwas Luft

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'morni.net · Spielmodus', 'title': 'Gipfelsturm',
     'text': 'Parkour quer durch die Alpen – von leicht bis extrem'},
    {'file': 'lt-lager.png', 'kind': 'lower', 'title': 'Das Basislager', 'text': 'Acht Strecken – Schild anklicken und los'},
    {'file': 'lt-alm.png', 'kind': 'lower', 'title': 'Almwiesen-Lauf', 'text': 'Leicht – über Trittsteine zum Heustadel'},
    {'file': 'lt-gletscher.png', 'kind': 'lower', 'title': 'Gletscherspalten', 'text': 'Leicht – von Eisturm zu Eisturm'},
    {'file': 'lt-kletter.png', 'kind': 'lower', 'title': 'Kletterwand', 'text': 'Mittel – Leitern hinauf, schmale Felsbänder'},
    {'file': 'lt-grat.png', 'kind': 'lower', 'title': 'Felsgrat', 'text': 'Die Zeit läuft – auf die Millisekunde'},
    {'file': 'lt-seilbahn.png', 'kind': 'lower', 'title': 'Seilbahn-Masten', 'text': 'Schwer – mit Schwung vom Schleimblock'},
    {'file': 'lt-eis.png', 'kind': 'lower', 'title': 'Eishöhle', 'text': 'Schwer – rutschiges Blaueis, niedrige Decken'},
    {'file': 'lt-sprint.png', 'kind': 'lower', 'title': 'Gipfelkreuz-Sprint', 'text': 'Extrem – weite Sprünge über den Abgrund'},
    {'file': 'lt-turm.png', 'kind': 'lower', 'title': 'Wetterturm', 'text': 'Extrem – rund um den Turm nach oben'},
    {'file': 'lt-ziel.png', 'kind': 'lower', 'title': 'Im Ziel', 'text': 'Bestzeit und Medaille – bis zum Gipfel ▲'},
    {'file': 'lt-woche.png', 'kind': 'lower', 'title': 'Strecke der Woche', 'text': 'Jeden Montag neu – mit eigener Bestenliste'},
    {'file': 'lt-rennen.png', 'kind': 'lower', 'title': 'Party-Rennen', 'text': 'Mit Freunden um die Wette'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'morni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Gipfelsturm“ anklicken'},
]

# ---------------------------------------------------------------- Sprungblöcke

POSTS = ('fence', 'wall', 'iron_bars')


class Pad:
    def __init__(self, course, i):
        q = COURSES[course]['pads'][i]
        self.i, self.role, self.kind = i, q[0], q[1]
        self.x0, self.x1, self.z0, self.z1, self.s, self.b = q[2], q[3], q[4], q[5], q[6], q[7]
        self.ladder = q[8] if len(q) > 8 else None
        self.post = any(k in self.b for k in POSTS)

    @property
    def c(self):
        return [(self.x0 + self.x1 + 1) / 2, self.s, (self.z0 + self.z1 + 1) / 2]

    def half(self, d):
        """Halbe Breite in Richtung d (Einheitsvektor x/z); Pfosten haben nur eine schmale Oberseite."""
        if self.post:
            return 0.0
        return abs(d[0]) * (self.x1 - self.x0 + 1) / 2 + abs(d[1]) * (self.z1 - self.z0 + 1) / 2

    def at(self, d, off):
        c = self.c
        return [c[0] + d[0] * off, self.s, c[2] + d[1] * off]


def pads(course):
    return [Pad(course, i) for i in range(len(COURSES[course]['pads']))]


def unit(a, b):
    dx, dz = b[0] - a[0], b[2] - a[2]
    n = math.hypot(dx, dz) or 1
    return [dx / n, dz / n]


# ---------------------------------------------------------------- Bewegung wie im Spiel

TICK = 0.05


def arc(dy, vy=0.42):
    """Höhen pro Tick bei einem Sprung (oder Fall mit vy=0), bis man auf Höhe dy landet. Liefert (Höhen, Endgeschw.)."""
    ys, y, v = [], 0.0, vy
    for _ in range(400):
        ny = y + v
        if v < 0 and ny <= dy:
            ys.append(dy)
            return ys, v
        ys.append(ny)
        y, v = ny, (v - 0.08) * 0.98
    raise ValueError(f'Sprung auf {dy} nicht möglich')


class Way:
    """Weg eines Darstellers (Füße) als Stützpunkte für shot.py (gerade Stücke, 't' = Sekunden seit dem vorigen)."""

    def __init__(self, p, t=0.0):
        self.pts = [{'p': [round(v, 3) for v in p], 't': t}]
        self.cur = list(p)
        self.time = t
        self.marks = {}

    def go(self, q, dt, **kw):
        self.pts.append({'p': [round(v, 3) for v in q], 't': round(dt, 4), **kw})
        self.cur = list(q)
        self.time += dt
        return self

    def hold(self, dt, **kw):
        return self.go(self.cur, dt, **kw)

    def run(self, q, speed=5.6):
        d = math.dist(self.cur, q)
        return self.go(q, d / speed) if d > 0.02 else self

    def jump(self, q, vy=0.42):
        a = list(self.cur)
        ys, _ = arc(q[1] - a[1], vy)
        n = len(ys)
        for k, y in enumerate(ys, 1):
            u = k / n
            self.go([a[0] + (q[0] - a[0]) * u, a[1] + y, a[2] + (q[2] - a[2]) * u], TICK)
        return self

    def bounce(self, slime, q):
        """Vom aktuellen Punkt auf den Schleim (slime = Landepunkt) springen, zurückfedern und auf q landen."""
        a = list(self.cur)
        ys, v = arc(slime[1] - a[1])
        n = len(ys)
        for k, y in enumerate(ys, 1):
            u = k / n
            self.go([a[0] + (slime[0] - a[0]) * u, a[1] + y, a[2] + (slime[2] - a[2]) * u], TICK)
        ys2, _ = arc(q[1] - slime[1], -v)
        n = len(ys2)
        for k, y in enumerate(ys2, 1):
            u = k / n
            self.go([slime[0] + (q[0] - slime[0]) * u, slime[1] + y, slime[2] + (q[2] - slime[2]) * u], TICK)
        return self

    def climb(self, top, speed=2.35):
        return self.go([self.cur[0], top, self.cur[2]], (top - self.cur[1]) / speed)


def course_way(course, i0, i1, t0=0.0, sprint=5.6, side=0.0, mark=None, ice=8.0, shift=0.0):
    """Weg über die Strecke von Pad i0 (stehend, Mitte) bis Pad i1. side = seitlicher Versatz (zwei Läufer nebeneinander).
    mark: Liste von Pad-Nummern, deren Landezeit in way.marks festgehalten wird."""
    P = pads(course)
    a = P[i0]
    first = P[i0 + 1]
    d0 = unit(a.c, first.c)
    perp = [-d0[1], d0[0]]
    w = Way([a.c[0] + perp[0] * side + d0[0] * shift, a.s, a.c[2] + perp[1] * side + d0[1] * shift])
    if t0:
        w.hold(t0)
    i = i0
    while i < i1:
        p, q = P[i], P[i + 1]
        d = unit(p.c, q.c)
        if q.kind == 'L':  # Leiter: an der Wand hoch, oben nach vorn auf den Pad
            lad = q.ladder
            lx, ly, lz = lad[0]
            foot = [lx + 0.5 + d[0] * 0.2, ly, lz + 0.5 + d[1] * 0.2]
            if abs(foot[1] - w.cur[1]) > 0.1:
                w.run(p.at(d, p.half(d) - 0.15), sprint)
                w.jump(foot)
            else:
                w.run(foot, 4.3)
            w.climb(q.s + 0.15)
            w.go([foot[0] + d[0] * 0.5, q.s + 0.4, foot[2] + d[1] * 0.5], 0.15)
            w.go(q.at(d, -q.half(d) + 0.4), 0.15)
            i += 1
        elif P[i + 1].b == 'slime_block' and i + 2 <= i1 and P[i + 2].kind == 'B':  # Schleim: runter und hoch
            s, b = P[i + 1], P[i + 2]
            w.run(p.at(d, p.half(d) - 0.1), sprint)
            d2 = unit(s.c, b.c)
            w.bounce(s.c, b.at(d2, -b.half(d2) + 0.35 if not b.post else 0))
            i += 2
        else:
            take = p.at(d, max(0.0, p.half(d) - 0.12))
            land = q.at(d, -(q.half(d) - 0.35) if q.half(d) > 0.6 else (-0.12 if not q.post else 0))
            if side:  # nebeneinander bleiben, soweit der Pad breit genug ist
                pp = [-d[1], d[0]]
                for pt, pad in ((take, p), (land, q)):
                    room = max(0.0, pad.half(pp) - 0.3)
                    o = max(-room, min(room, side))
                    pt[0] += pp[0] * o
                    pt[2] += pp[1] * o
            w.run(take, ice if p.b in ('blue_ice', 'packed_ice') else sprint)
            w.jump(land)
            i += 1
        if mark and i in mark:
            w.marks[i] = w.time
    return w


def trim(pts, T):
    """Weg nach T Sekunden abschneiden (der Rest käme nicht mehr ins Bild)."""
    out, acc = [pts[0]], 0.0
    for q in pts[1:]:
        if acc + q['t'] > T + 0.05:
            break
        out.append(q)
        acc += q['t']
    return out


def stand(p, T, look=None):
    q = {'p': list(p), 't': 0}
    r = {'p': list(p), 't': T}
    if look:
        q['look'] = r['look'] = look
    return [q, r]


def walk(points, speed=1.6, look=None, hold=0.0):
    out = [{'p': list(points[0]), 't': 0}]
    for a, b in zip(points, points[1:]):
        out.append({'p': list(b), 't': math.dist(a, b) / speed})
    if hold:
        q = {'p': list(points[-1]), 't': 0.3}
        r = {'p': list(points[-1]), 't': hold}
        if look:
            q['look'] = r['look'] = look
        out += [q, r]
    return out


def cmd(t, c):
    return {'at': t, 'cmd': f'execute in {DIM} run {c}'}


def act(t, a, what, arg=''):
    return {'at': t, 'actor': a, 'act': what, 'arg': arg}


def need(bars, start=0.0):
    return start + bars * SPB + EXTRA


def follow(way, offset, times, look_up=1.1):
    """Kamera, die einem Darsteller folgt: zu den Zeitpunkten `times` steht sie bei Läufer + offset (dx, dy, dz)."""
    out, last = [], 0.0
    for t in times:
        p = pos_at(way.pts, t)
        out.append({'p': [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]], 't': t - last})
        last = t
    return out


def pos_at(pts, t):
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        if acc + b['t'] >= t:
            u = (t - acc) / b['t'] if b['t'] else 1
            return [x + (y - x) * u for x, y in zip(a['p'], b['p'])]
        acc += b['t']
    return pts[-1]['p']


def pad_eye(p, h=1.62):
    return [p[0], p[1] + h, p[2]]


# ---------------------------------------------------------------- Einstellungen

def pov(way, dips=(), h=1.62, ahead=0.5, down=0.7, t_end=None):
    """Kamera = Augen eines Läufers (Ich-Sicht), alle 0,05 s ein Punkt. dips: Landezeiten, an denen die Kamera kurz in
    die Knie geht – so liegt der Läufer für das Plugin im Checkpoint/Ziel (dessen Zone reicht nur 1 Block über den Pad)."""
    total = sum(q['t'] for q in way.pts[1:])
    end = min(total, t_end) if t_end is not None else total
    out, last_dir, k = [], [1, 0], 0
    while k * TICK <= end + 1e-6:
        t = k * TICK
        y = h
        for tm in dips:
            u = t - tm
            if 0 <= u < 0.1:
                y = h - 0.82 * u / 0.1
            elif 0.1 <= u < 0.25:
                y = h - 0.82
            elif 0.25 <= u < 0.7:
                y = h - 0.82 * (1 - (u - 0.25) / 0.45) ** 2
        f = pos_at(way.pts, t)
        la = pos_at(way.pts, t + ahead)
        if math.hypot(la[0] - f[0], la[2] - f[2]) < 1.5:  # steht still: geradeaus in Laufrichtung schauen
            e = way.pts[-1]['p']
            d = unit(f, e) if math.hypot(e[0] - f[0], e[2] - f[2]) > 0.5 else last_dir
            la = [f[0] + d[0] * 4, f[1] - 0.2, f[2] + d[1] * 4]
        last_dir = unit(f, la)
        out.append({'p': [round(f[0], 3), round(f[1] + y, 3), round(f[2], 3)],
                    'look': [round(la[0], 3), round(la[1] + h - down, 3), round(la[2], 3)], 't': TICK if k else 0})
        k += 1
    return out


def station_at(i, r):
    a = math.radians(200 + 140 * i / 7)
    return [round(math.cos(a) * r, 2), 100, round(math.sin(a) * r, 2)]


# 03 Almwiese: Anna über die Trittsteine (Checkpoint 1 → Pad 15), Bert ein Stück hinter ihr
ALM_A = course_way('almwiese', 8, 15, 0.3)
ALM_B = course_way('almwiese', 8, 12, 1.5)
# 04 Gletscher: Bert vom Start über die Eistürme
GLET = course_way('gletscher', 0, 6, 0.3)
# 05 Kletterwand: Clara die Leiter hinauf
KLET = course_way('kletterwand', 3, 7, 0.2)
# 06 Felsgrat: die Kamera läuft selbst (Ich-Sicht) vom Start bis zum Checkpoint 1 (Pad 8)
GRAT = course_way('felsgrat', 0, 8, 0.6, mark=[8])
GRAT.hold(1.8)
# 07 Seilbahn: Toni über Zaunpfosten, runter auf den Schleim, hoch auf den nächsten Pad
SEIL = course_way('seilbahn', 15, 21, 0.2)
# 08 Eishöhle: Anna über das Blaueis
EIS = course_way('eishoehle', 8, 12, 0.2)
# 09 Gipfelkreuz-Sprint: Bert über die Vierer-Lücken
SPRINT = course_way('gipfelkreuz', 0, 4, 0.3, sprint=5.8)
# 10 Wetterturm: Clara hoch oben über Gitter und Schleim
TURM = course_way('wetterturm', 31, 37, 0.2)
# 11 Ziel: die Kamera (Ich-Sicht) über die letzten Pads des Gipfelkreuz-Sprints ins Ziel
ZIEL = course_way('gipfelkreuz', 36, 41, 0.2, sprint=5.8, mark=[41])
ZIEL.go([3638.3, 100, 20.9], 0.5).hold(1.9)
# 13 Rennen: Anna, Bert und die Kamera auf dem Start des Almwiesen-Laufs, Countdown vom Plugin, dann los
RACE_GO = 3.05  # „Los!“ kommt 61 Ticks nach dem Beitritt (bei t = 0)
RACE_A = course_way('almwiese', 0, 4, RACE_GO + 0.05, side=-0.6, shift=1.0)
RACE_B = course_way('almwiese', 0, 4, RACE_GO + 0.12, side=0.6, shift=1.0)
RACE_C = course_way('almwiese', 0, 3, RACE_GO + 0.95, shift=-1.65)

_g = pos_at(GRAT.pts, GRAT.marks[8])
GRAT_CAM = pov(GRAT, [GRAT.marks[8]], t_end=GRAT.marks[8] + 0.3)
GRAT_CAM += [{'p': [_g[0] - 0.1, _g[1] + 1.35, _g[2]], 'look': [2029.5, 100.6, 5.5], 't': 0.6, 'ease': 1},
             {'p': [_g[0] - 0.15, _g[1] + 1.5, _g[2] + 0.05], 'look': [2028.5, 100.4, 7.5], 't': 0.6}]
CROSS = [3637.5, 104.6, 15.5]  # Gipfelkreuz am Ziel (nördlich der Diamant-Plattform)
ZIEL_CAM = pov(ZIEL, [ZIEL.marks[41]], t_end=ZIEL.marks[41] + 0.75)
ZIEL_CAM += [{'p': [3639.0, 101.55, 21.6], 'look': [3638.6, 103.6, 17.0], 't': 0.75, 'ease': 1},
             {'p': [3639.8, 101.65, 22.2], 'look': CROSS, 't': 1.0, 'ease': 1},
             {'p': [3640.1, 101.75, 22.4], 'look': CROSS, 't': 0.8}]

N2 = need(2)
SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'far': True, 'spec': {
        'camera': [{'p': [100, 142, 116], 'look': [0, 104, -4], 't': 0},
                   {'p': [56, 127, 74], 'look': [0, 103, -5], 't': 3.6},
                   {'p': [15, 114, 31], 'look': [0, 101.5, -5], 't': 3.6, 'ease': 1}],
        'actors': {'Anna': walk([[-3, 100, 9], [-6, 100, -2]], 1.4),
                   'Bert': walk([[4, 100, 8], [6.5, 100, -1.5]], 1.4),
                   'Clara': stand(station_at(1, 10.8), 8, [*station_at(1, 13)[:1], 101.6, station_at(1, 13)[2]]),
                   'Toni': walk([[1.5, 100, -4], [0.5, 100, -11]], 1.2)}}},
    {'id': '02-lager', 'bars': 2, 'card': 'lt-lager.png', 'far': True, 'spec': {
        'camera': [{'p': [-9.5, 102.4, 1.5], 'look': [-9, 103.2, -12], 't': 0},
                   {'p': [-1.5, 102.6, 0.5], 'look': [-1, 103.4, -13], 't': 2.4},
                   {'p': [6.5, 102.4, 1.5], 'look': [6, 103.2, -12], 't': 2.4, 'ease': 1}],
        'actors': {'Anna': walk([[-2.5, 100, -3.5], station_at(2, 10.6)], 1.8, hold=1.5,
                                look=[station_at(2, 13)[0], 101.4, station_at(2, 13)[2]]),
                   'Clara': stand(station_at(4, 10.6), 5, [station_at(4, 13)[0], 102.6, station_at(4, 13)[2]]),
                   'Toni': stand(station_at(5, 10.9), 5, [station_at(5, 13)[0], 102.4, station_at(5, 13)[2]]),
                   'Bert': walk([[10, 100, -3], [3, 100, -8.5]], 1.7)},
        'events': [act(2.9, 'Anna', 'swing'), act(3.3, 'Anna', 'swing')]}},
    {'id': '03-alm', 'bars': 2, 'card': 'lt-alm.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Anna',
        'camera': follow(ALM_A, (-5.8, 1.7, 2.2), [0, N2 / 2, N2]),
        'actors': {'Anna': trim(ALM_A.pts, N2), 'Bert': trim(ALM_B.pts, N2)}}},
    {'id': '04-gletscher', 'bars': 2, 'card': 'lt-gletscher.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Bert',
        'camera': follow(GLET, (-1.0, 1.4, 5.2), [0, N2 / 2, N2]),
        'actors': {'Bert': trim(GLET.pts, N2)}}},
    {'id': '05-kletter', 'bars': 2, 'card': 'lt-kletter.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Clara',
        'camera': follow(KLET, (-3.2, 1.0, 4.2), [0, N2 / 2, N2]),
        'actors': {'Clara': trim(KLET.pts, N2)}}},
    {'id': '06-grat', 'bars': 2, 'card': 'lt-grat.png', 'cardEnd': 2.2, 'far': True, 'hud': True,
     'runner': 'felsgrat', 'start': GRAT.marks[8] + 0.75 - 2 * SPB, 'spec': {
        'fit': False, 'camera': GRAT_CAM}},
    {'id': '07-seilbahn', 'bars': 2, 'card': 'lt-seilbahn.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Toni',
        'camera': follow(SEIL, (6.0, 1.3, -1.0), [0, N2 / 2, N2]),
        'actors': {'Toni': trim(SEIL.pts, N2)}}},
    {'id': '08-eis', 'bars': 2, 'card': 'lt-eis.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Anna',
        'camera': follow(EIS, (3.8, 1.5, -2.2), [0, N2 / 2, N2]),
        'actors': {'Anna': trim(EIS.pts, N2)}}},
    {'id': '09-sprint', 'bars': 2, 'card': 'lt-sprint.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Bert',
        'camera': follow(SPRINT, (-1.2, 1.5, 6.2), [0, N2 / 2, N2]),
        'actors': {'Bert': trim(SPRINT.pts, N2)}}},
    {'id': '10-turm', 'bars': 2, 'card': 'lt-turm.png', 'far': True, 'spec': {
        'fit': False, 'track': 'Clara',
        'camera': [{'p': [3984.5, 123.8, 8.2], 't': 0}, {'p': [3979.5, 122.6, 8.0], 't': N2 / 2},
                   {'p': [3974.0, 121.4, 7.2], 't': N2 / 2}],
        'actors': {'Clara': trim(TURM.pts, N2)}}},
    {'id': '11-ziel', 'bars': 2, 'card': 'lt-ziel.png', 'cardAt': 1.4, 'far': True, 'hud': True,
     'runner': 'gipfelkreuz', 'target': 35.8, 'start': max(0.0, ZIEL.marks[41] - 1.2), 'spec': {
        'fit': False, 'camera': ZIEL_CAM}},
    {'id': '12-woche', 'bars': 2, 'card': 'lt-woche.png', 'far': True, 'relang': True, 'spec': {
        'camera': [{'p': [-1.4, 102.6, 9.8], 'look': [0.5, 105.9, 0.5], 't': 0},
                   {'p': [-0.4, 103.3, 7.2], 'look': [0.5, 106.0, 0.5], 't': 2.4},
                   {'p': [1.2, 103.9, 5.3], 'look': [0.5, 106.0, 0.5], 't': 2.4, 'ease': 1}],
        'actors': {'Anna': stand([-1.6, 100, 3.2], 5, [0.5, 105, 0.5]),
                   'Bert': stand([2.7, 100, 2.6], 5, [0.5, 105, 0.5]),
                   'Toni': walk([[-6, 100, -1.5], [-2.8, 100, -0.8]], 1.2, hold=2.4, look=[0.5, 105, 0.5])}}},
    {'id': '13-rennen', 'bars': 2, 'card': 'lt-rennen.png', 'cardAt': 0.6, 'far': True, 'hud': True, 'race': True,
     'start': RACE_GO - 1.35, 'spec': {
        'fit': False,
        'camera': pov(RACE_C, h=1.8, t_end=5.6),
        'actors': {'Anna': trim(RACE_A.pts, 5.6), 'Bert': trim(RACE_B.pts, 5.6)},
        'events': [{'at': 0.0, 'cmd': 'regie als Bert gipfel mitmachen'}]}},
    {'id': '14-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'time': 12350, 'far': True, 'spec': {
        'camera': [{'p': [3644.0, 101.6, 17.5], 'look': [3637.0, 102.4, 19.5], 't': 0},
                   {'p': [3648.5, 103.8, 15.0], 'look': [3637.0, 103.0, 19.5], 't': 3.2},
                   {'p': [3657.0, 108.0, 11.0], 'look': [3636.5, 104.0, 19.0], 't': 4.0, 'ease': 1}],
        'actors': {'Anna': stand([3636.2, 100, 19.4], 8, [3641.5, 104, 20.5]),
                   'Bert': stand([3636.6, 100, 21.8], 8, [3641.5, 104, 20.5]),
                   'Clara': stand([3634.8, 100, 20.6], 8, [3641.5, 104, 20.5]),
                   'Toni': stand([3638.4, 100, 22.6], 8, [3641.5, 104, 20.5])},
        'events': [act(t, n, 'swing') for t, n in [(0.6, 'Anna'), (0.9, 'Bert'), (1.3, 'Clara'), (1.6, 'Toni'),
                                                   (2.4, 'Anna'), (2.8, 'Bert')]]}},
]
for _s in SHOTS:
    _s['spec']['dim'] = DIM

# ---------------------------------------------------------------- Vorbereiten und drehen

sys.path.insert(0, os.path.join(HERE, '..', '..', 'mc-client'))


class Rcon:
    def __init__(self):
        import rcon as R
        self.R = R
        host, port = os.environ['MM_RCON'].rsplit(':', 1)
        self.s = socket.create_connection((host, int(port)), timeout=30)
        self.s.sendall(R.packet(1, 3, os.environ['MM_RCON_PASS'])); R.read(self.s)
        self.i = 2

    def __call__(self, c):
        self.i += 1
        self.s.sendall(self.R.packet(self.i, 2, c))
        return re.sub(r'§.', '', self.R.read(self.s)[1])


def say(name, what, arg=''):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        f.write(f'{name} {what} {arg}\n')


def key(k):
    subprocess.run(['xdotool', 'key', k], env=dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':101')), check=True)


def prepare(rc, s):
    """Tageszeit, Kamera vorab hinstellen (Chunks laden). Bei „runner“ läuft die Kamera selbst die Strecke (echter Lauf
    im Plugin), bei „target“ vorher schon alle Checkpoints, bei „race“ ist sie Teil eines echten Party-Rennens."""
    rc(f'execute in {DIM} run time set {s.get("time", 6000)}')
    rc(f'execute in {DIM} run weather clear')
    rc(f'tag {CAM} add mm_bleib')
    rc(f'gamemode spectator {CAM}')
    c0 = s['spec']['camera'][0]
    look = c0.get('look', [c0['p'][0], c0['p'][1], c0['p'][2] - 5])
    goto = lambda p: rc(f'execute in {DIM} run tp {CAM} {p[0]} {p[1]} {p[2]} facing {look[0]} {look[1]} {look[2]}')
    goto(c0['p'])
    time.sleep(float(s.get('settle', 14 if s.get('far') else 4)))
    launch_at = None
    if s.get('relang'):  # Tafeln je Sprache neu zeigen (nach weiten Wegen fehlte der Kamera die Wochen-Tafel)
        rc(f'fakenet lang {CAM} en')
        time.sleep(2.5)
        rc(f'fakenet lang {CAM} de')
        time.sleep(2.5)
    if s.get('runner'):
        course = s['runner']
        print(rc(f'regie als {CAM} gipfel start {course}'))
        time.sleep(2.5)
        if s.get('target'):  # schon unterwegs: Start verlassen, alle Checkpoints der Reihe nach
            P = pads(course)
            goto([P[1].c[0], P[1].s + 0.5, P[1].c[2]])
            t0 = time.time()
            time.sleep(0.6)
            for p in P:
                if p.role == 'C':
                    goto([p.c[0], p.s + 0.5, p.c[2]])
                    time.sleep(0.4)
            launch_at = t0 + s['target'] - 7.6 - (s['spec']['camera'] and ZIEL.marks[41] + 0.1)
        goto(c0['p'])
        time.sleep(1.0)
    if s.get('race'):
        rc(f'fakenet party Anna Bert {CAM}')
        for n in ('Anna', 'Bert'):
            rc(f'regie als {n} gipfel basislager')
        time.sleep(1.0)
        rc('regie als Anna gipfel start almwiese')
        time.sleep(2.5)
        print(rc(f'regie als {CAM} gipfel mitmachen'))
        time.sleep(0.5)
        goto(c0['p'])
    if s.get('hud'):
        key('F1')
    if launch_at:
        wait = launch_at - time.time()
        print(f'warte {wait:.1f}s bis zum Dreh', flush=True)
        time.sleep(max(0.0, wait))


def finish(rc, s):
    if s.get('hud'):
        key('F1')
    if s.get('runner') or s.get('race'):
        rc(f'regie als {CAM} gipfel aufgeben')
    if s.get('race'):
        for n in ('Anna', 'Bert'):
            rc(f'regie als {n} gipfel aufgeben')
        rc('fakenet clear')


# Echte Läufe für die Bestenlisten: (Strecke, Anteil an der Medaillen-Grenze) – Gipfel ▲, Gold, Silber gemischt.
PREP = {
    'Anna': [('gletscher', 'gipfel', .92), ('almwiese', 'gipfel', .9), ('felsgrat', 'gipfel', .9),
             ('kletterwand', 'gipfel', .95), ('seilbahn', 'gipfel', .93), ('eishoehle', 'gipfel', .95),
             ('wetterturm', 'gipfel', .97)],
    'Bert': [('gletscher', 'gold', .88), ('almwiese', 'gold', .86), ('felsgrat', 'gold', .9), ('seilbahn', 'gold', .87),
             ('eishoehle', 'gold', .9)],
    'Clara': [('gletscher', 'silber', .8), ('almwiese', 'silber', .82), ('kletterwand', 'gold', .95),
              ('wetterturm', 'gold', .93)],
    'Toni': [('gletscher', 'gold', .97), ('almwiese', 'gold', .97), ('kletterwand', 'silber', .74)],
}


def real_run(rc, who, course, target_ms, log=print):
    """Ein echter Lauf eines Darstellers: Start per Befehl, Checkpoints der Reihe nach, Ziel nach target_ms."""
    P = pads(course)
    say(who, 'chat', f'/gipfel start {course}')
    time.sleep(2.5)
    tp = lambda p, h=0.0: rc(f'execute in {DIM} run tp {who} {p.c[0]} {p.s + h} {p.c[2]}')
    tp(P[1])
    t0 = time.time()
    time.sleep(0.6)
    for p in P:
        if p.role == 'C':
            tp(p)
            time.sleep(0.4)
    left = target_ms / 1000 - (time.time() - t0)
    time.sleep(max(0.0, left))
    tp(P[-1])
    log(f'{who}: {course} nach {time.time() - t0:.2f}s')
    time.sleep(1.5)


def prep():
    import threading

    def worker(who):
        rc = Rcon()
        for course, medal, f in PREP[who]:
            real_run(rc, who, course, COURSES[course]['medals'][medal] * f, lambda m: print(m, flush=True))
        say(who, 'chat', '/gipfel basislager')

    th = [threading.Thread(target=worker, args=(a,)) for a in PREP]
    for i, t in enumerate(th):
        t.start()
        time.sleep(0.7)
    for t in th:
        t.join()


def check(ids):
    """Kamerawege gegen die Welt prüfen: steckt die Kamera irgendwo in einem Block?"""
    sys.path.insert(0, os.path.join(HERE, '..'))
    import shot as S
    rc = Rcon()
    for s in SHOTS:
        if ids and s['id'] not in ids:
            continue
        cam = S.Path(s['spec']['camera'], True)
        xs = [q['p'][0] for q in s['spec']['camera']]
        zs = [q['p'][2] for q in s['spec']['camera']]
        rc(f'execute in {DIM} run forceload add {int(min(xs)) - 2} {int(min(zs)) - 2} {int(max(xs)) + 2} {int(max(zs)) + 2}')
        time.sleep(2)
        bad = []
        t = 0.0
        while t <= cam.end:
            p = cam.pos(t)
            for dx, dy, dz in [(0, 0, 0), (0.2, 0, 0), (-0.2, 0, 0), (0, 0, 0.2), (0, 0, -0.2), (0, 0.2, 0), (0, -0.2, 0)]:
                q = [math.floor(p[0] + dx), math.floor(p[1] + dy), math.floor(p[2] + dz)]
                r = rc(f'execute in {DIM} if block {q[0]} {q[1]} {q[2]} #minecraft:replaceable')
                if 'passed' not in r and 'loaded' not in r:
                    r2 = rc(f'execute in {DIM} if block {q[0]} {q[1]} {q[2]} minecraft:air')
                    if 'passed' not in r2:
                        bad.append((round(t, 2), q))
                        break
            t += 0.1
        rc(f'execute in {DIM} run forceload remove all')
        print(s['id'], 'frei' if not bad else f'{len(bad)} mal im Block: {bad[:6]}', flush=True)


def main(ids):
    if ids == ['prep']:
        return prep()
    if ids[:1] == ['check']:
        return check(ids[1:])
    rc = Rcon()
    for s in SHOTS:
        if ids and s['id'] not in ids:
            continue
        print(f'== vorbereiten {s["id"]}', flush=True)
        prepare(rc, s)
        try:
            subprocess.run([sys.executable, os.path.join(HERE, '..', 'make.py'), 'gipfelsturm', 'shot', s['id']], check=True)
        finally:
            finish(rc, s)


if __name__ == '__main__':
    main(sys.argv[1:])
