"""Trailer: Wintersport – Bergdorf mit Christbaum, Sessellift, Riesenslalom im Boot (auch in der Ich-Sicht), Biathlon
mit Massenstart, Schießstand (Ich-Sicht mit echtem Bogen) und Strafrunde, Bobbahn mit Zweierbob, Siegerehrung.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh wintersport 28820 …: Paper 26.1.2, Morni Wintersport
0.1.1 aus dem GitHub-Release, Test-Netzwerk aus test/fake-network des Modus – HanniHof und Matzeee24 sind eine Party
und fahren darum im Zweierbob –, ViaVersion/ViaBackwards, Regie-Plugin `regie als <spieler> <befehl>` nur im
Test-Server). Die config.yml des Test-Servers startet nichts von selbst (mindestens-spieler 30), die Zeitlimits sind
lang und die Siegerehrung dauert 60 s – Wettkämpfe startet das Drehbuch mit `/wsadmin start <programm>`.

Alles Spielgeschehen ist echt, gewertet vom Plugin: Boote schiebt der Test-Autopilot des Modus (`/wsadmin fahren`),
im Biathlon laufen die Darsteller mit echter Physik bzw. der Autopilot (`/wsadmin laufen`), geschossen wird mit echten
Pfeilen (Darsteller: Blick + Bogen spannen; Aufnahme-Client: Maus halten).

Zwei Wettkämpfe:
  python3 trailers/wintersport.py runde-ich       # Toni (Kamera) fährt Slalom und schießt im Biathlon mit (05, 08)
  python3 trailers/wintersport.py runde-wettkampf # nur Darsteller: Slalom, Biathlon, Bob, Siegerehrung (04, 06, 07 …)
  python3 trailers/wintersport.py runde-schiessen # Toni läuft Runde 1 bis an den Schießstand (vor 08)
  python3 trailers/wintersport.py <einstellung …>  # drehen
  python3 make.py wintersport music|cards|sheet|cut|fertig
"""
import os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'wintersport'
STYLE = 'wintersport'
FILE = 'MoinMorni-Trailer-Wintersport.mp4'
SLOW = 15
DIM = 'minecraft:wintersport'
POV = os.environ.get('MM_CAMERA', 'Toni_Wandert11')
HANNI, MATZE, ELLA, RESI, EWALD = 'HanniHof', 'Matzeee24', 'EllaSommer7', 'ResiBlume19', 'Ewald77'
ACTORS = [HANNI, MATZE, ELLA, RESI, EWALD]
Y = 101  # man steht im Tal auf y 101 (Boden 100)

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Wintersport',
     'text': 'Riesenslalom, Biathlon und Bobbahn – um Gold, Silber und Bronze'},
    {'file': 'lt-dorf.png', 'kind': 'lower', 'title': 'Das Bergdorf', 'text': 'Abstimmen, „bereit“ sagen – 2 bis 12 Leute'},
    {'file': 'lt-lift.png', 'kind': 'lower', 'title': 'Mit dem Sessellift hinauf', 'text': 'Und mit dem Schlitten wieder runter'},
    {'file': 'lt-slalom.png', 'kind': 'lower', 'title': 'Riesenslalom', 'text': 'Im Boot die Eispiste hinab – vier Pisten nebeneinander'},
    {'file': 'lt-tore.png', 'kind': 'lower', 'title': 'Zwölf Tore', 'text': 'Rot links, blau rechts – verpasst kostet 3 Sekunden'},
    {'file': 'lt-ich.png', 'kind': 'lower', 'title': 'W = Gas, A/D = lenken', 'text': 'Auf den Absätzen springt das Boot'},
    {'file': 'lt-biathlon.png', 'kind': 'lower', 'title': 'Biathlon', 'text': 'Massenstart – drei Runden auf der Loipe'},
    {'file': 'lt-schiessen.png', 'kind': 'lower', 'title': 'Am Schießstand', 'text': 'Fünf Pfeile, fünf Scheiben – Treffer klappen weiß um'},
    {'file': 'lt-straf.png', 'kind': 'lower', 'title': 'Daneben?', 'text': 'Jeder Fehler eine Strafrunde'},
    {'file': 'lt-bob.png', 'kind': 'lower', 'title': 'Bobbahn', 'text': 'Zwölf Kehren im Eiskanal durch den Bergwald'},
    {'file': 'lt-zweier.png', 'kind': 'lower', 'title': 'Zweierbob', 'text': 'Partys fahren zusammen – der Erste lenkt'},
    {'file': 'lt-ehrung.png', 'kind': 'lower', 'title': 'Siegerehrung', 'text': 'Medaillenspiegel, Treppchen und Feuerwerk'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Wintersport“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def status():
    """/wsadmin status → {'top': {...}, 'comp': {...}, 'teams': {Name: {...}}, 'runners': {Name: {...}}}."""
    out = {'top': {}, 'comp': {}, 'teams': {}, 'runners': {}, 'racers': {}, 'stage': {}}
    for line in rc('wsadmin status').split('\n'):
        kv = dict(p.split('=', 1) for p in re.findall(r'\S+=\S+', line))
        if 'bereit' in kv:
            out['top'] = kv
        elif 'wettkampf' in kv:
            out['comp'] = kv
        elif 'r' in kv:
            out['racers'][kv['r']] = kv
        elif 'stage' in kv:
            out['stage'] = kv
        elif 't' in kv:
            for n in re.split(r'[+,]', kv['t'].strip('[]')):
                out['teams'][n] = kv
        elif 'b' in kv:
            out['runners'][kv['b']] = kv
    return out


def sky():
    at('time set 6000')
    at('weather clear')


def tick(rate=20):
    rc(f'tick rate {rate}')


def stop_comp():
    tick()
    if status()['top'].get('laeuft') == 'true':
        rc('wsadmin stopp')
        time.sleep(3)


def all_in_village(names):
    for n in names:
        rc(f'regie als {n} verlassen')
    time.sleep(1)


def start(program, racers, outsiders=()):
    """Neuer Wettkampf; `outsiders` (z. B. die Kamera) verlassen ihn gleich wieder."""
    stop_comp()
    sky()
    all_in_village(ACTORS + [POV])
    for n in ACTORS:
        say(f'{n} physik an')
    keep = set(racers)
    for n in ACTORS + [POV]:
        if n not in keep:
            rc(f'regie dorf-raus {n}')  # zählt nicht mit (sonst gäbe es einen zweiten Lauf mit Leeren)
    res = rc(f'wsadmin start {program}')
    print(res, flush=True)
    time.sleep(1)
    for n in ACTORS + [POV]:
        if n not in keep:
            rc(f'regie dorf-rein {n}')
    D.until(lambda: status()['comp'].get('phase') == 'STAGE', 30, 0.5, 'Wettkampf läuft')


def team(name):
    return status()['teams'].get(name, {})


def runner(name):
    return status()['runners'].get(name, {})


def wait_run(what, t=60):
    """Bis der Lauf der Boote begonnen hat (Starttor offen)."""
    D.until(lambda: status()['stage'].get('phase') == 'RUN', t, 0.5, what)


def drive(name, how='ziel'):
    return rc(f'wsadmin fahren {name} {how}')


def finish_boats(names):
    for n in names:
        drive(n)
    D.until(lambda: all(team(n).get('state') in ('finished', 'dnf') for n in names), 120, 1, 'alle im Ziel')


# ------------------------------------------------------------------ Einstellungen


def prep_dorf():
    stop_comp()
    sky()
    spots = {HANNI: (-2.5, 14.5), MATZE: (-0.5, 15.0), ELLA: (2.5, 13.5), RESI: (1.5, 16.0), EWALD: (3.5, 17.5)}
    for n, (x, z) in spots.items():
        at(f'tp {n} {x} {Y} {z} 180 0')
    time.sleep(2)


def _dorf():
    cam = [{'p': [1.5, 104.4, 25.0], 'look': [0.5, 106.0, 6.0], 't': 0},
           {'p': [1.0, 103.4, 19.5], 'look': [0.5, 105.5, 6.0], 't': 6.4, 'ease': 1}]
    ev = [act(0.1, f'{HANNI} geh -2.5 {Y} 11.0 blick=0,106,6'), act(0.3, f'{RESI} gruss 2'),
          act(0.5, f'{ELLA} geh 2.5 {Y} 10.5 blick={HANNI}'), act(1.0, f'{EWALD} geh 0.5 {Y} 14.5 blick=kamera'),
          act(2.0, f'{MATZE} springe 1')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_lift():
    """Ella, Resi und Hanni stellen sich nacheinander auf die rote Linie – die Sessel nehmen sie mit hinauf."""
    stop_comp()
    sky()
    for n in (HANNI, RESI, ELLA):
        at(f'tp {n} -71.5 {Y} -32.5 180 0')
        D.until(lambda: riding(n), 30, 0.3, f'{n} im Sessel')
        if n != ELLA:
            time.sleep(2.5)
    tick(20 / SLOW)
    print('Ella im Sessel bei', D.pos(ELLA), flush=True)


def riding(name):
    p = D.pos(name)  # Sessel: Spieler sitzen auf einem Anzeige-Objekt, RootVehicle steht nicht im Spieler
    return bool(p) and p[1] > 101.6 and p[2] < -33.4


def _lift():
    # Der Sessel fährt 7,5 Blöcke/s – die Kamera fährt seitlich mit (gemessen), Ella mitten im Bild
    return {'camera': [{'p': [-66.0, 107.0, -46.0], 't': 0},
                       {'p': [-65.5, 108.0, -53.0], 't': 6.4}], 'follow': [ELLA], 'fit': False}


# ------------------------------------------------------------------ Riesenslalom


def lane_x(name):
    return [-158, -140, -122, -104][int(team(name).get('lane', 1)) - 1] + 0.5


def gate_row(g):
    return -40 - (20 * (11 - g) + 8)


def stand_y(z):
    d = -40 - int(z // 1)
    if d <= 0:
        return 101
    if d > 240:
        return 125
    i, r = (d - 1) // 20, (d - 1) % 20
    return 101 + 2 * i + min(r + 1, 2)


def slow_at_count(rest=1.6):
    """Kurz vor dem Startschuss in Zeitlupe gehen: Phase COUNT abwarten, dann noch `rest` echte Sekunden."""
    D.until(lambda: status()['stage'].get('phase') == 'COUNT', 60, 0.2, 'Countdown')
    time.sleep(rest)
    tick(20 / SLOW)


SLALOM = [HANNI, MATZE, ELLA, RESI]


def runde_wettkampf():
    """Wettkampf nur mit Darstellern (Kamera schaut zu)."""
    start('wettkampf', SLALOM)


def prep_slalom_start():
    runde_wettkampf()
    slow_at_count(1.2)


def _slalom_start():
    cam = [{'p': [-126.5, 127.8, -278.0], 'look': [-127.0, 125.6, -285.5], 'hold': 1.4, 't': 0},
           {'p': [-126.5, 128.5, -276.0], 'look': [-125.0, 124.5, -262.0], 't': 1.6, 'ease': 1},
           {'p': [-126.5, 129.0, -275.0], 'look': [-124.0, 123.5, -252.0], 't': 1.4, 'ease': 1}]
    ev = []
    for i, n in enumerate(SLALOM):
        ev.append(cmd(1.6 + 0.05 * i, f'wsadmin fahren {n} tor 0'))
        ev.append(cmd(2.4 + 0.05 * i, f'wsadmin fahren {n} tor 0'))
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_slalom_tor():
    """Ella fährt in normaler Geschwindigkeit los; kurz vor Tor 6 geht es in Zeitlupe, die Kamera fährt mit."""
    tick()
    for n in SLALOM:
        if n != ELLA:
            drive(n)
    x = lane_x(ELLA)
    drive(ELLA)
    D.slow_when_near(ELLA, [x, stand_y(gate_row(6) - 22), gate_row(6) - 22], 6, SLOW)


def _slalom_tor():
    x = lane_x(ELLA)
    z = gate_row(6) - 22
    return {'camera': [{'p': [x + 7.0, stand_y(z) + 4.5, z - 4.0], 'look': [x, stand_y(z), z + 6], 't': 0},
                       {'p': [x + 6.0, 115, z + 40], 't': 4.8}],
            'chase': {'who': ELLA, 'back': 6, 'side': 4.5, 'up': 2.6, 'ease': 0.3}, 'fit': False}


def after_slalom():
    tick()
    left = [n for n in SLALOM if team(n).get('state') not in ('finished', 'dnf')]
    if left:
        finish_boats(left)


# Ich-Sicht: eigener Slalom mit Toni

def runde_ich():
    start('slalom', [POV, ELLA, RESI, EWALD])


def prep_slalom_ich():
    if status()['stage'].get('stage') != 'slalom' or POV not in status()['teams']:
        runde_ich()
    rc(f'gamemode adventure {POV}')
    slow_at_count(2.4)


def _slalom_ich():
    ev = [cmd(0.3, f'wsadmin fahren {POV} ziel'), cmd(1.0, f'wsadmin fahren {POV} ziel')]
    for i, n in enumerate([ELLA, RESI, EWALD]):
        ev.append(cmd(0.4 + 0.1 * i, f'wsadmin fahren {n} ziel'))
    return {'gamemode': 'adventure', 'aim': 25, 'clear_chat': True,
            'look': [{'at': 0.0, 'yaw': 0, 'pitch': 22}], 'events': ev}



# ------------------------------------------------------------------ Biathlon

HITS = {HANNI: 5, MATZE: 4, ELLA: 5, RESI: 3}


def bia_lane(name):
    return int(runner(name).get('lane', 1)) - 1


def target(lane, t, hit=True):
    x0 = 79 + 6 * lane
    return [x0 - 2 + t + 0.5, 102.5, 39.0] if hit else [x0 + 0.5, 106.5, 39.0]


def prep_biathlon_start():
    start('biathlon', SLALOM)
    slow_at_count(1.6)


def _biathlon_start():
    cam = [{'p': [110.0, 103.8, 64.5], 'look': [100.0, 102.0, 58.5], 't': 0},
           {'p': [111.5, 103.6, 64.5], 'look': [112.0, 102.0, 58.5], 't': 4.6, 'ease': 1}]
    ev = []
    for i, n in enumerate(SLALOM):
        ev.append(act(1.3 + 0.08 * i, f'{n} lauf {150 - 3 * i} {Y} {57.5 + i * 0.7} sprint'))
    return {'camera': cam, 'events': ev, 'fit': False}


def shoot(name, hits):
    """Darsteller schießt fünfmal (echte Pfeile): erst die Treffer, dann daneben."""
    lane = bia_lane(name)
    say(f'{name} slot 0')
    time.sleep(0.5)
    for t in range(5):
        q = target(lane, t, t < hits)
        say(f'{name} blick {q[0]} {q[1]} {q[2]}')
        time.sleep(0.6)
        say(f'{name} use')
        time.sleep(1.4)
        say(f'{name} unuse')
        time.sleep(0.7)


def lap(names):
    """Eine Runde: der Autopilot des Modus führt die Läufer um die Loipe bis an den Schießstand bzw. ins Ziel."""
    for n in names:
        rc(f'wsadmin laufen {n} runde')


def wait_state(names, states, t=90):
    D.until(lambda: all(runner(n).get('state') in states for n in names), t, 0.5, f'{names} → {states}')


def prep_strafrunde():
    """Runde 1 im Autopiloten, alle schießen echt; Resi (3 von 5) läuft ihre Strafrunden."""
    tick()
    if runner(RESI).get('state') == 'penalty':
        at(f'tp {RESI} 62.5 {Y} 50.5 -90 0')
        time.sleep(1)
        tick(20 / SLOW)
        return
    lap(SLALOM)
    wait_state(SLALOM, ('shooting',), 120)
    import threading
    th = [threading.Thread(target=shoot, args=(n, HITS[n])) for n in SLALOM]
    [x.start() for x in th]
    [x.join() for x in th]
    wait_state(SLALOM, ('penalty', 'running'), 30)
    for n in (HANNI, ELLA, MATZE):
        if runner(n).get('state') == 'penalty':
            rc(f'wsadmin laufen {n} strafrunde')
    at(f'tp {RESI} 62.5 {Y} 50.5 -90 0')
    time.sleep(1)
    tick(20 / SLOW)


def _strafrunde():
    pts = ' '.join(f'{x},{Y},{z},{t}' for x, z, t in [(62.5, 50.5, 0), (68.5, 50.5, 0.8), (68.5, 44.5, 0.8),
                                                       (68.5, 38.5, 0.8), (64.5, 38.5, 0.6), (60.5, 38.5, 0.6),
                                                       (60.5, 44.5, 0.8), (60.5, 50.5, 0.8), (64.5, 50.5, 0.6)])
    cam = [{'p': [64.5, 103.2, 45.5], 't': 0}, {'p': [64.5, 103.6, 44.0], 't': 4.6, 'ease': 1}]
    return {'camera': cam, 'follow': [RESI], 'events': [act(0.1, f'{RESI} bahn {pts}')], 'fit': False}


def finish_biathlon():
    """Rest im Autopiloten: Strafrunden, Runde 2, Schießen, Runde 3 ins Ziel (Pfeile echt)."""
    tick()
    for _ in range(2):
        for n in SLALOM:
            while runner(n).get('state') == 'penalty':
                pen = int(runner(n).get('pen', 0))
                rc(f'wsadmin laufen {n} strafrunde')
                D.until(lambda: int(runner(n).get('pen', 0)) < pen or runner(n).get('state') != 'penalty', 20, 0.5, 'Strafrunde')
        lap([n for n in SLALOM if runner(n).get('state') == 'running'])
        time.sleep(2)
        D.until(lambda: all(runner(n).get('state') in ('shooting', 'finished') for n in SLALOM), 120, 0.5, 'Runde')
        shooters = [n for n in SLALOM if runner(n).get('state') == 'shooting']
        import threading
        th = [threading.Thread(target=shoot, args=(n, 5 if n != MATZE else 4)) for n in shooters]
        [x.start() for x in th]
        [x.join() for x in th]
        time.sleep(1)
    D.until(lambda: status()['stage'].get('stage') == 'bob' or all(runner(n).get('state') in ('finished',) for n in SLALOM),
            180, 1, 'Biathlon zu Ende')


# Ich-Sicht am Schießstand: eigener Biathlon mit Toni

def runde_schiessen():
    """Biathlon mit Toni: Runde 1 im Autopiloten bis an den Schießstand (vor der Einstellung 08, damit sie die
    richtige Bahn kennt)."""
    start('biathlon', [POV, ELLA, RESI, EWALD])
    D.until(lambda: status()['stage'].get('phase') == 'RUN', 60, 0.5, 'Biathlon läuft')
    lap([POV, ELLA, RESI, EWALD])
    wait_state([POV], ('shooting',), 120)


def prep_schiessen():
    tick()
    if runner(POV).get('state') != 'shooting' or runner(POV).get('shots') != '0':
        raise SystemExit('Erst: python3 trailers/wintersport.py runde-schiessen')
    rc(f'gamemode adventure {POV}')
    time.sleep(2)


def _schiessen():
    lane = bia_lane(POV)
    looks, clicks = [], []
    for t in range(3):
        a = 0.5 + 1.45 * t
        looks.append({'at': a - 0.35, 'target': target(lane, t)})
        clicks.append({'at': a, 'button': 3, 'dur': 1.1})
    return {'gamemode': 'adventure', 'aim': 45, 'clear_chat': True, 'input': [{'at': 0.05, 'select': 'bow'}],
            'look': looks, 'clicks': clicks}


# ------------------------------------------------------------------ Bob


BOB = [POV, HANNI, MATZE, ELLA, RESI]  # Hanni und Matze sind eine Party: Zweierbob
BOB_X = [74, 100, 126, 152]


def prep_bob():
    """Bob in der Ich-Sicht: Toni fährt mit (der Autopilot des Modus schiebt den Bob den Kanal entlang)."""
    start('bob', BOB)
    rc(f'gamemode adventure {POV}')
    slow_at_count(2.4)


def _bob():
    ev = [cmd(0.3, f'wsadmin fahren {POV} ziel'), cmd(1.0, f'wsadmin fahren {POV} ziel'),
          cmd(0.4, f'wsadmin fahren {ELLA} ziel'), cmd(0.45, f'wsadmin fahren {RESI} ziel'),
          cmd(0.5, f'wsadmin fahren {HANNI} weiter 170'), cmd(1.1, f'wsadmin fahren {HANNI} weiter 170')]
    return {'gamemode': 'adventure', 'aim': 25, 'clear_chat': True,
            'look': [{'at': 0.0, 'yaw': 0, 'pitch': 20}], 'events': ev}


def terrace_mid(i):
    return -40 - (20 * i + 13) + 0.5


def prep_zweier():
    """Hanni und Matze stehen hinter der Kehre von Terrasse 6 – jetzt fahren sie durch die Kehre von Terrasse 5."""
    tick()
    if team(HANNI).get('state') != 'run' or float(team(HANNI).get('z', 0)) > terrace_mid(5) - 12:
        start('bob', [HANNI, MATZE, ELLA])
        wait_run('Bob startet')
        drive(HANNI, 'weiter 170')
        drive(ELLA)
        time.sleep(12)
    else:
        D.until(lambda: team(POV).get('state') in ('finished', 'dnf', None), 60, 1, 'Toni im Ziel')
    tick(20 / SLOW)
    drive(HANNI)


def _zweier():
    L = BOB_X[int(team(HANNI).get('lane', 1)) - 1] + 0.5
    z = terrace_mid(5)
    y = stand_y(z)
    return {'camera': [{'p': [L + 7.0, y + 8.0, z + 8.0], 'look': [L + 7.0, y, z - 1.0], 't': 0},
                       {'p': [L + 7.0, y + 7.5, z + 7.0], 'look': [L + 5.0, y, z + 2.0], 't': 3.6}], 'fit': False}


def prep_ehrung():
    """Ein schneller Riesenslalom der vier Darsteller (der Autopilot fährt sie ins Ziel) – dann die Siegerehrung."""
    start('slalom', SLALOM)
    wait_run('Slalom startet')
    for n in (ELLA, HANNI, RESI, MATZE):  # nacheinander los – sonst wären alle gleich schnell (alle Gold)
        drive(n)
        time.sleep(0.6)
    D.until(lambda: status()['comp'].get('phase') == 'CEREMONY', 90, 0.5, 'Siegerehrung')
    sky()
    time.sleep(4)


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'prep': sky, 'spec': {
        'camera': [{'p': [0.5, 140.0, 90.0], 'look': [0.5, 112.0, -40.0], 't': 0},
                   {'p': [0.5, 128.0, 60.0], 'look': [0.5, 110.0, -60.0], 't': 4.0},
                   {'p': [6.5, 112.0, 30.0], 'look': [0.5, 108.0, 0.0], 't': 4.0, 'ease': 1}]}},
    {'id': '02-dorf', 'bars': 3, 'card': 'lt-dorf.png', 'prep': prep_dorf, 'spec': _dorf},
    {'id': '03-lift', 'bars': 3, 'card': 'lt-lift.png', 'prep': prep_lift, 'spec': _lift, 'preload': 3},
    {'id': '04-slalom', 'bars': 2, 'card': 'lt-slalom.png', 'prep': prep_slalom_start, 'spec': _slalom_start},
    {'id': '05-tore', 'bars': 3, 'card': 'lt-tore.png', 'prep': prep_slalom_tor, 'spec': _slalom_tor,
     'after': after_slalom},
    {'id': '06-ich', 'bars': 3, 'card': 'lt-ich.png', 'kind': 'ich', 'prep': prep_slalom_ich, 'spec': _slalom_ich},
    {'id': '07-biathlon', 'bars': 2, 'card': 'lt-biathlon.png', 'prep': prep_biathlon_start, 'spec': _biathlon_start},
    {'id': '08-schiessen', 'bars': 3, 'card': 'lt-schiessen.png', 'kind': 'ich', 'prep': prep_schiessen,
     'spec': _schiessen},
    {'id': '09-strafrunde', 'bars': 2, 'card': 'lt-straf.png', 'prep': prep_strafrunde, 'spec': _strafrunde},
    {'id': '10-bob', 'bars': 3, 'card': 'lt-bob.png', 'kind': 'ich', 'prep': prep_bob, 'spec': _bob},
    {'id': '11-zweier', 'bars': 2, 'card': 'lt-zweier.png', 'prep': prep_zweier, 'spec': _zweier},
    {'id': '12-ehrung', 'bars': 3, 'card': 'lt-ehrung.png', 'prep': prep_ehrung, 'spec': {
        'camera': [{'p': [0.5, 104.0, -0.5], 'look': [0.5, 104.5, -9.0], 't': 0},
                   {'p': [0.5, 103.6, -2.5], 'look': [0.5, 105.0, -9.0], 't': 6.4, 'ease': 1}]}},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'prep': sky, 'spec': {
        'camera': [{'p': [7.0, 105.0, 21.0], 'look': [0.5, 109.0, 6.0], 't': 0},
                   {'p': [12.0, 136.0, 72.0], 'look': [0.0, 112.0, -60.0], 't': 6.5, 'ease': 1}]}},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0].startswith('runde-'):
        {'runde-ich': runde_ich, 'runde-wettkampf': runde_wettkampf, 'runde-schiessen': runde_schiessen}[args[0]]()
        sys.exit(0)
    D.main(sys.modules[__name__], args)
