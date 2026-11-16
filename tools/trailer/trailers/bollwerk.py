"""Trailer: Bollwerk – das Dorf gegen Welle um Welle verteidigen, zwischen den Wellen kaufen, bauen, verbessern.

Gedreht auf einem eigenen Test-Server (Morni-Bollwerk `test/run.sh` mit SERVER_DIR=…/bollwerk-trailer, Port 25790,
RCON 25890, ViaVersion/ViaBackwards für den 26.3-Client, view-distance 10). Wachstube und Karten stehen in der eigenen
Welt `minecraft:bollwerk` (DIM) – alles mit Ort läuft über `execute in`. Talsperre bei x 1000, Klosterhof bei x 2000.

Alles Spielgeschehen ist echt und läuft im Plugin: Runde aus der Wachstube, Krämerladen (echter Client, Ich-Sicht),
Baupläne kaufen und auf die Bauplätze setzen (Darsteller schicken das echte Klick-Paket), Wellen (`/bollwerk welle n`),
Türme schießen, Gegner schlagen auf die Palisade, Darsteller kämpfen (echte Schläge), am Boden + retten (Ducken),
Turm verbessern (Menü-Klick), Lawinenriese, zweite Runde auf dem Klosterhof. Nur die Wege der Darsteller und der
Kamera kommen aus dem Drehbuch. Darsteller haben Resistenz (fallen nur, wenn das Drehbuch es will).

Hilfsmittel nur lokal im Test-Server: kleines Regie-Plugin (`regie als <spieler> <befehl>`, Kamera mit Tag mm_bleib
bleibt Zuschauer, `regie tafeln`; Quelle ~/mm-cache/trailer/bollwerk/regie-plugin/). Darsteller: bw-actors.cjs
(Anna Bert Carl Dora, später Emil Fritz für den Klosterhof). Kamera: echter Client „BwKamera“ mit chatScale 0.
Konfiguration des Test-Servers (config.yml): mindestens-spieler 20 (Countdown nur mit „bereit“), Aufbau 3600 s
(Wellen nur per Befehl), Startgeld 600, Herz 400, retten 3 s; Wachstube per `forceload` geladen (sonst verschwinden
die Tafeln, siehe Bericht).

  python3 trailers/bollwerk.py <einstellung …>      # vorbereiten + drehen
  python3 trailers/bollwerk.py runde                # Runde 1 auf der Talsperre (Darsteller + Kamera) starten
"""
import json, math, os, re, subprocess, sys, time

STYLE = 'bollwerk'
FILE = 'MorniNet-Trailer-Bollwerk.mp4'
SLOW = 14
DIM = 'minecraft:bollwerk'
CAM = os.environ.get('MM_CAMERA', 'BwKamera')
ACTORS = ['Anna', 'Bert', 'Carl', 'Dora']
HERE = os.path.dirname(os.path.abspath(__file__))
T = 1000.0   # Talsperre (Mitte x)
K = 2000.0   # Klosterhof (Mitte x)
Y = 101      # Füße
SPB = 4 * 60 / 112

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'morni.net · Spielmodus', 'title': 'Bollwerk',
     'text': 'Verteidigt das Dorf – Welle um Welle'},
    {'file': 'lt-wache.png', 'kind': 'lower', 'title': 'Die Wachstube', 'text': 'Karte wählen, bereit sagen – los geht’s'},
    {'file': 'lt-herz.png', 'kind': 'lower', 'title': 'Das Herz des Dorfes', 'text': 'Der Dorfbrunnen darf nicht fallen'},
    {'file': 'lt-laden.png', 'kind': 'lower', 'title': 'Der Krämerladen', 'text': 'Waffen, Rüstung und Baupläne'},
    {'file': 'lt-bauen.png', 'kind': 'lower', 'title': 'Bauen', 'text': 'Pfeilturm, Palisade und Heilbanner'},
    {'file': 'lt-welle.png', 'kind': 'lower', 'title': 'Die Welle rollt an', 'text': 'Gegner kommen aus drei Richtungen'},
    {'file': 'lt-turm.png', 'kind': 'lower', 'title': 'Türme schießen', 'text': 'Und die Palisade hält stand'},
    {'file': 'lt-kampf.png', 'kind': 'lower', 'title': 'Gemeinsam verteidigen', 'text': 'Allein oder mit bis zu sechs Leuten'},
    {'file': 'lt-retten.png', 'kind': 'lower', 'title': 'Am Boden?', 'text': 'Ein Mitspieler duckt sich daneben und hilft dir auf'},
    {'file': 'lt-ausbau.png', 'kind': 'lower', 'title': 'Welle geschafft!', 'text': 'Gulden verdienen, Bauten verbessern'},
    {'file': 'lt-boss.png', 'kind': 'lower', 'title': 'Boss-Welle', 'text': 'Der Lawinenriese walzt alles nieder'},
    {'file': 'lt-kloster.png', 'kind': 'lower', 'title': 'Zweite Karte: Klosterhof', 'text': 'Verteidigt die Klosterglocke'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'morni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Bollwerk“ anklicken'},
]


# ------------------------------------------------------------------ Bausteine für Wege

def eye(p):
    return [p[0], p[1] + 1.62, p[2]]


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


# ------------------------------------------------------------------ Einstellungen

SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'time': 3000, 'spec': {
        'camera': [{'p': [948, 142, -78], 'look': [1000, 102, 0], 't': 0},
                   {'p': [972, 126, -56], 'look': [1000, 102, -3], 't': 4.2},
                   {'p': [990, 114, -36], 'look': [1000.5, 104, 0], 't': 4.2, 'ease': 1}]}},
    {'id': '02-wache', 'bars': 2, 'card': 'lt-wache.png', 'time': 3000, 'map': 'keine', 'spec': {
        'camera': [{'p': [3.0, 103.3, -10.0], 'look': [5.0, 102.3, -2.5], 't': 0},
                   {'p': [-3.5, 103.2, -9.6], 'look': [-5.0, 102.3, -2.5], 't': 4.8, 'ease': 1}],
        'actors': {
            'Anna': stand([-4.6, Y, -4.5], [-6.0, 102.2, -6], 4.8),
            'Bert': walk([[-0.5, Y, 0.5], [-2.6, Y, -3.4]], 4.8, [-5.0, 102.6, -5.0], 0.6),
            'Carl': stand([5.4, Y, -3.5], [5.5, 102.2, -6], 4.8),
            'Dora': walk([[9.0, Y, 0.5], [7.2, Y, -3.6]], 4.8, [6.0, 102.4, -6], 0.5)},
        'events': [act(0.6, 'Carl', 'swing'), act(1.4, 'Dora', 'swing'), act(2.9, 'Anna', 'swing'),
                   act(3.6, 'Anna', 'swing')]}},
    {'id': '03-dorf', 'bars': 2, 'card': 'lt-herz.png', 'time': 3000, 'spec': {
        'camera': [{'p': [T + 0.5, 102.4, 14.8], 'look': [T + 0.5, 102.6, 2.0], 't': 0},
                   {'p': [T + 1.8, 103.7, 10.8], 'look': [T + 0.5, 104.4, 0.5], 't': 2.4},
                   {'p': [T + 3.9, 106.2, 8.6], 'look': [T + 0.5, 106.2, 0.5], 't': 2.4, 'ease': 1}],
        'actors': {
            'Anna': walk([[T - 0.4, Y, 10.6], [T - 1.0, Y, 3.7]], 4.8, [T + 0.5, 104, 0.5], 0.85),
            'Bert': walk([[T + 1.6, Y, 11.0], [T + 2.3, Y, 3.9]], 4.8, [T + 0.5, 104, 0.5], 0.9),
            'Carl': walk([[T - 2.4, Y, 11.6], [T - 2.8, Y, 5.0]], 4.8, [T + 0.5, 104, 0.5], 0.95),
            'Dora': walk([[T + 3.6, Y, 11.8], [T + 3.9, Y, 5.3]], 4.8, [T + 0.5, 104, 0.5], 0.95)}}},
    {'id': '04-laden', 'bars': 2, 'card': 'lt-laden.png', 'custom': 'laden', 'time': 3000, 'spec': {'camera': []}},
    {'id': '05-bauen', 'bars': 2, 'card': 'lt-bauen.png', 'time': 3000,
     'prep': lambda: say('Anna slot 3', 'Bert slot 3', 'Dora slot 3'), 'spec': {
        'camera': [{'p': [T - 4.5, 103.8, 1.0], 'look': [T + 2.0, 102.6, -13], 't': 0},
                   {'p': [T - 2.6, 103.5, -2.4], 'look': [T + 2.5, 103.2, -14], 't': 4.8, 'ease': 1}],
        'actors': {
            'Anna': stand([T + 4.5, Y, -11.3], [T + 4.5, 100.5, -13.6], 4.8),
            'Bert': stand([T + 0.5, Y, -13.1], [T + 0.5, 100.5, -15.6], 4.8),
            'Dora': stand([T + 2.6, Y, -5.6], [T + 5.4, 100.5, -5.5], 4.8)},
        'events': [act(1.2, 'Anna', 'activate', f'{T + 4:.0f} 100 -14'),
                   act(2.2, 'Bert', 'activate', f'{T:.0f} 100 -16'),
                   act(3.1, 'Dora', 'activate', f'{T + 5:.0f} 100 -6')]}},
    {'id': '06-welle', 'bars': 2, 'card': 'lt-welle.png', 'time': 3000, 'wave': (22, 3), 'spec': {
        'camera': [{'p': [T + 2.8, 102.4, -38.5], 'look': [T - 8.0, 101.9, -45.5], 't': 0},
                   {'p': [T + 2.9, 102.7, -31.8], 'look': [T - 5.0, 102.1, -42.0], 't': 4.8}]}},
    {'id': '07-turm', 'bars': 2, 'card': 'lt-turm.png', 'time': 3000, 'wave': (2, 10), 'spec': {
        'camera': [{'p': [T + 0.5, 108.4, -8.8], 'look': [T + 0.5, 101.4, -19.5], 't': 0},
                   {'p': [T + 0.5, 107.4, -10.8], 'look': [T + 0.5, 101.6, -20.0], 't': 4.8, 'ease': 1}]}},
    {'id': '08-kampf', 'bars': 2, 'card': 'lt-kampf.png', 'time': 3000, 'fight': True, 'spec': {
        'camera': [{'p': [T - 4.9, 103.6, -1.1], 'look': [T - 10.5, 101.8, 0.6], 't': 0},
                   {'p': [T - 5.9, 103.0, -0.7], 'look': [T - 10.5, 101.9, 0.8], 't': 4.8, 'ease': 1}],
        'actors': {
            'Anna': walk([[T - 9.0, Y, -0.6], [T - 9.6, Y, -0.3], [T - 9.2, Y, -0.8]], 4.8),
            'Carl': walk([[T - 9.4, Y, 2.0], [T - 10.0, Y, 1.8], [T - 9.7, Y, 2.3]], 4.8),
            'Dora': walk([[T - 7.6, Y, 0.6], [T - 8.2, Y, 0.9]], 4.8)},
        'events': []}},
    {'id': '09-retten', 'bars': 2, 'card': 'lt-retten.png', 'time': 3000, 'spec': {
        'camera': [{'p': [T + 0.4, 102.1, 16.3], 'look': [T + 1.3, 101.1, 12.6], 't': 0},
                   {'p': [T + 0.9, 101.8, 15.5], 'look': [T + 1.3, 101.3, 12.8], 't': 4.8, 'ease': 1}],
        'actors': {
            'Bert': stand([T + 1.5, Y, 13.0], [T - 3, 101.5, 13.0], 4.8),
            'Anna': walk([[T - 0.2, Y, 10.6], [T + 1.4, Y, 11.8]], 4.8, [T + 1.5, 101.0, 13.0], 0.12),
            'Carl': stand([T - 2.5, Y, 10.0], [T - 1.0, 102.5, 0.5], 4.8),
            'Dora': stand([T + 4.5, Y, 10.5], [T + 2.0, 102.5, 0.5], 4.8)},
        'events': [raw(0.15, 'effect clear Bert'), raw(0.3, 'damage Bert 100 minecraft:generic'),
                   act(0.7, 'Anna', 'sneak', 'on'), act(4.5, 'Anna', 'sneak', 'off'),
                   act(1.2, 'Carl', 'swing'), act(2.6, 'Dora', 'swing')],
        'after': ['effect give Bert minecraft:resistance infinite 4 true']}},
    {'id': '10-ausbau', 'bars': 2, 'card': 'lt-ausbau.png', 'time': 3000, 'spec': {
        'camera': [{'p': [T + 5.2, 105.6, -5.4], 'look': [T + 4.0, 103.2, -14.0], 't': 0},
                   {'p': [T + 5.0, 105.0, -6.8], 'look': [T + 4.0, 103.4, -14.0], 't': 4.8, 'ease': 1}],
        'actors': {
            'Anna': walk([[T + 1.2, Y, -8.4], [T + 2.1, Y, -11.0]], 4.8, [T + 4.2, 103.0, -14.0], 0.25),
            'Bert': walk([[T - 0.8, Y, -4.5], [T + 0.6, Y, -8.0]], 4.8, [T + 4.2, 104.0, -14.0], 0.6),
            'Dora': stand([T + 7.4, Y, -8.6], [T + 4.2, 104.0, -14.0], 4.8)},
        'events': [act(0.1, 'Anna', 'slot', '0'), act(1.5, 'Anna', 'activate', f'{T + 4:.0f} 104 -14'),
                   act(2.1, 'Anna', 'click', '13'), act(2.6, 'Anna', 'close'),
                   act(2.5, 'Dora', 'swing'), act(2.9, 'Bert', 'swing'), act(3.3, 'Dora', 'swing')]}},
    {'id': '11-boss', 'bars': 2, 'card': 'lt-boss.png', 'cardAt': 0.6, 'time': 12650, 'boss': 'spawn', 'spec': {
        # Der Lawinenriese kommt den Nordweg herab und stapft aufs Tor zu (Kamera schwenkt mit; im Schnitt nur die
        # ersten 4,6 s, danach steht eine Fichte im Bild).
        'fit': False, 'wait': 0.5,
        'camera': [{'p': [T + 10.5, 104.0, -43.0], 'look': [T - 6.0, 102.8, -41.5], 't': 0},
                   {'p': [T + 10.0, 104.1, -41.0], 'look': [T + 0.5, 103.0, -34.0], 't': 3.0},
                   {'p': [T + 9.2, 104.3, -37.5], 'look': [T + 0.5, 103.0, -24.5], 't': 3.5},
                   {'p': [T + 8.6, 104.6, -35.0], 'look': [T + 0.5, 103.2, -22.0], 't': 3.3, 'ease': 1}]}},
    {'id': '11b-riese', 'bars': 2, 'start': 3.2, 'time': 12650, 'boss': 'gate', 'spec': {
        # Von innen: der Riese hinter der Palisade (Turm trifft ihn), zerschlägt sie und stapft herein.
        # Gedreht wird die volle Fahrt (9,6 s), im Schnitt ab 3,2 s.
        'fit': False, 'wait': 0.5,
        'camera': [{'p': [T - 2.3, 105.0, -8.6], 'look': [T + 0.5, 102.6, -19.5], 't': 0},
                   {'p': [T - 2.1, 105.2, -9.4], 'look': [T + 0.5, 102.8, -19.0], 't': 5.0},
                   {'p': [T - 2.9, 107.0, -4.0], 'look': [T + 0.5, 102.4, -14.0], 't': 4.6, 'ease': 1}],
        'events': [cmd(t, f'kill @e[tag=bollwerk_enemy,tag=!bollwerk_lawinenriese,x={T - 12:.0f},y=95,z=-50,dx=24,dy=20,dz=34]')
                   for t in (0.3, 2.5, 4.5)]}},
    {'id': '12-kloster', 'bars': 2, 'card': 'lt-kloster.png', 'time': 12300, 'wave': (3, 11), 'map': 'klosterhof',
     'spec': {
        'camera': [{'p': [K + 7.5, 101.5, 40.0], 'look': [K + 0.5, 99.5, 30.0], 't': 0},
                   {'p': [K + 6.5, 108.5, 27.0], 'look': [K + 0.5, 102.0, 14.0], 't': 2.6},
                   {'p': [K + 9.5, 113.0, 13.0], 'look': [K + 0.5, 102.0, 1.5], 't': 2.6, 'ease': 1}],
        'actors': {
            'Anna': walk([[K - 1.2, Y, 15.5], [K - 0.8, Y, 16.4]], 5.2, [K + 0.5, 101.5, 24]),
            'Bert': walk([[K + 2.3, Y, 15.8], [K + 1.9, Y, 16.6]], 5.2, [K + 0.5, 101.5, 24]),
            'Dora': stand([K + 3.0, Y, 3.6], [K + 0.5, 103.0, 0.5], 5.2),
            'Carl': stand([K - 2.6, Y, 4.2], [K + 0.5, 103.0, 0.5], 5.2)},
        'events': [act(t, n, 'hit') for t, n in [(1.0, 'Anna'), (1.4, 'Bert'), (1.9, 'Anna'), (2.3, 'Bert'),
                                                  (2.8, 'Anna'), (3.2, 'Bert'), (3.7, 'Anna'), (4.1, 'Bert'),
                                                  (4.6, 'Anna')]]}},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'time': 12700, 'map': 'klosterhof', 'spec': {
        'camera': [{'p': [T + 4.6, 102.7, 6.4], 'look': [T + 0.5, 103.8, 0.5], 't': 0},
                   {'p': [T + 4.4, 108.5, 7.2], 'look': [T + 0.5, 102.5, 1.5], 't': 2.6},
                   {'p': [T + 10.0, 118.0, 17.0], 'look': [T + 0.0, 103.5, 0.0], 't': 2.6},
                   {'p': [T + 34.0, 127.0, 34.0], 'look': [T - 3.0, 104.0, -3.0], 't': 3.4, 'ease': 1}],
        'actors': {n: stand(p, [T + 0.5, 104.5, 0.5], 8.0) for n, p in {
            'Anna': [T + 2.8, Y, 4.2], 'Bert': [T - 1.6, Y, 4.6], 'Carl': [T + 4.4, Y, 1.6],
            'Dora': [T + 0.8, Y, 5.4]}.items()},
        'events': [act(t, n, 'swing') for t, n in [(0.5, 'Anna'), (0.8, 'Bert'), (1.1, 'Dora'), (1.4, 'Carl'),
                                                   (1.9, 'Anna'), (2.3, 'Dora'), (2.7, 'Bert'), (3.1, 'Carl')]]}},
]
for _s in SHOTS:
    _s['spec']['dim'] = DIM


def _fight_events():
    ev = []
    for i, (t, who) in enumerate([(0.3, 'Anna'), (0.55, 'Carl'), (0.8, 'Dora'), (1.05, 'Anna'), (1.4, 'Carl'),
                                  (1.65, 'Anna'), (1.9, 'Dora'), (2.3, 'Carl'), (2.55, 'Anna'), (2.85, 'Dora'),
                                  (3.2, 'Carl'), (3.45, 'Anna'), (3.75, 'Dora'), (4.1, 'Carl'), (4.35, 'Anna')]):
        ev.append(act(t, who, 'hit'))
    for t, who, x, z in [(1.1, 'Anna', T - 10.5, -0.6), (2.6, 'Carl', T - 10.8, 2.0), (3.8, 'Anna', T - 10.5, -0.6)]:
        ev.append(cmd(t + 0.02, f'positioned {x} {Y} {z} run damage @e[tag=bollwerk_enemy,sort=nearest,limit=1,'
                                f'distance=..4] 500 minecraft:player_attack by {who}'))
    return ev


for _s in SHOTS:
    if _s['id'] == '08-kampf':
        _s['spec']['events'] = _fight_events()

# ------------------------------------------------------------------ Regie

sys.path.insert(0, os.path.join(HERE, '..'))
_rc = None


def rc(c):
    global _rc
    if _rc is None:
        from shot import Rcon
        _rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    return re.sub('§.', '', _rc(c))


def say(*lines):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        for line in lines:
            f.write(line + '\n')


def at(c):
    return rc(f'execute in {DIM} run {c}')


def until(cond, t=20, step=0.3, what=''):
    end = time.time() + t
    while time.time() < end:
        v = cond()
        if v:
            return v
        time.sleep(step)
    raise SystemExit(f'Zeit abgelaufen: {what}')


def status():
    """/bollwerk status als Werte je Karte: {phase, welle, herz, players: {Anna: {state, gold}} …}."""
    games = {}
    for line in rc('bollwerk status').split('\n'):
        if not line.startswith('karte='):
            continue
        s = {'bau': {}, 'players': {}}
        for part in line.split(' '):
            if '=' not in part:
                continue
            k, v = part.split('=', 1)
            if k == 'herz':
                s['herz'] = float(v.split('/')[0])
            elif re.match(r'^bau\d+$', k):
                ty, lvl, hp, uses = v.split(':')
                s['bau'][int(k[3:])] = {'type': ty, 'level': int(lvl), 'hp': float(hp)}
            elif re.match(r'^[A-Z]', k):
                st, gold, kills, rev = v.split(':')
                s['players'][k] = {'state': st, 'gold': int(gold)}
            else:
                s[k] = v
        games[s['karte']] = s
    return games


def tough(*names):
    for n in names:
        rc(f'effect give {n} minecraft:resistance infinite 4 true')


def camera_at(p, look, settle=4.0):
    # Nach dem Ende einer Runde nimmt die Wachstube der Kamera das Fliegen (setAllowFlight false) – dann fällt sie
    # als Zuschauer durch die Welt. Einmal umschalten setzt die Fähigkeiten zurück.
    rc(f'gamemode adventure {CAM}')
    rc(f'gamemode spectator {CAM}')
    at(f'tp {CAM} {p[0]} {p[1]} {p[2]} facing {look[0]} {look[1]} {look[2]}')
    time.sleep(settle)


def prepare(s):
    at(f'time set {s.get("time", 6000)}')
    at('weather clear')
    karte = s.get('map', 'talsperre')
    if karte != 'keine':
        rc(f'bollwerk herz 100000 {karte}')
    if karte == 'talsperre':
        park(*[n for n in ACTORS if n not in s['spec'].get('actors', {})])
    if s.get('wave'):  # Welle neu starten und laufen lassen, bis die ersten Gegner unterwegs sind
        n, wait = s['wave']
        rc(f'bollwerk welle {n} {karte}')
        wave_start = time.time()
    c0 = s['spec']['camera'][0]
    camera_at(c0['p'], c0.get('look', c0['p']), s.get('settle', 6))
    if s.get('fight'):  # Kämpfer schon hinstellen, damit die Gegner auf dem Almweg auf sie losgehen
        for n, path in s['spec']['actors'].items():
            p = path[0]['p']
            at(f'tp {n} {p[0]} {p[1]} {p[2]} 90 0')
        time.sleep(6)
    if s.get('wave'):
        time.sleep(max(0.0, wait - (time.time() - wave_start)))
    if s.get('boss'):
        boss_wait(s['boss'])
    if s.get('prep'):
        s['prep']()


def boss_pos():
    out = at('data get entity @e[tag=bollwerk_lawinenriese,limit=1] Pos')
    v = re.findall(r'(-?[\d.]+)d', out)
    return [float(x) for x in v[:3]] if len(v) >= 3 else None


def boss_wait(when='gate'):
    """Boss-Welle 5: Begleiter auf dem Nordweg räumen (sonst zerschlagen sie die Palisade vor dem Riesen), warten, bis
    der Lawinenriese kurz vor dem Tor ist – dann geht der Dreh los."""
    rc('bollwerk welle 5 talsperre')
    end = time.time() + 120
    while time.time() < end:
        at(f'kill @e[tag=bollwerk_enemy,tag=!bollwerk_lawinenriese,x={T - 12:.0f},y=95,z=-50,dx=24,dy=20,dz=34]')
        p = boss_pos()
        if p and (when == 'spawn' or p[2] >= -38.5):
            print('Lawinenriese bei', p, flush=True)
            return
        time.sleep(0.4)
    raise SystemExit('Lawinenriese kam nicht')


def start_round():
    """Runde 1: alle in der Wachstube (Darsteller + Kamera) sagen bereit, Talsperre gewinnt die Abstimmung."""
    rc('regie als Anna karte talsperre')
    for n in ACTORS + [CAM]:
        rc(f'regie als {n} bereit')
    until(lambda: 'talsperre' in status(), 25, 0.5, 'Runde startet')
    time.sleep(1.5)
    tough(*ACTORS)
    print(status())


def buy(name, *slots):
    for sl in slots:
        say(f'{name} chat /shop')
        time.sleep(1.2)
        say(f'{name} click {sl}')
        time.sleep(1.2)
    say(f'{name} close')


def new_round():
    """Neue Runde auf der Talsperre (nur die Darsteller; die Kamera steht in der Wachstube hinten an und schaut zu).
    Danach Baupläne kaufen: Anna Pfeilturm, Bert Palisade, Dora Heilbanner, Carl Kesselfalle + Pfeilturm."""
    if 'talsperre' in status():
        rc('bollwerk herz 0 talsperre')
        until(lambda: 'talsperre' not in status(), 30, 0.5, 'Runde zu Ende')
        time.sleep(2)
    rc('regie als Anna karte talsperre')
    for n in ACTORS:
        rc(f'regie als {n} bereit')
    until(lambda: 'talsperre' in status(), 30, 0.5, 'Runde startet')
    time.sleep(1.5)
    rc(f'regie als {CAM} zuschauen talsperre')
    rc(f'tag {CAM} add mm_bleib')
    tough(*ACTORS)
    buy('Anna', 30)
    buy('Bert', 28)
    buy('Dora', 31)
    buy('Carl', 29, 30)
    print(status()['talsperre']['players'])


def gear():
    """Bessere Ausrüstung für die Kampf-Einstellungen (echte Käufe im Laden)."""
    buy('Anna', 10, 20)
    buy('Bert', 11, 19)
    buy('Carl', 10)
    buy('Dora', 11, 21)
    tough(*ACTORS)


PARK = {'Anna': [T - 1.5, Y, 15.5], 'Bert': [T + 0.5, Y, 16.5], 'Carl': [T + 2.5, Y, 15.5], 'Dora': [T + 4.5, Y, 16.5]}


def park(*names):
    """Darsteller ans Südende des Dorfs (weit genug vom Herz und den Wegen, damit keine Gegner sie jagen)."""
    for n in names or ACTORS:
        p = PARK[n]
        at(f'tp {n} {p[0]} {p[1]} {p[2]} 180 0')


def place(name, slot_, stand_at, spot):
    at(f'tp {name} {stand_at[0]} {Y} {stand_at[1]} 0 40')
    time.sleep(1.0)
    say(f'{name} slot {slot_}')
    time.sleep(0.5)
    say(f'{name} activate {spot[0]:.0f} 100 {spot[1]:.0f}')
    time.sleep(1.2)


def upgrade(name, block, times=1):
    """Rechtsklick auf einen Bau → Menü → Verbessern (Platz 13). Mit dem Schwert in der Hand (mit einem Bauplan in der
    Hand wäre der Rechtsklick ein Bauversuch)."""
    say(f'{name} slot 0')
    time.sleep(0.4)
    for _ in range(times):
        say(f'{name} activate {block[0]:.0f} {block[1]:.0f} {block[2]:.0f}')
        time.sleep(1.2)
        say(f'{name} click 13')
        time.sleep(1.0)
    say(f'{name} close')


def more_defences(full=False):
    """Carl baut außerhalb des Bilds: Kesselfalle in der Bresche (Platz 3), Pfeilturm an der Bresche (Platz 9).
    full: auch Annas Pfeilturm (8), Berts Palisade (1, auf Stufe 3) und Doras Heilbanner (13) – nach einer neuen Runde."""
    if full:
        place('Anna', 3, (T + 4.5, -11.3), (T + 4, -14))
        place('Bert', 3, (T + 0.5, -13.1), (T, -16))
        place('Dora', 3, (T + 2.6, -5.6), (T + 5, -6))
    place('Carl', 3, (T + 13.4, 0.5), (T + 16, 0))
    place('Carl', 4, (T + 11.5, -4.5), (T + 14, -4))
    at(f'tp Bert {T + 0.5} {Y} -13.1 180 30')
    time.sleep(1)
    upgrade('Bert', (T - 1, 101, -16), 2)
    park()
    print(status()['talsperre']['bau'])


def shop_shot(s, out):
    """Krämerladen in Ich-Sicht: die Kamera spielt selbst mit (Runde 1), öffnet den Laden und kauft echt
    (Diamantschwert, Eisenrüstung, Baupläne). Mausbewegung K-mal langsamer aufgenommen, danach beschleunigt."""
    disp = os.environ.get('MM_DISPLAY', ':101')
    env = dict(os.environ, DISPLAY=disp)
    x = lambda *a: subprocess.run(['xdotool', *map(str, a)], env=env, check=True)
    at(f'time set {s.get("time", 6000)}')
    rc('kill @e[tag=mmcam]')
    rc(f'gamemode adventure {CAM}')
    at(f'tp {CAM} {T + 1.8} {Y} 9.5 -90 8')
    x('mousemove', 800, 450)
    time.sleep(3)
    K = 3
    raw_f = out + '.raw.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size',
                           '1600x900', '-framerate', '15', '-i', disp, '-c:v', 'libx264', '-preset', 'ultrafast',
                           '-crf', '12', '-pix_fmt', 'yuv420p', raw_f], stdin=subprocess.PIPE)
    slot = lambda c, r: (584 + 54 * c, 194 + 54 * r)
    pos = [800, 450]

    def glide(to, dur):
        steps = max(1, int(dur * K * 20))
        a = list(pos)
        for i in range(1, steps + 1):
            u = i / steps
            u = u * u * (3 - 2 * u)
            x('mousemove', round(a[0] + (to[0] - a[0]) * u), round(a[1] + (to[1] - a[1]) * u))
            time.sleep(dur * K / steps)
        pos[:] = to

    time.sleep(0.55 * K)
    rc(f'regie als {CAM} shop')
    time.sleep(0.35 * K)
    for target, rest in [((2, 1), 0.55), ((2, 2), 0.5), ((3, 3), 0.5), ((1, 3), 0.45)]:
        glide(slot(*target), 0.4)
        time.sleep(rest * K * 0.6)
        x('click', 1)
        time.sleep(rest * K * 0.4)
    time.sleep(1.0 * K)
    ff.stdin.write(b'q'); ff.stdin.flush(); ff.wait()
    x('key', 'Escape')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw_f, '-vf', f'setpts=PTS/{K},fps=30', '-r', '30',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out], check=True)
    os.remove(raw_f)
    print(out)


def leave_camera():
    """Kamera verlässt Runde 1 und schaut der Talsperre zu (bleibt Zuschauer, auch wenn die Runde endet)."""
    rc(f'regie als {CAM} verlassen')
    time.sleep(1)
    rc(f'regie als {CAM} zuschauen talsperre')
    rc(f'tag {CAM} add mm_bleib')
    time.sleep(1)
    print(status().get('talsperre', {}).get('players'))


def main(args):
    if args == ['runde']:
        start_round()
        return
    if args == ['zuschauen']:
        leave_camera()
        return
    if args and args[0] in ('neu', 'ausruestung', 'bauten', 'parken'):
        {'neu': new_round, 'ausruestung': gear, 'bauten': more_defences, 'parken': park}[args[0]]()
        return
    if args == ['alles']:  # neue Runde mit allen Bauten und Ausrüstung (für die Wellen-Einstellungen)
        new_round()
        more_defences(True)
        gear()
        park()
        return
    out_dir = os.path.join(os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer'), 'bollwerk')
    for s in SHOTS:
        if args and s['id'] not in args:
            continue
        print(f'== vorbereiten {s["id"]}', flush=True)
        if s.get('custom') == 'laden':
            shop_shot(s, os.path.join(out_dir, f'{s["id"]}.mp4'))
            continue
        prepare(s)
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'make.py'), 'bollwerk', 'shot', s['id']], check=True)


if __name__ == '__main__':
    main(sys.argv[1:])
