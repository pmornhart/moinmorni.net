"""Trailer: Burgverlies – zu viert hinab durch Kampfräume, Fallen, Rätsel und Schätze bis zum Kerkermeister.

Gedreht auf dem Test-Server aus dem Repo pmornhart/Morni-Burgverlies:
  SERVER_DIR=~/mm-cache/servers/burgverlies-trailer SEED=5 KEEP=1 SKIP_TEST=1 test/run.sh   (Port 25780, RCON 25880)
danach in plugins/MorniBurgverlies/config.yml `ende-sekunden: 10` und in plugins/MoinMorni/fake.properties
`party.Anna=Anna,Bert,Clara,Dora` (eine Party mit vier Leuten, alle deutsch).

Mit `startwert: 5` und 4 Räumen pro Etage würfelt das Plugin immer dieselben Etagen (Verlies-Platz 0, x ≥ 1000):
  Etage 1 (Boden y 90): Torkammer → Wachstube → Brunnenschacht → Hebelsaal → Schatzkammer → Krämerstube
  Etage 2 (y 68): Treppenabsatz → Weinkeller → Glutkammer → Schatzkammer → Hebelsaal → Krämerstube
  Etage 3 (y 46): Treppenabsatz → Gruft → Brunnenschacht → Hebelsaal → Zehntkeller → Wachfeuer → Thronsaal
Darum stehen die Orte unten fest im Drehbuch (auch die Hebel-Reihenfolge im Hebelsaal: 3, 0, 1).

Alles im Verlies spielt das Plugin wirklich: Fallgitter, Wellen, Pfeilfallen, bröckelnder Boden, Glutdüsen, Rätsel,
Truhen, Laden der Krämerin, Hinfallen und Wiederbeleben, der Kerkermeister mit Schockwelle und der Sieg. Die Regie
(`trailers/burgverlies/regie.py`) spult den Abstieg vor jeder Einstellung bis zum richtigen Raum vor
(`/bvadmin loesen`, Treppe), die Darsteller (`trailers/burgverlies/bv-actors.cjs`: Hebel/Truhe anklicken, Krämerin,
Schleichen) laufen die Wege aus dem Drehbuch. Wer in einen Raum mit Fallgitter läuft, löst ihn aus; die anderen holt
das Plugin sonst an den Eingang – darum gehen die vier Seite an Seite durch die Tür.

  python3 trailers/burgverlies.py [einstellung …]      # vorbereiten + drehen (ohne Angabe: alle)
Umgebung wie shot.py (MM_RCON, MM_RCON_PASS, MM_CAMERA, MM_DISPLAY, MM_ACTORS_FIFO), Darsteller:
  tail -n0 -F <fifo> | node trailers/burgverlies/bv-actors.cjs 127.0.0.1 25780 26.1 Anna Bert Clara Dora
"""
import math, os, subprocess, sys, time

STYLE = 'burgverlies'
FILE = 'MoinMorni-Trailer-Burgverlies.mp4'
SLOW = 12
DIM = 'minecraft:burgverlies'
CAM = os.environ.get('MM_CAMERA', 'BvKamera')
HERE = os.path.dirname(os.path.abspath(__file__))

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Burgverlies',
     'text': 'Zu viert hinab – bis zum Kerkermeister'},
    {'file': 'lt-torhaus.png', 'kind': 'lower', 'title': 'Das Torhaus', 'text': 'Allein oder mit bis zu drei Freunden'},
    {'file': 'lt-welle.png', 'kind': 'lower', 'title': 'Welle um Welle', 'text': 'Das Fallgitter fällt – erst kämpfen, dann weiter'},
    {'file': 'lt-fallen.png', 'kind': 'lower', 'title': 'Fallen', 'text': 'Pfeile aus der Wand, der Boden bröckelt'},
    {'file': 'lt-raetsel.png', 'kind': 'lower', 'title': 'Rätsel', 'text': 'Farben merken, Hebel umlegen – das Tor geht auf'},
    {'file': 'lt-schatz.png', 'kind': 'lower', 'title': 'Schätze', 'text': 'Kerkertaler für alle'},
    {'file': 'lt-kraemerin.png', 'kind': 'lower', 'title': 'Krämerin Walburga', 'text': 'Bessere Schwerter, Rüstung, Heiltränke'},
    {'file': 'lt-tiefer.png', 'kind': 'lower', 'title': 'Drei Etagen', 'text': 'Jede tiefer – und jedes Mal neu gewürfelt'},
    {'file': 'lt-hilfe.png', 'kind': 'lower', 'title': 'Niemand bleibt liegen', 'text': 'Neben dem Freund schleichen – schon steht er wieder'},
    {'file': 'lt-boss.png', 'kind': 'lower', 'title': 'Der Kerkermeister', 'text': 'Ganz unten wartet er auf euch'},
    {'file': 'lt-schock.png', 'kind': 'lower', 'title': 'Schockwelle!', 'text': 'Wird der Kreis voll – springen'},
    {'file': 'lt-sieg.png', 'kind': 'lower', 'title': 'Sieg!', 'text': 'Punkte, Bestzeit und Bestenliste'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Burgverlies“ anklicken'},
]


# ------------------------------------------------------------------ Bausteine

def walk(points, speed, t0=0.0, look=None):
    """Gehweg mit gleichmäßigem Tempo (Blöcke pro Sekunde), nach `t0` Sekunden Warten am ersten Punkt."""
    out = [{'p': points[0], 't': 0}]
    if t0:
        out.append({'p': points[0], 't': t0})
    for a, b in zip(points, points[1:]):
        out.append({'p': b, 't': max(0.05, math.dist(a, b) / speed)})
    if look:
        for q in out:
            q['look'] = look
    return out


def keys(frames):
    """Weg aus Schlüsselbildern [(Zeitpunkt, [x, y, z], Blickziel oder None), …] mit absoluten Zeiten."""
    out, last = [], 0.0
    for t, p, look in frames:
        q = {'p': list(p), 't': t - last}
        if look:
            q['look'] = list(look)
        out.append(q)
        last = t
    out[0]['t'] = 0
    return out


def swing(t, a):
    return {'at': t, 'actor': a, 'act': 'swing'}


def act(t, a, what, arg=''):
    return {'at': t, 'actor': a, 'act': what, 'arg': arg}


def cmd(t, c):
    return {'at': t, 'cmd': f'execute in {DIM} run {c}'}


def hit(t, a, dmg, reach=3.4):
    """Schlag: Arm schwingen + Schaden am nächsten Gegner (nur wenn einer nah genug ist)."""
    return [swing(t, a), {'at': t + 0.02, 'cmd': f'execute in {DIM} as {a} at @s run damage '
                                                 f'@e[tag=bv_mob,sort=nearest,limit=1,distance=..{reach}] {dmg} '
                                                 f'minecraft:player_attack by @s'}]


def boss_hit(t, a, dmg):
    return [swing(t, a), {'at': t + 0.02, 'cmd': f'execute in {DIM} as {a} run damage @e[tag=bv_boss,limit=1] {dmg} '
                                                 f'minecraft:player_attack by @s'}]


def jump(t, p, height=1.3, dur=0.8, n=8):
    """Sprung an Ort p (absolute Schlüsselbilder für keys())."""
    return [(t + dur * i / n, [p[0], p[1] + 4 * height * (i / n) * (1 - i / n), p[2]], None) for i in range(1, n + 1)]


def eye(p, dy=1.5):
    return [p[0], p[1] + dy, p[2]]


NV_ON = f'effect give {CAM} night_vision infinite 0 true'
NV_OFF = f'effect clear {CAM} night_vision'

# ------------------------------------------------------------------ Torhaus (Hof y 101, Abstieg im Norden bei z −12)

YARD = {'Anna': [-1.1, 101, 4.6], 'Bert': [1.2, 101, 4.4], 'Clara': [-0.7, 101, 6.3], 'Dora': [1.5, 101, 6.2]}
ARCH = [0.5, 103.2, -12.5]


def descend(start, x):
    """Durch den Hof zum Abstieg und die Stufen hinab ins Dunkel (Stufen z −13 … −16, je ein Block tiefer)."""
    return [start, [x, 101, -11.5], [x, 101, -13.3], [x, 100, -14.3], [x, 99, -15.3], [x, 98.2, -16.2]]


# ------------------------------------------------------------------ Etage 1 (Füße y 91)

# Wachstube (Mitte 1000.5/32.5): Eingang Nord z 24, innen ab z 25. Gegner der ersten Welle an den Stellen
# (−5,−1) (5,−1) (−4,4) (4,4) (0,5) – westlich, östlich, südwestlich, südöstlich, südlich der Mitte.
ABREAST = [999.35, 1000.1, 1000.9, 1001.65]      # vier nebeneinander durch die 3 Blöcke breite Tür (x 999 … 1001)
W_POS = {'Anna': [998.3, 91, 31.5], 'Clara': [999.7, 91, 33.3], 'Dora': [1001.3, 91, 33.3], 'Bert': [1002.7, 91, 31.5]}
W_LOOK = {'Anna': [995.5, 92.3, 31.5], 'Clara': [997.0, 92.0, 36.5], 'Dora': [1004.0, 92.0, 36.5],
          'Bert': [1005.5, 92.3, 31.5]}


def rush(order, z0, z1, t_go, t_door, y=91, look_dir='south'):
    """Vier nebeneinander von z0 (Gang) bis z1 (im Raum), Start t_go, dort um t_door."""
    out = {}
    for x, n in zip(ABREAST, order):
        out[n] = [(0, [x, y, z0], None), (t_go, [x, y, z0], None), (t_door, [x, y, z1], None)]
    return out


def welle():
    order = ['Anna', 'Clara', 'Dora', 'Bert']
    base = rush(order, 21.0, 27.0, 0.6, 1.8)
    actors = {}
    for n in order:
        fr = base[n] + [(2.7, W_POS[n], W_LOOK[n]), (7.6, W_POS[n], W_LOOK[n])]
        actors[n] = keys(fr)
    ev = []
    for t, a, d in [(4.75, 'Clara', 5), (4.95, 'Dora', 5), (5.15, 'Anna', 5), (5.35, 'Bert', 5),
                    (5.6, 'Clara', 300), (5.8, 'Dora', 300), (6.05, 'Anna', 300), (6.25, 'Bert', 300),
                    (6.6, 'Clara', 300), (6.8, 'Dora', 300), (7.0, 'Anna', 300), (7.2, 'Bert', 300)]:
        ev += hit(t, a, d)
    ev += [swing(4.4, 'Bert'), swing(4.5, 'Anna'), swing(4.55, 'Clara'), swing(4.6, 'Dora')]
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1000.5, 95.4, 39.3], [1000.5, 92.4, 24.0]),
                            (2.6, [1000.3, 95.35, 39.25], [1000.45, 92.0, 27.0]),
                            (5.0, [999.9, 95.2, 39.2], [1000.3, 91.5, 30.5]),
                            (7.8, [999.7, 95.1, 39.15], [1000.3, 91.4, 31.5])]),
            'actors': actors, 'events': ev}


# Brunnenschacht (Mitte 1000.5/64.5): bröckelnder Boden z 59 … 68 (darunter die Grube), Ziel-Rand z 70,
# Pfeile aus der Westwand bei z 62 und aus der Ostwand bei z 66. Jede Person in ihrer eigenen Spur – hinter ihr
# gibt der gesprungene Stein nach.
def fallen():
    # Spur (x) und wo die Person stehen bleibt (z): dort liegt fester Stein.
    lanes = {'Anna': (995.5, 67.5), 'Clara': (998.5, 67.5), 'Bert': (1002.5, 68.5), 'Dora': (1005.5, 68.5)}
    start = {'Anna': 0.3, 'Dora': 0.5, 'Clara': 1.0, 'Bert': 1.2}
    actors = {}
    for n, (x, z_end) in lanes.items():
        actors[n] = walk([[x, 91, 57.6], [x, 91, z_end]], 2.1, t0=start[n])
        actors[n].append({'p': [x, 91, z_end], 't': 3.0})
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1000.5, 95.1, 71.25], [1000.5, 90.3, 61.0]),
                            (7.4, [1001.4, 94.8, 71.1], [1000.6, 90.4, 62.0])]),
            'actors': actors, 'events': [swing(2.6, 'Dora'), swing(3.4, 'Anna')]}


# Hebelsaal (Mitte 1000.5/96.5): Eingang Nord z 88, innen ab z 89; Hebel an der Eingangswand bei
# x 995, 997, 1003, 1005 (y 92, z 89), Farben darüber. Reihenfolge mit Startwert 5: 3, 0, 1.
LEVER = {0: [995, 92, 89], 1: [997, 92, 89], 2: [1003, 92, 89], 3: [1005, 92, 89]}


def lever_look(i):
    b = LEVER[i]
    return [b[0] + 0.5, b[1] + 0.4, b[2] + 0.5]


def raetsel():
    order = ['Anna', 'Clara', 'Dora', 'Bert']
    base = rush(order, 85.0, 91.2, 0.5, 1.5)
    A, B = [996.0, 91, 90.7], [1004.0, 91, 90.7]
    C, D = [999.4, 91, 93.6], [1001.6, 91, 93.6]
    wall = [1000.5, 93.4, 88.5]
    actors = {
        'Anna': keys(base['Anna'] + [(2.3, A, wall), (4.8, A, wall), (5.45, A, lever_look(0)), (6.1, A, lever_look(1)),
                                     (7.6, A, lever_look(1))]),
        'Bert': keys(base['Bert'] + [(2.3, B, wall), (4.3, B, wall), (5.2, B, lever_look(3)), (7.6, B, wall)]),
        'Clara': keys(base['Clara'] + [(2.3, C, wall), (7.6, C, wall)]),
        'Dora': keys(base['Dora'] + [(2.3, D, wall), (7.6, D, wall)]),
    }
    ev = [act(4.7, 'Bert', 'activate', '1005 92 89'), act(5.25, 'Anna', 'activate', '995 92 89'),
          act(5.8, 'Anna', 'activate', '997 92 89')]
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1000.0, 94.0, 98.8], [1000.5, 92.0, 89.5]),
                            (7.8, [1000.3, 93.8, 97.4], [1000.6, 92.1, 89.5])]),
            'actors': actors, 'events': ev}


# Schatzkammer (Mitte 1032.5/96.5, Eingang West): Truhen bei (1028|1036, 91, 91|101).
CHESTS = {'Anna': [1028, 91, 101], 'Clara': [1028, 91, 91], 'Bert': [1036, 91, 101], 'Dora': [1036, 91, 91]}


def schatz():
    """Anna und Clara öffnen die beiden Truhen im Westen, Bert und Dora freuen sich mit."""
    a_chest, c_chest = CHESTS['Anna'], CHESTS['Clara']
    look_a, look_c = [1028.5, 91.4, 101.5], [1028.5, 91.4, 91.5]
    actors = {
        'Anna': keys([(0, [1032.0, 91, 99.0], None), (0.7, [1029.6, 91, 100.0], look_a), (4.6, [1029.6, 91, 100.0], look_a)]),
        'Bert': keys([(0, [1033.4, 91, 98.0], None), (0.9, [1030.9, 91, 99.1], look_a), (4.6, [1030.9, 91, 99.1], look_a)]),
        'Clara': keys([(0, [1032.0, 91, 94.0], None), (0.75, [1029.6, 91, 93.0], look_c), (4.6, [1029.6, 91, 93.0], look_c)]),
        'Dora': keys([(0, [1033.4, 91, 95.0], None), (0.95, [1030.9, 91, 93.9], look_c), (4.6, [1030.9, 91, 93.9], look_c)]),
    }
    ev = [act(0.85, 'Anna', 'activate', f'{a_chest[0]} {a_chest[1]} {a_chest[2]}'),
          act(1.15, 'Clara', 'activate', f'{c_chest[0]} {c_chest[1]} {c_chest[2]}')]
    ev += [swing(t, n) for t, n in [(1.4, 'Bert'), (1.6, 'Dora'), (1.8, 'Bert'), (2.0, 'Dora'), (2.3, 'Anna'), (2.5, 'Clara')]]
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1035.4, 93.3, 96.5], [1028.4, 91.5, 96.5]),
                            (4.8, [1034.5, 93.1, 96.5], [1028.4, 91.5, 96.5])]),
            'actors': actors, 'events': ev}


# Krämerstube (Mitte 1064.5/96.5, Eingang West): Krämerin bei (1062.5, 91, 101.5) hinter der Theke (z 99),
# Treppe hinab nach Osten (x 1067 … 1071, je ein Block tiefer, z 94 … 98).
def kraemerin():
    stairs = lambda z: [[1067.2, 91, z], [1067.5, 91, z], [1068.5, 90, z], [1069.5, 89, z], [1070.6, 87.8, z]]
    trader = [1062.5, 92.6, 101.5]
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1064.75, 93.05, 96.1], [1062.3, 92.0, 101.5]),
                            (4.6, [1064.2, 92.9, 96.75], [1062.3, 92.0, 101.5])]),
            'actors': {
                'Anna': keys([(0, [1062.0, 91, 96.6], None), (0.5, [1061.5, 91, 98.3], trader), (4.6, [1061.5, 91, 98.3], trader)]),
                'Bert': walk(stairs(94.8), 1.6, t0=0.2),
                'Clara': walk(stairs(97.6), 1.6, t0=0.7),
                'Dora': walk(stairs(96.2), 1.6, t0=1.3),
            },
            'events': [act(0.75, 'Anna', 'trader'), act(1.45, 'Anna', 'click', '10'), act(1.95, 'Anna', 'close')]}


# ------------------------------------------------------------------ Etage 2 (Füße y 69)

# Treppe der Krämerstube (Etage 1): hinab nach Osten ins Dunkel, x 1067 Füße 91 … x 1071 Füße 87 (z 94 … 98).
# Die beiden vorne gehen bis zur untersten Stufe (x 1071) – nur wenn alle auf den Stufen x 1067 … 1070 stehen,
# holt das Plugin sie nach 2 s auf die nächste Etage.
def tiefer():
    def feet(x):
        return 91 if x < 1067 else 91 - (math.floor(x) - 1067)

    def down(z, x0, x1, t0):
        xs = [x0] + [x for x in (1066.9, 1067.5, 1068.5, 1069.5, 1070.5, 1071.3) if x0 < x <= x1]
        return walk([[x, feet(x), z] for x in xs], 2.4, t0=t0)
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [1063.6, 94.7, 96.5], [1069.5, 89.4, 96.5]),
                            (4.8, [1064.6, 94.3, 96.5], [1070.5, 88.4, 96.5])]),
            'actors': {'Anna': down(95.2, 1063.4, 1071.3, 0.0), 'Bert': down(97.7, 1063.0, 1071.3, 0.25),
                       'Clara': down(95.6, 1061.6, 1069.5, 0.7), 'Dora': down(97.3, 1061.2, 1068.5, 0.95)}}


# Glutkammer (Mitte 968.5/32.5, Eingang Ost x 976, innen ab x ≤ 976): Glutdüsen-Reihen bei x 972, 968, 964
# (Gruppe 0: ab Betreten 2 s an, dann alle 5 s) und x 970, 966 (Gruppe 1: 2,5 s nach Betreten).
# Bert läuft zu früh in die Glut und fällt hin, Clara hilft ihm auf (3 s Schleichen), die anderen laufen weiter.
G_ABREAST = [33.65, 32.9, 32.1, 31.35]


def hilfe():
    order = ['Anna', 'Bert', 'Clara', 'Dora']
    fr = {n: [(0, [979.0, 69, z], None), (0.5, [979.0, 69, z], None), (1.3, [974.6, 69, z], None)]
          for n, z in zip(order, G_ABREAST)}
    bert = [972.7, 69, 32.6]
    fr['Bert'] += [(1.7, [974.4, 69, 32.9], None), (2.15, bert, None), (6.75, bert, None),
                   (7.25, [973.9, 69, 32.4], [965, 70.6, 32.5]), (8.3, [973.9, 69, 32.4], [965, 70.6, 32.5])]
    clara = [973.6, 69, 33.5]
    fr['Clara'] += [(3.15, [974.5, 69, 32.4], None), (3.45, clara, eye(bert, -1.2)), (6.9, clara, eye(bert, -1.2)),
                    (8.3, clara, [965, 70.6, 32.5])]
    fr['Anna'] += [(3.2, [974.4, 69, 33.7], None), (3.55, [971.3, 69, 33.9], None), (5.55, [971.3, 69, 33.9], None),
                   (6.2, [963.0, 69, 34.0], None), (8.3, [962.0, 69, 34.0], None)]
    fr['Dora'] += [(3.3, [974.4, 69, 31.3], None), (3.65, [971.2, 69, 31.2], None), (5.65, [971.2, 69, 31.2], None),
                   (6.3, [963.0, 69, 31.0], None), (8.3, [962.0, 69, 31.0], None)]
    return {'fit': False, 'dim': DIM, 'wait': 3,
            'camera': keys([(0, [968.7, 72.3, 36.0], [974.0, 69.4, 32.8]),
                            (8.4, [969.4, 72.0, 35.7], [973.2, 69.3, 32.8])]),
            'actors': {n: keys(f) for n, f in fr.items()},
            'events': [cmd(2.6, 'damage Bert 100 minecraft:out_of_world'), act(3.4, 'Clara', 'sneak', 'on'),
                       act(7.1, 'Clara', 'sneak', 'off')]}


# ------------------------------------------------------------------ Etage 3: Thronsaal (Füße y 47)

# Mitte 1000.5/192.5, halbe Breite 12, Eingang Nord z 179, innen ab z 180; der Kerkermeister erscheint 3 s nach dem
# Betreten am Thron (1000.5, 47, 197.5). Eine Aufnahme für zwei Einstellungen: bis 6,9 s Ankunft und Erscheinen,
# ab 7,0 s (Kamera springt) Schockwelle – erster Angriff 4 s nach dem Erscheinen, der Kreis wächst 1,5 s.
BOSS_SPAWN = [1000.5, 48.8, 197.5]
T_FORM = {'Anna': [996.8, 47, 189.4], 'Clara': [999.4, 47, 190.2], 'Dora': [1001.6, 47, 190.2], 'Bert': [1004.2, 47, 189.4]}
SPLIT = 7.0            # Kamerasprung in der Thronsaal-Aufnahme
SCHOCK_FROM = 7.15     # dort beginnt 11-schockwelle.mp4
JUMP_AT = 10.0         # Sprung über die Schockwelle (Explosion um 10,3 … 10,5 s)


def boss():
    order = ['Anna', 'Clara', 'Dora', 'Bert']
    base = rush(order, 175.5, 182.5, 0.6, 2.4, y=47)
    actors, ev = {}, []
    for n in order:
        f = T_FORM[n]
        fr = base[n] + [(5.0, f, BOSS_SPAWN), (JUMP_AT, f, None)] + jump(JUMP_AT, f, 1.4, 0.9) + [(13.6, f, None)]
        actors[n] = keys(fr)
    for t, a in [(8.0, 'Anna'), (8.25, 'Bert'), (8.5, 'Clara'), (8.8, 'Dora'), (11.2, 'Anna'), (11.4, 'Clara'),
                 (11.6, 'Bert'), (11.85, 'Dora'), (12.1, 'Anna'), (12.35, 'Clara'), (12.6, 'Bert'), (12.85, 'Dora')]:
        ev += boss_hit(t, a, 12)
    cam = keys([(0, [1000.5, 53.8, 180.6], [1000.5, 47.8, 191.0]),
                (3.0, [1000.5, 52.4, 182.4], [1000.5, 48.2, 194.0]),
                (4.6, [1000.5, 50.6, 184.8], [1000.5, 48.8, 197.0]),
                (SPLIT - 0.05, [1000.5, 50.2, 186.0], [1000.5, 48.9, 196.0]),
                (SPLIT, [993.0, 51.0, 192.0], [1001.0, 47.6, 191.5]),
                (13.8, [993.6, 50.6, 192.6], [1001.0, 47.6, 191.5])])
    return {'fit': False, 'dim': DIM, 'wait': 3, 'setup': [NV_ON], 'after': [NV_OFF], 'camera': cam,
            'actors': actors, 'events': ev}


# Sieg: der Kerkermeister (vorher auf wenig Leben gebracht, steht still) fällt – Feuerwerk.
def sieg():
    boss_at = [1000.5, 47, 190.5]
    ring = {'Anna': [997.9, 47, 188.4], 'Clara': [999.6, 47, 187.6], 'Dora': [1001.6, 47, 187.7], 'Bert': [1003.2, 47, 188.6]}
    actors = {}
    for n, p in ring.items():
        fr = [(0, p, eye(boss_at, 2.0)), (1.6, p, eye(boss_at, 2.0))] + jump(1.8 + 0.12 * len(actors), p, 1.0, 0.7) \
            + [(4.6, p, [p[0], 52, 194])]
        actors[n] = keys(fr)
    ev = []
    for t, a in [(0.25, 'Bert'), (0.45, 'Clara'), (0.65, 'Dora')]:
        ev += boss_hit(t, a, 3)
    ev += boss_hit(0.95, 'Anna', 2000)
    ev += [swing(t, n) for t, n in [(2.0, 'Anna'), (2.1, 'Bert'), (2.25, 'Clara'), (2.4, 'Dora'), (2.6, 'Anna'),
                                     (2.7, 'Bert'), (2.85, 'Clara'), (3.0, 'Dora')]]
    rocket = ('summon firework_rocket %s %s %s {LifeTime:%d,FireworksItem:{id:"minecraft:firework_rocket",count:1,'
              'components:{"minecraft:fireworks":{explosions:[{shape:"%s",colors:[I;%d,16777215],'
              'fade_colors:[I;14704698],has_twinkle:true}],flight_duration:1}}}}')
    for t, x, z, life, shape, col in ((1.35, 996.0, 185.5, 9, 'large_ball', 15906354), (1.6, 1005.0, 185.5, 8, 'star', 14704698),
                                      (1.9, 1000.5, 184.0, 10, 'large_ball', 16766720), (2.3, 994.5, 189.5, 8, 'burst', 15906354),
                                      (2.6, 1006.0, 189.5, 9, 'large_ball', 16766720)):
        ev.append(cmd(t, rocket % (x, 48, z, life, shape, col)))
    return {'fit': False, 'dim': DIM, 'wait': 3, 'setup': [NV_ON], 'after': [NV_OFF],
            'camera': keys([(0, [1003.6, 48.5, 194.8], [999.8, 48.4, 188.8]),
                            (4.7, [1004.2, 49.6, 195.6], [1000.0, 50.0, 188.5])]),
            'actors': actors, 'events': ev}


# ------------------------------------------------------------------ Einstellungen

SHOTS = [
    # Anflug aufs Torhaus in der Abenddämmerung; die vier stehen im Hof.
    {'id': '01-intro', 'bars': 2, 'card': 'intro.png', 'cardAt': 0.4, 'prep': 'hall', 'spec': {
        'dim': DIM, 'setup': [f'execute in {DIM} run time set 12800'],
        'camera': [{'p': [30, 127, 52], 'look': [0, 105, -4], 't': 0},
                   {'p': [18, 120, 36], 'look': [0, 104, -5], 't': 3.2},
                   {'p': [6.0, 113.5, 21.0], 'look': [0.5, 102.5, -6], 't': 3.3, 'ease': 1}],
        'actors': {n: [{'p': p, 't': 0, 'look': ARCH}, {'p': p, 't': 6.5, 'look': ARCH}] for n, p in YARD.items()}}},
    # Die vier gehen durch den Hof zum Abstieg und die Stufen hinab ins Dunkel.
    {'id': '02-torhaus', 'bars': 2, 'card': 'lt-torhaus.png', 'prep': 'hall', 'spec': {
        'dim': DIM, 'setup': [f'execute in {DIM} run time set 12800'],
        'camera': [{'p': [2.6, 102.9, 9.5], 'look': [0.3, 102.4, -12.0], 't': 0},
                   {'p': [1.4, 102.6, 2.0], 'look': [0.4, 101.6, -14.0], 't': 6.4, 'ease': 1}],
        'actors': {'Anna': walk(descend(YARD['Anna'], -0.6), 3.4, 0.3), 'Bert': walk(descend(YARD['Bert'], 1.4), 3.4, 0.3),
                   'Clara': walk(descend(YARD['Clara'], -0.3), 3.4, 0.9), 'Dora': walk(descend(YARD['Dora'], 1.1), 3.4, 0.9)}}},
    {'id': '03-welle', 'bars': 2, 'card': 'lt-welle.png', 'start': 1.0, 'prep': ('before', 0, 1), 'spec': welle()},
    {'id': '04-fallen', 'bars': 2, 'card': 'lt-fallen.png', 'start': 0.6, 'prep': ('in', 0, 2), 'spec': fallen()},
    {'id': '05-raetsel', 'bars': 2, 'card': 'lt-raetsel.png', 'start': 1.2, 'prep': ('before', 0, 3), 'spec': raetsel()},
    {'id': '06-schatz', 'bars': 1, 'card': 'lt-schatz.png', 'start': 0.5, 'prep': ('in', 0, 4), 'spec': schatz()},
    {'id': '07-kraemerin', 'bars': 1, 'card': 'lt-kraemerin.png', 'start': 1.0, 'prep': ('in', 0, 5), 'spec': kraemerin()},
    {'id': '08-tiefer', 'bars': 1, 'card': 'lt-tiefer.png', 'start': 0.5, 'prep': ('in', 0, 5), 'spec': tiefer()},
    {'id': '09-hilfe', 'bars': 2, 'card': 'lt-hilfe.png', 'start': 1.3, 'prep': ('before', 1, 2), 'spec': hilfe()},
    {'id': '10-boss', 'bars': 2, 'card': 'lt-boss.png', 'start': 1.35, 'prep': ('before', 2, 6), 'spec': boss()},
    # Zweiter Teil derselben Aufnahme (ab SCHOCK_FROM, siehe main)
    {'id': '11-schockwelle', 'bars': 2, 'card': 'lt-schock.png', 'start': 0.4, 'from': '10-boss'},
    {'id': '12-sieg', 'bars': 1, 'card': 'lt-sieg.png', 'start': 0.4, 'prep': 'sieg', 'spec': sieg()},
    # Zurück im Torhaus (die Tafeln zeigen jetzt den Sieg), weit hinaus in den Abendhimmel.
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.6, 'prep': 'hall', 'spec': {
        'dim': DIM, 'setup': [f'execute in {DIM} run time set 12800'],
        'camera': [{'p': [0.5, 102.6, -1.4], 'look': [0.5, 102.4, -9.0], 't': 0},
                   {'p': [0.5, 106.5, 7.0], 'look': [0.5, 103.5, -8.0], 't': 3.0},
                   {'p': [2.0, 118.0, 30.0], 'look': [0.5, 104.0, -4.0], 't': 5.6, 'ease': 1}],
        'actors': {n: [{'p': p, 't': 0, 'look': [0.5, 102.6, -1.4]}, {'p': p, 't': 8.6, 'look': [0.5, 103, 2]}]
                   for n, p in {'Anna': [-1.8, 101, -7.2], 'Clara': [-0.5, 101, -7.8], 'Dora': [1.5, 101, -7.8],
                                'Bert': [2.8, 101, -7.2]}.items()},
        'events': [swing(t, n) for n, t0 in (('Anna', 0.5), ('Bert', 0.8), ('Clara', 1.2), ('Dora', 0.9))
                   for t in (t0, t0 + 0.35, t0 + 0.7)]}},
]


# ------------------------------------------------------------------ Regie

def prepare(s):
    sys.path.insert(0, os.path.join(HERE, 'burgverlies'))
    import regie as R
    prep = s.get('prep')
    R.rc(f'kill @e[type=arrow]')
    for n in R.ACTORS:
        R.say(f'{n} sneak off', f'{n} close')
    if prep == 'hall':
        if any(R.dbg(n).get('run') for n in R.ACTORS):
            R.leave_all()
        return
    if prep == 'sieg':
        prepare_victory(R)
        return
    kind, floor, room = prep
    d = R.dbg()
    if kind == 'before':
        R.advance(floor, room - 1)
    elif d.get('run') and d['stage'] == 'PLAYING' and (d['floor'], d['room']) == (floor, room):
        pass  # schon im Raum (zweiter Versuch derselben Einstellung)
    else:
        R.room_at(floor, room)
    R.hearty()
    if s['id'] == '07-kraemerin':
        R.rc('bvadmin taler Anna 100')
    time.sleep(1.0)


def prepare_victory(R):
    """Kerkermeister durch alle Abschnitte bringen (Wachen weg), dann auf wenig Leben, still vor dem Thron."""
    d = R.dbg()
    if d.get('run') is None or d['cur']['type'] != 'BOSS' or not d['cur'].get('boss'):
        raise SystemExit('Für 12-sieg muss der Kerkermeister leben (vorher 10-boss drehen).')
    R.hearty()
    boss = lambda: R.dbg()['cur']['boss']
    b = boss()
    if b['phase'] < 2:
        R.rc(f"damage @e[tag=bv_boss,limit=1] {math.ceil(b['health'] - b['max'] * 0.6)} minecraft:generic")
        R.wait(lambda: boss()['summons'] >= 1, 15, what='Wachen')
        R.rc('kill @e[tag=bv_mob]')
        time.sleep(1.5)
    b = boss()
    if b['phase'] < 3:
        R.rc(f"damage @e[tag=bv_boss,limit=1] {math.ceil(b['health'] - b['max'] * 0.3)} minecraft:generic")
        R.wait(lambda: boss()['invulnerable'] == 0 and boss()['phase'] == 3, 10, what='Abschnitt 3')
        time.sleep(3.0)
        R.rc('kill @e[tag=bv_mob]')
    b = boss()
    R.rc(f"damage @e[tag=bv_boss,limit=1] {max(0, math.ceil(b['health'] - 40))} minecraft:generic")
    time.sleep(0.5)
    R.rc('kill @e[tag=bv_mob]')
    R.rc('data merge entity @e[tag=bv_boss,limit=1] {NoAI:1b}')
    R.rc(f'execute in {DIM} run tp @e[tag=bv_boss,limit=1] 1000.5 47 190.5 180 0')
    print('  Kerkermeister:', boss())


def main(ids):
    sys.path.insert(0, os.path.join(HERE, '..'))
    import make
    out = os.path.join(make.OUT, 'burgverlies')
    for s in SHOTS:
        if ids and s['id'] not in ids:
            continue
        if 'from' in s:
            src = os.path.join(out, f"{s['from']}.mp4")
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{SCHOCK_FROM:.2f}', '-i', src, '-c:v', 'libx264',
                            '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an',
                            os.path.join(out, f"{s['id']}.mp4")], check=True)
            print(f"== {s['id']} aus {s['from']} ab {SCHOCK_FROM}s")
            continue
        print(f"== vorbereiten {s['id']}", flush=True)
        prepare(s)
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'make.py'), 'burgverlies', 'shot', s['id']], check=True)
        if s['id'] == '10-boss' and (not ids or '11-schockwelle' not in ids):
            main(['11-schockwelle'])


if __name__ == '__main__':
    main(sys.argv[1:])
