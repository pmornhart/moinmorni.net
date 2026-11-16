"""Trailer: Duels – Turnierhof, vier Arenen, Klassisch/Modern/Fähigkeiten, 2 gegen 2, Wertung und Ranglisten.

Die Kämpfe sind echt: Vor jeder Kampf-Einstellung fordern sich die Darsteller per Befehl heraus (bzw. melden sich in
der Warteschlange an), der Kampf läuft im Plugin (Ausrüstung, Schaden, Suppe, Fähigkeiten, Wertung, Feuerwerk) –
nur die Wege der Darsteller und die Kamera kommen aus dem Drehbuch (die Arena wählt das Plugin zufällig, die
Darsteller werden in die gewünschte Arena gestellt). Darum nicht mit `make.py duels shot`, sondern so drehen:

  python3 trailers/duels.py [einstellung …]      # vorbereiten + drehen (ohne Angabe: alle)

Server: Morni-Duels `test/run.sh` (Port 25720, RCON 25820) mit ViaVersion für den 26.3-Client, danach in
config.yml: zeitlimit-sekunden 3600, countdown-sekunden 1, nachspiel-sekunden 5; fake.properties:
party.Anna=Anna,Carla und party.Toni=Toni,Dora; Fähigkeiten in spieler/<uuid>.yml (Anna jaeger, Toni bergfuehrer,
Carla schmied, Dora kraeuterfrau). Darsteller (`actors.cjs`): Anna Toni Carla Dora Otto Fritz – mit den Handlungen
„attack <Name>“ und „use off“.
Vorher ein paar echte gewertete Kämpfe, damit die Ranglisten gefüllt sind.
"""
import json, math, os, re, socket, subprocess, sys, time

STYLE = 'duels'
FILE = 'MorniNet-Trailer-Duels.mp4'
SLOW = 12
DIM = 'minecraft:duels'
Y = 101  # Boden von Turnierhof und Arenen (Füße)
ACTORS = ['Anna', 'Toni', 'Carla', 'Dora', 'Otto', 'Fritz']
CAM = os.environ.get('MM_CAMERA', 'MorniTest')

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'morni.net · Spielmodus', 'title': 'Duels',
     'text': 'Eins gegen eins – oder zwei gegen zwei'},
    {'file': 'lt-hof.png', 'kind': 'lower', 'title': 'Der Turnierhof', 'text': 'Hier triffst du deine Gegner'},
    {'file': 'lt-kit.png', 'kind': 'lower', 'title': 'Kit-Editor', 'text': 'Ordne deine Ausrüstung, wie du willst'},
    {'file': 'lt-klassisch.png', 'kind': 'lower', 'title': 'Klassisch',
     'text': 'Pilzsuppe heilt sofort – auf der Almwiese'},
    {'file': 'lt-modern.png', 'kind': 'lower', 'title': 'Modern', 'text': 'Schild, Axt und Bogen – im Burghof'},
    {'file': 'lt-faehigkeiten.png', 'kind': 'lower', 'title': 'Fähigkeiten',
     'text': 'Bergführer, Schmied, Kräuterfrau, Jäger – im Bergwerk'},
    {'file': 'lt-zwei.png', 'kind': 'lower', 'title': '2 gegen 2', 'text': 'Mit deiner Party – im Wirtshausgarten'},
    {'file': 'lt-sieg.png', 'kind': 'lower', 'title': 'Gewertet', 'text': 'Jeder Sieg bringt Punkte für die Rangliste'},
    {'file': 'lt-rangliste.png', 'kind': 'lower', 'title': 'Ranglisten', 'text': 'Für jede Kampfart – wer steht oben?'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'morni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Duels“ anklicken'},
]

# Arenen (Mitte, Kopie 0): x = (Art + 1) · 1000
ALM, BURG, BERG, WIRT = 1000.5, 2000.5, 3000.5, 4000.5
OPP = {'Anna': 'Toni', 'Toni': 'Anna', 'Carla': 'Dora', 'Dora': 'Carla'}


def eye(p):
    return [p[0], p[1] + 1.62, p[2]]


def fight(keys, opp=None, look=None):
    """Wege für Kämpfende aus Schlüsselbildern [(dt, {Name: (x, z) | (x, y, z)}), …].
    Jeder schaut an jedem Punkt seinen Gegner an (opp) – oder auf einen festen Punkt (look[Name])."""
    opp = opp or OPP
    look = look or {}
    names = list(keys[0][1].keys())
    cur, paths = {}, {n: [] for n in names}
    for dt, frame in keys:
        for n, q in frame.items():
            cur[n] = [q[0], Y, q[1]] if len(q) == 2 else list(q)
        for n in names:
            o = opp.get(n)
            target = look.get(n) or (eye(cur[o]) if o in cur else None)
            pt = {'p': list(cur[n]), 't': dt if paths[n] else 0}
            if target:
                pt['look'] = target
            paths[n].append(pt)
    return paths


def walk(points, T, look=None, share=1.0):
    """Gehweg mit gleichmäßigem Tempo in share·T Sekunden; danach stehen bleiben (optional mit Blickziel) bis T."""
    total = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
    out = [{'p': points[0], 't': 0}]
    for a, b in zip(points, points[1:]):
        out.append({'p': b, 't': share * T * math.dist(a, b) / total})
    if share < 1:
        q = {'p': points[-1], 't': 0.3}
        r = {'p': points[-1], 't': (1 - share) * T - 0.3}
        if look:
            q['look'] = r['look'] = look
        out += [q, r]
    return out


def stand(p, look, hold=8.0):
    return [{'p': p, 't': 0, 'look': look}, {'p': p, 't': hold, 'look': look}]


def hit(t, a, b):
    return {'at': t, 'actor': a, 'act': 'attack', 'arg': b}


def act(t, a, what, arg=''):
    return {'at': t, 'actor': a, 'act': what, 'arg': arg}


def cmd(t, c):
    return {'at': t, 'cmd': f'execute in {DIM} run {c}'}


# ------------------------------------------------------------------ Turnierhof: Leute im Hof

def courtyard(T):
    return {
        'Anna': walk([[-5.0, Y, -9.5], [-2.0, Y, -3.6]], T, [0.0, Y + 1.62, -2.4], 0.7),
        'Toni': walk([[4.5, Y, -7.0], [0.0, Y, -2.4]], T, [-2.0, Y + 1.62, -3.6], 0.7),
        'Carla': stand([-8.6, Y, -8.2], [-7.0, Y + 1.62, -9.6], T),
        'Dora': stand([-7.0, Y, -9.6], [-8.6, Y + 1.62, -8.2], T),
        'Otto': stand([14.6, Y, -0.8], [18.0, Y + 1.0, -1.5], T),
        'Fritz': walk([[9.0, Y, 7.0], [6.5, Y, 0.5], [6.0, Y, -7.5]], T),
    }


# ------------------------------------------------------------------ Klassisch (Almwiese)

def orbit(cx, cz, angle, pts, look_y):
    """Kamera auf einem Kreis um (cx, cz): pts = [(Zeitpunkt, Abstand, Höhe)], angle(t) in Grad (0 = Osten, 90 = Süden)."""
    out, last = [], None
    for t, r, y in pts:
        a = math.radians(angle(t))
        out.append({'p': [cx + r * math.cos(a), y, cz + r * math.sin(a)], 'look': [cx, look_y, cz],
                    't': t - (last if last is not None else 0)})
        last = t
    return out


def ring(cx, cz, r, a0, a1, T, n, names=('Anna', 'Toni')):
    keys = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        rr = r + 0.15 * math.sin(i * 1.7)
        keys.append((T / n if i else 0, {names[0]: (cx + rr * math.cos(a), cz + rr * math.sin(a)),
                                          names[1]: (cx - rr * math.cos(a), cz - rr * math.sin(a))}))
    return keys


KLASSISCH = fight(ring(ALM, 0.5, 1.2, 180, 125, 8.2, 12))
KLASSISCH_EVENTS = [
    hit(0.6, 'Anna', 'Toni'), hit(1.3, 'Toni', 'Anna'), hit(1.7, 'Anna', 'Toni'), hit(2.5, 'Anna', 'Toni'),
    act(3.0, 'Toni', 'slot', 1), act(3.3, 'Toni', 'use'), act(3.7, 'Toni', 'slot', 2), act(4.0, 'Toni', 'use'),
    act(4.3, 'Toni', 'slot', 0), hit(4.7, 'Toni', 'Anna'), hit(5.3, 'Anna', 'Toni'), hit(5.9, 'Toni', 'Anna'),
    act(6.0, 'Anna', 'slot', 1), act(6.25, 'Anna', 'use'), act(6.45, 'Anna', 'slot', 0), hit(6.6, 'Anna', 'Toni'),
    hit(7.1, 'Toni', 'Anna'), hit(7.7, 'Anna', 'Toni'),
]

# ------------------------------------------------------------------ Modern (Burghof)

MODERN = fight([
    (0, {'Anna': (BURG, 10.8), 'Toni': (BURG, 7.4)}),
    (1.0, {'Anna': (BURG + 0.1, 9.9), 'Toni': (BURG - 0.1, 7.5)}),
    (0.9, {}),
    (1.0, {'Anna': (BURG + 0.4, 11.0), 'Toni': (BURG - 0.4, 3.9)}),
    (2.2, {}),
    (1.2, {'Anna': (BURG - 0.1, 6.6), 'Toni': (BURG - 0.3, 4.2)}),
    (1.9, {'Anna': (BURG + 0.3, 6.2), 'Toni': (BURG - 0.5, 4.0)}),
])
MODERN_EVENTS = [
    act(0.1, 'Anna', 'slot', 1), act(0.2, 'Toni', 'use', 'off'), hit(1.25, 'Anna', 'Toni'), act(1.9, 'Toni', 'unuse'),
    act(2.5, 'Anna', 'slot', 2), act(2.8, 'Anna', 'use'), act(4.1, 'Anna', 'unuse'),
    act(4.5, 'Toni', 'slot', 3), act(4.7, 'Toni', 'use'), act(4.6, 'Anna', 'slot', 0),
    act(6.4, 'Toni', 'slot', 0), hit(6.6, 'Anna', 'Toni'), hit(7.2, 'Toni', 'Anna'), hit(7.8, 'Anna', 'Toni'),
]

# ------------------------------------------------------------------ Fähigkeiten (Bergwerk, 2 gegen 2)

_mid_t = [BERG + 0.2, Y + 1.62, -3.35]
FAEHIG = fight([
    (0, {'Anna': (BERG - 2.0, 3.5), 'Carla': (BERG + 2.0, 3.0), 'Toni': (BERG - 1.7, -3.2), 'Dora': (BERG + 2.1, -3.5)}),
    (1.9, {}),
    *[(0.7 / 6, {'Toni': (BERG - 1.7 + 0.4 * u, Y + 4 * 2.6 * u * (1 - u), -3.2 + 5.1 * u)}) for u in
      [i / 6 for i in range(1, 6)]],
    (0.7 / 6, {'Toni': (BERG - 1.3, 1.9), 'Carla': (BERG + 1.6, 2.8)}),
    (0.7, {'Carla': (BERG + 0.9, 2.6)}),
    (0.35, {}),
    (0.2, {'Toni': (BERG - 2.6, Y + 0.6, 1.5)}),
    (0.25, {'Toni': (BERG - 3.3, 1.2), 'Dora': (BERG + 1.9, -2.2)}),
    (0.6, {'Dora': (BERG + 1.3, -1.6)}),
    (1.0, {'Anna': (BERG - 2.2, 2.6), 'Carla': (BERG + 1.4, 0.0)}),
    (0.6, {'Anna': (BERG - 2.4, 2.4)}),
    (1.5, {'Toni': (BERG - 3.1, 1.5), 'Dora': (BERG + 1.2, -1.4)}),
], opp={'Anna': 'Toni', 'Toni': 'Anna', 'Carla': 'Dora', 'Dora': 'Carla'},
    look={})
# Anna zielt mit dem Pfeilbündel zwischen Toni und Dora; Carla stößt Toni mit dem Schmiedehammer; Dora wirft ihr
# Kräuterfläschchen vor Toni auf den Boden.
for i, q in enumerate(FAEHIG['Anna'][:2]):
    q['look'] = _mid_t
for q in FAEHIG['Carla'][7:12]:
    q['look'] = [BERG - 1.3, Y + 1.4, 1.9]
for q in FAEHIG['Dora'][11:14]:
    q['look'] = [BERG - 1.2, Y, 0.6]
FAEHIG_EVENTS = [
    act(0.2, 'Anna', 'slot', 1), act(0.9, 'Anna', 'use'),
    act(1.3, 'Toni', 'slot', 1), act(1.9, 'Toni', 'use'),
    hit(2.9, 'Toni', 'Anna'), act(2.8, 'Carla', 'slot', 1), hit(3.3, 'Anna', 'Toni'), act(3.65, 'Carla', 'use'),
    act(4.5, 'Dora', 'slot', 1), act(5.2, 'Dora', 'use'),
    act(5.5, 'Anna', 'slot', 0), act(5.6, 'Carla', 'slot', 0), act(5.9, 'Dora', 'slot', 0), act(5.9, 'Toni', 'slot', 0),
    hit(6.2, 'Carla', 'Dora'), hit(6.6, 'Anna', 'Toni'), hit(7.1, 'Toni', 'Anna'), hit(7.4, 'Dora', 'Carla'),
    hit(7.9, 'Carla', 'Dora'),
]

# ------------------------------------------------------------------ 2 gegen 2 (Wirtshausgarten, Klassisch)

_z1 = ring(WIRT - 3.6, 3.6, 1.15, 180, 140, 8.2, 10)
_z2 = ring(WIRT + 4.4, 2.6, 1.15, 0, 40, 8.2, 10, ('Dora', 'Carla'))
ZWEI = fight([(a[0], a[1] | b[1]) for a, b in zip(_z1, _z2)])
ZWEI_EVENTS = [
    hit(0.5, 'Anna', 'Toni'), hit(0.8, 'Dora', 'Carla'), hit(1.2, 'Toni', 'Anna'), hit(1.5, 'Carla', 'Dora'),
    hit(2.0, 'Anna', 'Toni'), hit(2.3, 'Carla', 'Dora'), hit(2.8, 'Toni', 'Anna'), hit(3.1, 'Dora', 'Carla'),
    act(3.4, 'Dora', 'slot', 1), act(3.7, 'Dora', 'use'), act(4.0, 'Dora', 'slot', 0),
    hit(3.6, 'Anna', 'Toni'), hit(4.3, 'Carla', 'Dora'), hit(4.5, 'Toni', 'Anna'), hit(5.0, 'Dora', 'Carla'),
    act(5.0, 'Toni', 'slot', 1), act(5.3, 'Toni', 'use'), act(5.55, 'Toni', 'slot', 0),
    act(4.75, 'Anna', 'slot', 1), act(5.0, 'Anna', 'use'), act(5.3, 'Anna', 'slot', 0),
    act(5.2, 'Carla', 'slot', 1), act(5.45, 'Carla', 'use'), act(5.7, 'Carla', 'slot', 0),
    hit(5.6, 'Anna', 'Toni'), hit(5.9, 'Carla', 'Dora'), hit(6.4, 'Toni', 'Anna'), hit(6.7, 'Dora', 'Carla'),
    hit(7.2, 'Anna', 'Toni'), hit(7.5, 'Carla', 'Dora'), hit(7.9, 'Toni', 'Anna'),
]

# ------------------------------------------------------------------ Sieg (Wirtshausgarten, gewertet)

_away = lambda x, z: (x, 60, z)
SIEG = {
    'Anna': [{'p': [WIRT - 2.4, Y, 3.7], 't': 0, 'look': [WIRT - 0.2, Y + 1.62, 3.5]},
             {'p': [WIRT - 2.2, Y, 3.6], 't': 4.8, 'look': [WIRT + 0.5, Y + 4, 4.5]}],
    'Toni': [{'p': [WIRT - 0.2, Y, 3.5], 't': 0, 'look': [WIRT - 2.4, Y + 1.62, 3.7]},
             {'p': [WIRT - 0.2, Y, 3.5], 't': 0.52, 'look': [WIRT - 2.4, Y + 1.62, 3.7]},
             {'p': list(_away(WIRT - 0.2, 3.5)), 't': 0.02}],
    'Carla': [{'p': [WIRT + 1.9, Y, 4.6], 't': 0, 'look': [WIRT + 4.1, Y + 1.62, 4.9]},
              {'p': [WIRT + 2.0, Y, 4.6], 't': 4.8, 'look': [WIRT + 0.5, Y + 4, 4.5]}],
    'Dora': [{'p': [WIRT + 4.1, Y, 4.9], 't': 0, 'look': [WIRT + 1.9, Y + 1.62, 4.6]},
             {'p': [WIRT + 4.1, Y, 4.9], 't': 1.37, 'look': [WIRT + 1.9, Y + 1.62, 4.6]},
             {'p': list(_away(WIRT + 4.1, 4.9)), 't': 0.02}],
}
SIEG_EVENTS = [
    hit(0.35, 'Anna', 'Toni'), {'at': 0.5, 'cmd': 'damage Toni 1000 minecraft:player_attack by Anna'},
    cmd(0.5, f'particle minecraft:poof {WIRT - 0.2} {Y + 1} 3.5 0.3 0.6 0.3 0.04 40'),
    cmd(0.5, f'particle minecraft:sweep_attack {WIRT - 0.2} {Y + 1.2} 3.5 0.2 0.2 0.2 0 2'),
    hit(1.2, 'Carla', 'Dora'), {'at': 1.35, 'cmd': 'damage Dora 1000 minecraft:player_attack by Carla'},
    cmd(1.35, f'particle minecraft:poof {WIRT + 4.1} {Y + 1} 4.9 0.3 0.6 0.3 0.04 40'),
    act(1.9, 'Anna', 'swing'), act(2.3, 'Carla', 'swing'), act(2.6, 'Anna', 'swing'), act(3.1, 'Carla', 'swing'),
    act(3.4, 'Anna', 'swing'), act(3.9, 'Carla', 'swing'),
]

# ------------------------------------------------------------------ Einstellungen

SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': {
        'camera': [{'p': [62, 132, 62], 'look': [0, 101, 0], 't': 0},
                   {'p': [30, 121, 52], 'look': [0, 102, -2], 't': 4},
                   {'p': [5, 112.5, 37], 'look': [0, 103, -8], 't': 4.2, 'ease': 1}],
        'actors': courtyard(8.2)}},
    {'id': '02-hof', 'bars': 2, 'card': 'lt-hof.png', 'spec': {
        'camera': [{'p': [-9.5, 102.9, 9.5], 'look': [-1.0, 103.2, -10], 't': 0},
                   {'p': [-6.5, 102.6, 1.5], 'look': [1.0, 103.4, -14], 't': 4.7}],
        'actors': courtyard(4.7)}},
    {'id': '03-kit', 'bars': 2, 'card': 'lt-kit.png', 'custom': 'kit', 'spec': {
        'camera': [{'p': [0.5, 102.6, 3.5], 'look': [0.5, 103.5, -10], 't': 0},
                   {'p': [0.5, 102.6, 3.5], 'look': [0.5, 103.5, -10], 't': 4.7}]}},
    {'id': '04-klassisch', 'bars': 4, 'card': 'lt-klassisch.png', 'fight': ('duel', 'Anna', 'Toni', 'klassisch'), 'spec': {
        'camera': [{'p': [ALM + 9, 112, 14], 'look': [ALM, Y + 0.5, 0.5], 't': 0}] + orbit(
            ALM, 0.5, lambda t: 90 - 55 * t / 8.2, [(2.2, 4.4, 102.9), (4.4, 4.0, 102.8), (6.4, 3.7, 102.7),
                                                     (8.2, 3.5, 102.7)], Y + 1.0),
        'actors': KLASSISCH, 'events': KLASSISCH_EVENTS}},
    {'id': '05-modern', 'bars': 4, 'card': 'lt-modern.png', 'fight': ('duel', 'Anna', 'Toni', 'modern'), 'spec': {
        'camera': [{'p': [BURG + 3.4, 102.9, 10.4], 'look': [BURG, Y + 1, 8.9], 't': 0},
                   {'p': [BURG + 3.8, 103.0, 9.2], 'look': [BURG, Y + 1, 8.6], 't': 1.6},
                   {'p': [BURG + 6.6, 103.4, 7.6], 'look': [BURG, Y + 0.9, 7.4], 't': 1.6},
                   {'p': [BURG + 6.2, 103.3, 6.6], 'look': [BURG, Y + 0.9, 6.6], 't': 1.6},
                   {'p': [BURG + 3.8, 102.9, 5.6], 'look': [BURG, Y + 1, 5.3], 't': 1.7},
                   {'p': [BURG + 3.2, 102.8, 4.4], 'look': [BURG, Y + 1, 5.0], 't': 1.7, 'ease': 1}],
        'actors': MODERN, 'events': MODERN_EVENTS}},
    {'id': '06-faehigkeiten', 'bars': 4, 'card': 'lt-faehigkeiten.png',
     'fight': ('team', 'Anna', 'Toni', 'faehigkeiten', 'locker'), 'spec': {
        # Im Bergwerk ist es dunkel: die Kamera bekommt Nachtsicht (nur für diese Einstellung)
        'setup': [f'effect give {CAM} minecraft:night_vision infinite 0 true'],
        'after': [f'effect clear {CAM} minecraft:night_vision'],
        'camera': [{'p': [BERG + 4.5, 103.6, 6.5], 'look': [BERG - 0.5, Y + 0.8, -0.5], 't': 0},
                   {'p': [BERG + 1.0, 103.2, 6.4], 'look': [BERG - 0.8, Y + 0.9, 0.2], 't': 4.0},
                   {'p': [BERG - 3.6, 103.0, 5.2], 'look': [BERG - 0.8, Y + 0.9, 0.0], 't': 4.2, 'ease': 1}],
        'actors': FAEHIG, 'events': FAEHIG_EVENTS}},
    {'id': '07-zwei', 'bars': 4, 'card': 'lt-zwei.png', 'fight': ('team', 'Anna', 'Toni', 'klassisch', 'locker'), 'spec': {
        'camera': [{'p': [WIRT + 0.5, 104.2, 15.0], 'look': [WIRT, Y + 0.8, 3.0], 't': 0},
                   {'p': [WIRT - 2.6, 102.9, 8.8], 'look': [WIRT - 3.0, Y + 1, 3.4], 't': 3.6},
                   {'p': [WIRT + 3.0, 102.8, 7.9], 'look': [WIRT + 4.0, Y + 1, 2.6], 't': 4.6, 'ease': 1}],
        'actors': ZWEI, 'events': ZWEI_EVENTS}},
    {'id': '08-sieg', 'bars': 2, 'card': 'lt-sieg.png', 'fight': ('team', 'Anna', 'Toni', 'klassisch', 'gewertet'),
     'spec': {
        'camera': [{'p': [WIRT - 0.4, 102.6, 10.0], 'look': [WIRT - 0.2, Y + 1, 4.0], 't': 0},
                   {'p': [WIRT - 0.4, 102.4, 11.0], 'look': [WIRT - 0.2, Y + 3.5, 4.0], 't': 1.6},
                   {'p': [WIRT - 0.4, 102.2, 13.0], 'look': [WIRT - 0.2, Y + 11, 3.5], 't': 3.2, 'ease': 1}],
        'actors': SIEG, 'events': SIEG_EVENTS}},
    {'id': '09-rangliste', 'bars': 2, 'card': 'lt-rangliste.png', 'spec': {
        'camera': [{'p': [-8.0, 107.6, -11.0], 'look': [-9.5, 108.6, -17.5], 't': 0},
                   {'p': [1.5, 107.6, -10.2], 'look': [0.5, 108.6, -17.5], 't': 4.7, 'ease': 1}]}},
    {'id': '10-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'time': 12300, 'spec': {
        'camera': [{'p': [6, 103.5, 5], 'look': [-1, 103.5, -5], 't': 0},
                   {'p': [16, 112, 4], 'look': [0, 104, -4], 't': 3.2},
                   {'p': [52, 126, 22], 'look': [0, 104, -2], 't': 4.0, 'ease': 1}],
        'actors': {n: stand(p, [0.5, Y + 2.2, -1.0], 7.3) for n, p in {
            'Anna': [-1.6, Y, 1.2], 'Toni': [1.2, Y, 1.6], 'Carla': [-0.6, Y, 2.6], 'Dora': [2.6, Y, 0.2],
            'Otto': [-2.8, Y, -0.4], 'Fritz': [0.4, Y, 3.4]}.items()},
        'events': [act(t, n, 'swing') for t, n in [(0.6, 'Anna'), (0.9, 'Toni'), (1.2, 'Otto'), (1.5, 'Carla'),
                                                   (1.8, 'Fritz'), (2.1, 'Dora'), (2.6, 'Anna'), (3.0, 'Toni')]]}},
]
for _s in SHOTS:
    _s['spec']['dim'] = DIM

# ------------------------------------------------------------------ Vorbereiten und drehen

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'mc-client'))


class Rcon:
    def __init__(self):
        import rcon as R
        self.R = R
        host, port = os.environ['MM_RCON'].rsplit(':', 1)
        self.s = socket.create_connection((host, int(port)), timeout=20)
        self.s.sendall(R.packet(1, 3, os.environ['MM_RCON_PASS'])); R.read(self.s)
        self.i = 2

    def __call__(self, c):
        self.i += 1
        self.s.sendall(self.R.packet(self.i, 2, c))
        return self.R.read(self.s)[1]


def say(name, what, arg=''):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        f.write(f'{name} {what} {arg}\n')


def x_of(rc, name):
    m = re.search(r'\[(-?[\d.]+)d', rc(f'data get entity {name} Pos'))
    return float(m.group(1)) if m else None


def until(cond, t=20):
    end = time.time() + t
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.3)
    return False


def prepare(rc, s):
    """Alle zurück in den Turnierhof, Kamera schon hinstellen (Chunks laden), Kampf echt starten."""
    for n in ACTORS:
        say(n, 'chat', '/verlassen')
    until(lambda: all(abs(x_of(rc, n) or 999) < 60 for n in ACTORS), 25)
    time.sleep(0.8)
    rc(f'execute in {DIM} run time set {s.get("time", 6000)}')
    cam = os.environ.get('MM_CAMERA', 'MorniTest')
    c0 = s['spec']['camera'][0]
    far = abs(c0['p'][0] - (x_of(rc, cam) or 0)) > 100
    rc(f'gamemode spectator {cam}')
    rc(f'execute in {DIM} run tp {cam} {c0["p"][0]} {c0["p"][1]} {c0["p"][2]} facing {c0["look"][0]} {c0["look"][1]} {c0["look"][2]}')
    f = s.get('fight')
    if f:
        if f[0] == 'duel':
            _, a, b, kit = f
            say(a, 'chat', f'/duel {b} {kit}'); time.sleep(1.2); say(b, 'chat', '/duel annehmen')
            who = [a, b]
        else:
            _, a, b, kit, mode = f
            say(a, 'chat', f'/warteschlange {kit} {mode} 2v2'); time.sleep(0.6)
            say(b, 'chat', f'/warteschlange {kit} {mode} 2v2')
            who = ['Anna', 'Toni', 'Carla', 'Dora']
        if not until(lambda: all((x_of(rc, n) or 0) > 500 for n in who), 20):
            raise SystemExit(f'Kampf für {s["id"]} startet nicht')
        time.sleep(2.5)  # Countdown
    time.sleep(float(s.get('settle', 16 if far else 4)))


def kit_shot(rc, s, out, need):
    """Kit-Editor: die Kamera ist hier ein Spieler im Turnierhof, öffnet /kit modern und ordnet um (echte Klicks)."""
    disp = os.environ.get('MM_DISPLAY', ':98')
    cam = os.environ.get('MM_CAMERA', 'MorniTest')
    env = dict(os.environ, DISPLAY=disp)
    x = lambda *a: subprocess.run(['xdotool', *map(str, a)], env=env, check=True)
    rc('kill @e[tag=mmcam]')
    rc(f'gamemode adventure {cam}')
    rc(f'execute in {DIM} run tp {cam} 0.5 {Y} 3.5 180 -8')
    time.sleep(3)
    x('mousemove', 1380, 840)
    x('key', 't'); time.sleep(0.8)
    x('type', '--delay', 60, '/kit modern'); time.sleep(0.3)
    x('key', 'Return'); time.sleep(2.0)
    K = 3  # langsam bewegen, danach dreimal so schnell abspielen
    raw = out + '.raw.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size',
                           '1600x900', '-framerate', '15', '-i', disp, '-c:v', 'libx264', '-preset', 'ultrafast',
                           '-crf', '12', '-pix_fmt', 'yuv420p', raw], stdin=subprocess.PIPE)
    slot = lambda c, r: (584 + 54 * c, 195 + 54 * r)
    pos = [1380, 840]

    def glide(to, dur):
        steps = max(1, int(dur * K * 20))
        a = list(pos)
        for i in range(1, steps + 1):
            u = i / steps
            u = u * u * (3 - 2 * u)
            x('mousemove', round(a[0] + (to[0] - a[0]) * u), round(a[1] + (to[1] - a[1]) * u))
            time.sleep(dur * K / steps)
        pos[:] = to

    def click(pause=0.12):
        x('click', 1); time.sleep(pause * K)

    time.sleep(0.5 * K)
    for frm, to in [((2, 3), (6, 3)), ((3, 3), (2, 3)), ((4, 3), (7, 3))]:
        glide(slot(*frm), 0.45); click()
        glide(slot(*to), 0.5); click()
    glide(slot(6, 5), 0.45); click(0.4)
    time.sleep(1.0 * K)
    ff.stdin.write(b'q'); ff.stdin.flush(); ff.wait()
    # Kein Escape: „Speichern“ schließt den Editor schon – Escape würde das Spielmenü öffnen.
    rc(f'gamemode spectator {cam}')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-vf', f'setpts=PTS/{K},fps=30', '-r', '30',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out], check=True)
    os.remove(raw)
    print(out)


def main(ids):
    rc = Rcon()
    out_dir = os.path.join(os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer'), 'duels')
    for s in SHOTS:
        if ids and s['id'] not in ids:
            continue
        print(f'== vorbereiten {s["id"]}', flush=True)
        prepare(rc, s)
        if s.get('custom') == 'kit':
            info = json.load(open(os.path.join(out_dir, f'musik-{STYLE}.json')))
            kit_shot(rc, s, os.path.join(out_dir, f'{s["id"]}.mp4'), s['bars'] * info['secPerBar'] + 1.3)
            continue
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'make.py'), 'duels', 'shot', s['id']], check=True)


if __name__ == '__main__':
    main(sys.argv[1:])
