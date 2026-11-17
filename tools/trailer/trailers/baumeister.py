"""Trailer: Baumeister – Bauwettbewerb: Bauhütte, Themen-Wahl, Bauen im Zeitraffer auf mehreren Parzellen, Bauen in der
Ich-Sicht, Werkzeugkiste, fertige Bauten, Bewertung mit Sternen, Siegerehrung mit Podest und Meisterbrief.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh baumeister 28900 …: Paper 26.1.2, Morni Baumeister
0.1.0, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards, Regie-Plugin nur im Test-Server –
`regie als|halle|raus <spieler>`, Quelle im Cache ~/mm-cache/trailer/regie-modi/). config.yml des Test-Servers: keine
Runde von selbst (mindestens-spieler 16), Themen-Wahl 60 s, Bauzeit 20 Minuten, Bewertung 60 s je Bau, Siegerehrung
120 s. Thema: Almhütte.

Die Beispielbauten (vier Almhütten in verschiedenen Hölzern, mit Steinsockel, Satteldach, Kamin, Blumenkästen,
Laternen, Holzstoß, Bank, Garten mit Zaun, Bäumen und Blumen) entstehen per Befehl im Zeitraffer – `hut()` erzeugt
sie Schicht für Schicht. Damit der Modus sie als „bebaut“ zählt und bewerten lässt, setzt jeder Darsteller dazu noch
echte Blöcke von Hand (Wegsteine am Gartentor). Bewertung, Siegerehrung und Meisterbrief sind echt: Darsteller stimmen
mit `/bewerten`, der Aufnahme-Client (Seppl19) baut, nutzt die Werkzeugkiste und bewertet in der Ich-Sicht.

  python3 trailers/baumeister.py runde        # Runde starten (vor 02-thema) – oder 02-thema startet sie selbst
  python3 trailers/baumeister.py thema        # Thema Almhütte erzwingen, Bauzeit läuft
  python3 trailers/baumeister.py bauen        # alle Hütten sofort fertig bauen (ohne Kamera) + Wegsteine von Hand
  python3 trailers/baumeister.py bewerten     # zur Bewertung, Darsteller stimmen (Seppls Hütte am besten)
  python3 trailers/baumeister.py <einstellung …>
  python3 make.py baumeister music|cards|sheet|cut|fertig
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'baumeister'
STYLE = 'baumeister'
FILE = 'MoinMorni-Trailer-Baumeister.mp4'
SLOW = 15
DIM = 'minecraft:baumeister'
POV = os.environ.get('MM_CAMERA', 'Seppl19')
ACTORS = ['ResiBlume19', 'Matzeee24', 'Lena_Herbst05', 'Yuki_Tor10']
Y = 101   # Boden der Parzelle liegt auf 100, man steht auf 101

# Hölzer und Dächer der vier Almhütten (die erste ist Seppls)
STYLES = [
    dict(log='spruce_log', plank='spruce_planks', roof='dark_oak', base='cobblestone', door='spruce_door',
         flower='potted_red_tulip', fence='spruce_fence', trap='spruce_trapdoor', leaves='spruce_leaves'),
    dict(log='dark_oak_log', plank='stripped_spruce_wood', roof='deepslate_tile', base='stone_bricks',
         door='dark_oak_door', flower='potted_blue_orchid', fence='dark_oak_fence', trap='dark_oak_trapdoor',
         leaves='birch_leaves'),
    dict(log='stripped_dark_oak_log', plank='birch_planks', roof='spruce', base='mossy_cobblestone',
         door='birch_door', flower='potted_allium', fence='birch_fence', trap='birch_trapdoor', leaves='oak_leaves'),
    dict(log='oak_log', plank='spruce_planks', roof='mud_brick', base='andesite', door='oak_door',
         flower='potted_orange_tulip', fence='oak_fence', trap='oak_trapdoor', leaves='cherry_leaves'),
]

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Baumeister',
     'text': 'Der Bauwettbewerb – 2 bis 16 Leute'},
    {'file': 'lt-thema.png', 'kind': 'lower', 'title': 'Das Thema', 'text': 'Drei Vorschläge – die Mehrheit entscheidet'},
    {'file': 'lt-zeitraffer.png', 'kind': 'lower', 'title': 'Bauen auf Zeit', 'text': 'Jeder auf seiner Parzelle – im Kreativmodus'},
    {'file': 'lt-bauen.png', 'kind': 'lower', 'title': 'Jeder Block zählt', 'text': 'Fünf Minuten – oder zwei in der schnellen Runde'},
    {'file': 'lt-werkzeug.png', 'kind': 'lower', 'title': 'Die Werkzeugkiste', 'text': 'Boden, Uhrzeit, Wetter, Füllen, Ersetzen, Rückgängig'},
    {'file': 'lt-fertig.png', 'kind': 'lower', 'title': 'Almhütten', 'text': 'Vier Leute, ein Thema – vier Ideen'},
    {'file': 'lt-bewerten.png', 'kind': 'lower', 'title': 'Bewerten', 'text': 'Ein bis fünf Sterne – wer was gebaut hat, bleibt geheim'},
    {'file': 'lt-sieger.png', 'kind': 'lower', 'title': 'Siegerehrung', 'text': 'Podest, Feuerwerk – und der Meisterbrief'},
    {'file': 'lt-brief.png', 'kind': 'lower', 'title': 'Der Meisterbrief', 'text': 'Mit Name, Thema und Wertung – zum Behalten'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Baumeister“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def status():
    """/baumeisteradmin status → {phase, thema, gezeigt, plots: {i: (minX, minZ, maxX, maxZ)}, builders: {Name: plot}}."""
    out = {'plots': {}, 'builders': {}}
    for line in rc('baumeisteradmin status').split('\n'):
        if not line.startswith('bauplatz='):
            continue
        for part in line.split(' '):
            k, _, v = part.partition('=')
            if k.startswith('parzelle'):
                f = v.split(':')
                out['plots'][int(k[8:])] = tuple(int(x) for x in f[:4]) + (f[5],)
            elif v.count(':') == 3 and v.split(':')[0].isdigit() and not k.startswith('ergebnis'):
                out['builders'][k] = int(v.split(':')[0])
            else:
                out[k] = v
        return out
    return out


def plot_of(name):
    s = status()
    return s['plots'][s['builders'][name]]


def order():
    """Builder in fester Reihenfolge: Seppl zuerst (bekommt die schönste Hütte)."""
    s = status()
    names = [POV] + [n for n in ACTORS if n in s['builders']]
    return [(n, s['plots'][s['builders'][n]]) for n in names if n in s['builders']]


# ------------------------------------------------------------------ Almhütte aus Befehlen

def hut(x0, z0, st):
    """Befehle (Schichten) für eine Almhütte auf der Parzelle mit Ecke (x0|z0), 28 × 28. Liste von Listen: je Stufe."""
    S = []
    x1, x2, z1, z2 = x0 + 8, x0 + 18, z0 + 9, z0 + 17          # Hütte 11 × 9, Front nach Süden (z2)
    mid = (x1 + x2) // 2
    L, P, R, B = st['log'], st['plank'], st['roof'], st['base']
    f = lambda a, b, c, d, e, g, blk: f'fill {a} {b} {c} {d} {e} {g} {blk}'
    s1 = lambda a, b, c, blk: f'setblock {a} {b} {c} {blk}'
    # Garten: Wiese mit Weg, Zaun
    S.append([f(x0 + 1, 100, z0 + 1, x0 + 26, 100, z0 + 26, 'grass_block'),
              f(mid - 1, 100, z2 + 1, mid + 1, 100, z0 + 26, 'dirt_path'),
              f(x0 + 2, 101, z0 + 25, x0 + 25, 101, z0 + 25, st['fence']),
              f(x0 + 2, 101, z0 + 3, x0 + 2, 101, z0 + 25, st['fence']),
              f(x0 + 25, 101, z0 + 3, x0 + 25, 101, z0 + 25, st['fence']),
              f(mid - 1, 101, z0 + 25, mid + 1, 101, z0 + 25, 'air')])
    # Sockel
    S.append([f(x1, 101, z1, x2, 101, z2, B)])
    # Wände Reihe für Reihe, Eckbalken aus Stamm
    for y in range(102, 106):
        S.append([f(x1, y, z1, x2, y, z2, P), f(x1 + 1, y, z1 + 1, x2 - 1, y, z2 - 1, 'air')] +
                 [s1(x, y, z, L) for x in (x1, x2) for z in (z1, z2)] + [s1(mid, y, z1, L), s1(mid, y, z2, L)])
    # Fenster, Tür, Balken oben
    S.append([f(x1 + 2, 103, z2, x1 + 3, 104, z2, 'glass_pane'), f(x2 - 3, 103, z2, x2 - 2, 104, z2, 'glass_pane'),
              f(x1, 103, z1 + 3, x1, 104, z1 + 5, 'glass_pane'), f(x2, 103, z1 + 3, x2, 104, z1 + 5, 'glass_pane'),
              f(x1 + 2, 103, z1, x1 + 3, 104, z1, 'glass_pane'), f(x2 - 3, 103, z1, x2 - 2, 104, z1, 'glass_pane'),
              s1(mid, 102, z2, f"{st['door']}[facing=south,half=lower]"),
              s1(mid, 103, z2, f"{st['door']}[facing=south,half=upper]"),
              f(x1, 105, z1, x2, 105, z1, f'{L}[axis=x]'), f(x1, 105, z2, x2, 105, z2, f'{L}[axis=x]')])
    # Dach: Satteldach, First entlang x, Überstand 1
    for k in range(5):
        y = 106 + k
        rows = [f(x1 - 1, y, z1 - 1 + k, x2 + 1, y, z1 - 1 + k, f'{R}_stairs[facing=south]'),
                f(x1 - 1, y, z2 + 1 - k, x2 + 1, y, z2 + 1 - k, f'{R}_stairs[facing=north]')]
        if k:  # Giebel
            rows += [f(x1, y - 1, z1 - 1 + k, x1, y - 1, z2 + 1 - k, P), f(x2, y - 1, z1 - 1 + k, x2, y - 1, z2 + 1 - k, P)]
        S.append(rows)
    S.append([f(x1 - 1, 111, z1 + 4, x2 + 1, 111, z1 + 4, f'{R}_slab'),
              f(x1, 110, z1 + 4, x1, 110, z1 + 4, P), f(x2, 110, z1 + 4, x2, 110, z1 + 4, P),
              s1(x1, 108, z1 + 4, 'glass_pane'), s1(x2, 108, z1 + 4, 'glass_pane')])
    # Kamin
    S.append([f(x2 - 2, 102, z1 + 1, x2 - 2, 112, z1 + 1, 'bricks'), s1(x2 - 2, 113, z1 + 1, 'campfire[lit=true]')])
    # Blumenkästen, Laternen, Bank, Holzstoß, Brunnentrog
    S.append([f(x1 + 2, 102, z2 + 1, x1 + 3, 102, z2 + 1, f"{st['trap']}[half=top,facing=south]"),
              f(x2 - 3, 102, z2 + 1, x2 - 2, 102, z2 + 1, f"{st['trap']}[half=top,facing=south]"),
              s1(x1 + 2, 103, z2 + 1, st['flower']), s1(x1 + 3, 103, z2 + 1, 'potted_red_tulip'),
              s1(x2 - 3, 103, z2 + 1, st['flower']), s1(x2 - 2, 103, z2 + 1, 'potted_dandelion'),
              s1(mid - 1, 104, z2 + 1, 'lantern[hanging=false]'.replace('lantern[hanging=false]', 'wall_torch[facing=south]')),
              s1(mid + 1, 104, z2 + 1, 'wall_torch[facing=south]'),
              f(x1 + 1, 101, z2 + 2, x1 + 3, 101, z2 + 2, f"{P.replace('_planks', '')}_stairs[facing=north]"
                if P.endswith('_planks') else 'spruce_stairs[facing=north]'),
              f(x2 + 1, 101, z1, x2 + 2, 103, z1 + 2, f'{L}[axis=z]'),
              s1(mid, 102, z2 + 3, 'lantern'), s1(mid, 101, z2 + 3, st['fence'])])
    # Bäume und Blumen
    trees = [(x0 + 5, z0 + 6), (x0 + 22, z0 + 21), (x0 + 5, z0 + 21)]
    S.append([f(tx, 101, tz, tx, 105, tz, L.replace('stripped_', '')) for tx, tz in trees] +
             [f(tx - 2, 104, tz - 2, tx + 2, 105, tz + 2, f"{st['leaves']}[persistent=true]") for tx, tz in trees] +
             [f(tx - 1, 106, tz - 1, tx + 1, 107, tz + 1, f"{st['leaves']}[persistent=true]") for tx, tz in trees] +
             [f(tx, 104, tz, tx, 106, tz, L.replace('stripped_', '')) for tx, tz in trees])
    flowers = ['poppy', 'dandelion', 'cornflower', 'oxeye_daisy', 'allium', 'azure_bluet', 'red_tulip']
    S.append([s1(x0 + 4 + (i * 7) % 20, 101, z0 + 19 + (i * 3) % 5, flowers[i % len(flowers)]) for i in range(14)] +
             [s1(x0 + 20 + (i * 3) % 4, 101, z0 + 4 + (i * 5) % 6, flowers[(i + 2) % len(flowers)]) for i in range(8)])
    return S


def all_huts():
    return [(n, hut(p[0], p[1], STYLES[i % len(STYLES)])) for i, (n, p) in enumerate(order())]


def build_now(skip=0):
    """Ohne Kamera alles fertig bauen (bis auf die ersten `skip` Hütten)."""
    for n, steps in all_huts()[skip:]:
        for step in steps:
            for c in step:
                at(c)
    hand_blocks()


def hand_blocks():
    """Jeder setzt von Hand zwei Wegsteine ans Gartentor – erst dann zählt die Parzelle als bebaut."""
    for n, p in order():
        if n == POV:
            continue
        x0, z0 = p[0], p[1]
        mid = x0 + 13
        rc(f'give {n} stone_bricks 4')
        at(f'tp {n} {mid + 0.5} {Y} {z0 + 22.5} 0 60')
    time.sleep(1.5)
    for n, p in order():
        if n == POV:
            continue
        x0, z0 = p[0], p[1]
        say(f'{n} nimm stone_bricks', f'{n} setze {x0 + 13} 100 {z0 + 23} up')
    time.sleep(3)


# ------------------------------------------------------------------ Ablauf der Runde

def to_hall():
    rc('tick rate 20')
    if status().get('phase'):
        rc('baumeisteradmin stopp')
        time.sleep(8)
    for n in ACTORS:
        rc(f'regie halle {n}')
        say(f'{n} physik an', f'{n} stopp')
    rc(f'gamemode adventure {POV}')
    rc(f'regie halle {POV}')


def runde_ohne():
    """Zweite Runde nur mit den Darstellern (für die Siegerehrung von außen): Kamera nicht dabei, gleich Almhütte,
    jeder setzt von Hand seine Wegsteine (die Hütten stehen noch), dann Bewertung bis zur Siegerehrung."""
    to_hall()
    rc(f'regie raus {POV}')
    rc(f'gamemode spectator {POV}')
    rc('baumeisteradmin start klassisch almhuette')
    D.until(lambda: status().get('phase') == 'BUILD', 70, 0.5, 'Bauzeit')
    time.sleep(2)
    build_now()
    bewerten()
    bewerten_bis_ende()


def runde():
    to_hall()
    rc('baumeisteradmin start klassisch')
    D.until(lambda: status().get('phase') == 'THEME', 15, 0.5, 'Themen-Wahl')


def thema():
    rc('baumeisteradmin thema almhuette')
    D.until(lambda: status().get('phase') == 'BUILD', 70, 0.5, 'Bauzeit')
    time.sleep(2)


def bewerten():
    """Zur Bewertung; jeder gezeigte Bau bekommt Stimmen der Darsteller (Seppls Hütte 5, die anderen 3–4)."""
    rc('baumeisteradmin vorspulen weiter')
    D.until(lambda: status().get('phase') == 'RATE', 30, 0.5, 'Bewertung')


def rate_shown(pov_too=True):
    s = status()
    shown = int(s.get('gezeigt', -1))
    owner = next((n for n, i in s['builders'].items() if i == shown), None)
    for n in [POV] + ACTORS if pov_too else ACTORS:
        if n == owner:
            continue
        stars = 5 if owner == POV else (4 if hash(n + str(owner)) % 2 else 3)
        rc(f'regie als {n} bewerten {stars}')
    return shown


def bewerten_bis_ende(pov_skip=None):
    """In normaler Geschwindigkeit alle Bauten bewerten lassen, bis die Siegerehrung beginnt."""
    rc('tick rate 20')
    seen = set()
    end = time.time() + 240
    while time.time() < end:
        s = status()
        if s.get('phase') != 'RATE':
            return
        shown = int(s.get('gezeigt', -1))
        if shown >= 0 and shown not in seen:
            time.sleep(1.5)
            rate_shown(pov_too=shown != pov_skip)
            seen.add(shown)
        time.sleep(0.5)


# ------------------------------------------------------------------ Einstellungen

def _intro():
    cam = [{'p': [0.5, 124.0, 50.0], 'look': [0.5, 104.0, 0.0], 't': 0},
           {'p': [0.5, 114.0, 32.0], 'look': [0.5, 104.0, 0.0], 't': 3.6},
           {'p': [6.0, 106.0, 18.0], 'look': [0.0, 104.0, 0.0], 't': 3.6, 'ease': 1}]
    ev = [act(0.2 + 0.4 * i, f'{n} geh {-4 + 3 * i} {Y} {8 + (i % 2)} blick=0,104,0') for i, n in enumerate(ACTORS)]
    return {'camera': cam, 'events': ev}


def _thema():
    """Ich-Sicht in der Bauhütte: die Runde beginnt, das Fenster mit den drei Themen geht auf, Klick auf einen."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True,
            'events': [cmd(0.2, 'baumeisteradmin start klassisch')],
            'clicks': [{'at': 3.6, 'button': 1}],
            'input': [{'at': 1.6, 'mouse': THEME_MOUSE[0], 'dur': 0.6}, {'at': 2.6, 'mouse': THEME_MOUSE[1], 'dur': 0.6},
                      {'at': 4.6, 'key': 'Escape'}]}


THEME_MOUSE = [[692, 330], [800, 330]]   # beim Dreh aus dem Bild bestimmt


def _zeitraffer():
    """Zeitraffer: Seppls Almhütte wächst Schicht für Schicht – die Kamera kreist um die Parzelle."""
    n, h = all_huts()[0]
    p = plot_of(n)
    cx, cz = (p[0] + p[2]) / 2 + 0.5, (p[1] + p[3]) / 2 + 0.5
    dur = 7.4
    ev = []
    for i, step in enumerate(h):
        t = 0.3 + i * (dur - 1.6) / len(h)
        ev += [cmd(t, f'execute in {DIM} run {c}') for c in step]
    cam = [{'p': [cx - 15.0, 112.0, cz + 15.0], 'look': [cx, 104.0, cz - 1.0], 't': 0},
           {'p': [cx + 1.0, 110.5, cz + 20.0], 'look': [cx, 104.5, cz - 1.0], 't': dur / 2},
           {'p': [cx + 16.0, 109.5, cz + 13.0], 'look': [cx, 104.5, cz - 1.0], 't': dur / 2}]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_zeitraffer():
    """Seppls Parzelle leer räumen (falls schon gebaut), alle anderen Hütten gleich fertig bauen."""
    p = plot_of(POV)
    at(f'fill {p[0]} 101 {p[1]} {p[2]} 115 {p[3]} air')
    at(f'fill {p[0]} 100 {p[1]} {p[2]} 100 {p[3]} grass_block')


def _bauen():
    """Ich-Sicht (kreativ): Seppl setzt Laternen und Blumen an seinen Gartenweg."""
    p = plot_of(POV)
    x0, z0 = p[0], p[1]
    mid = x0 + 13
    spots = [(mid - 2, z0 + 20), (mid + 2, z0 + 20), (mid - 2, z0 + 23), (mid + 2, z0 + 23)]
    looks = [{'at': 0.2 + 1.1 * i, 'target': [sx + 0.5, 101.0, sz + 0.5]} for i, (sx, sz) in enumerate(spots)]
    clicks = [{'at': 0.9 + 1.1 * i, 'button': 3} for i in range(len(spots))]
    keys = [{'at': 0.5 + 1.1 * i, 'key': '1' if i % 2 == 0 else '2', 'dur': 0.1} for i in range(len(spots))]
    return {'gamemode': 'creative', 'aim': 45, 'clear_chat': True,
            'start': {'p': [mid + 0.5, Y, z0 + 26.5], 'yaw': 180, 'pitch': 30},
            'setup': [f'clear {POV}', f'item replace entity {POV} hotbar.0 with lantern 16',
                      f'item replace entity {POV} hotbar.1 with potted_red_tulip 16'],
            'look': looks, 'clicks': clicks, 'keys': keys}


def _werkzeug():
    """Ich-Sicht: Werkzeugkiste auf, Uhrzeit „Abend“ – die eigene Parzelle steht im Abendlicht."""
    p = plot_of(POV)
    return {'gamemode': 'creative', 'aim': 30, 'clear_chat': True,
            'start': {'p': [p[0] + 9.5, 103.5, p[1] + 27.0], 'yaw': 160, 'pitch': 8},
            'events': [cmd(0.3, f'regie als {POV} werkzeug')],
            'clicks': [{'at': 1.6, 'button': 1}, {'at': 3.0, 'button': 1}],
            'input': [{'at': 0.8, 'mouse': TOOL_MOUSE[0], 'dur': 0.6}, {'at': 2.2, 'mouse': TOOL_MOUSE[1], 'dur': 0.6}]}


TOOL_MOUSE = [[746, 248], [854, 330]]   # aus dem Bild: Uhrzeit (Uhr), dann Abend (rosa)


def _fertig():
    """Flug über die fertigen Almhütten der anderen."""
    huts = dict(order())
    a, b = huts['ResiBlume19'], huts.get('Lena_Herbst05', huts['ResiBlume19'])
    ca = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    cb = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    cam = [{'p': [ca[0] - 10.0, 105.5, ca[1] + 14.0], 'look': [ca[0], 105.0, ca[1]], 't': 0},
           {'p': [ca[0] + 12.0, 108.0, ca[1] + 14.0], 'look': [ca[0] + 4.0, 105.0, ca[1]], 't': 2.6},
           {'p': [cb[0] - 10.0, 109.0, cb[1] + 16.0], 'look': [cb[0], 105.0, cb[1]], 't': 3.0, 'ease': 1}]
    return {'camera': cam}


def _bewerten_ich():
    """Ich-Sicht: man steht vor einem Bau, nimmt die grüne Wolle – „Meisterwerk“ (5 Sterne)."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True,
            'keys': [{'at': 1.0, 'key': '5', 'dur': 0.1}], 'clicks': [{'at': 2.0, 'button': 3}]}


def prep_bewerten_ich():
    """Warten, bis ein fremder Bau gezeigt wird (nicht Seppls)."""
    rc('tick rate 20')
    def foreign():
        s = status()
        shown = int(s.get('gezeigt', -1))
        return shown >= 0 and shown != s['builders'].get(POV)
    D.until(foreign, 90, 0.3, 'fremder Bau gezeigt')
    time.sleep(1.0)


PODIUM = (1001.0, 101.0, -134.0)   # Siegerpodest von Bauplatz 1 (aus dem Bild)


def _sieger():
    px, py, pz = PODIUM
    cam = [{'p': [px - 8.0, py + 3.0, pz + 10.0], 'look': [px, py + 2.0, pz], 't': 0},
           {'p': [px + 7.0, py + 3.5, pz + 9.0], 'look': [px, py + 2.5, pz], 't': 7.0, 'ease': 1}]
    return {'camera': cam}


def _brief():
    """Ich-Sicht (Sieger): den Meisterbrief aufschlagen."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': False,
            'input': [{'at': 0.2, 'select': 'written_book'}], 'clicks': [{'at': 0.8, 'button': 3, 'opens': True}],
            'events': []}


def _ende():
    px, py, pz = PODIUM
    cam = [{'p': [px + 5.0, py + 4.0, pz + 9.0], 'look': [px, py + 2.0, pz], 't': 0},
           {'p': [px + 6.0, py + 30.0, pz + 30.0], 'look': [px, py + 4.0, pz + 130.0], 't': 6.0, 'ease': 1}]
    return {'camera': cam}


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': _intro},
    {'id': '02-thema', 'bars': 3, 'start': 1.0, 'card': 'lt-thema.png', 'kind': 'ich', 'spec': _thema},
    {'id': '03-zeitraffer', 'bars': 4, 'card': 'lt-zeitraffer.png', 'prep': prep_zeitraffer, 'spec': _zeitraffer},
    {'id': '04-bauen', 'bars': 3, 'card': 'lt-bauen.png', 'kind': 'ich', 'spec': _bauen},
    {'id': '05-werkzeug', 'bars': 3, 'card': 'lt-werkzeug.png', 'kind': 'ich', 'spec': _werkzeug},
    {'id': '06-fertig', 'bars': 3, 'card': 'lt-fertig.png', 'spec': _fertig},
    {'id': '07-bewerten', 'bars': 3, 'card': 'lt-bewerten.png', 'kind': 'ich', 'prep': prep_bewerten_ich,
     'spec': _bewerten_ich},
    {'id': '08-sieger', 'bars': 4, 'card': 'lt-sieger.png', 'spec': _sieger},
    # Der Meisterbrief geht beim Sieger von selbst auf: die Aufnahme dafür ist die Siegerehrung der ersten Runde aus
    # Seppls Sicht (08-sieger in Runde 1, als 09-brief abgelegt); die Siegerehrung von außen kommt aus Runde 2.
    {'id': '09-brief', 'bars': 2, 'start': 1.0, 'card': 'lt-brief.png', 'kind': 'ich', 'spec': _brief},
    {'id': '10-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'spec': _ende},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    steps = {'runde': runde, 'runde-ohne': runde_ohne, 'thema': thema, 'bauen': build_now, 'hand': hand_blocks, 'bewerten': bewerten,
             'bewerten-bis-ende': bewerten_bis_ende, 'halle': to_hall}
    if args and args[0] in steps:
        steps[args[0]]()
    else:
        D.main(sys.modules[__name__], args)
