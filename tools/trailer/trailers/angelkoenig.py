"""Trailer: Angelkönig – gemütlich angeln im Alpen-Tal: Dorf am See, Anbeißen in der Ich-Sicht, Legende am Wasserfall,
Fischbuch, Fischhändler Xaver, Moorweiher bei Nacht, Eisloch, Angel-Turnier mit Leiste und der neue Angelkönig.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh angelkoenig 28830 …: Paper 26.1.2, Morni Angelkönig
0.1.1 aus dem GitHub-Release, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards). Die config.yml des
Test-Servers lässt Tageszeit und Wetter stehen, der Biss kommt nach 1 s Wartezeit plus 1–3 s Anlocken und Turniere starten nur per Befehl.

Alles Spielgeschehen ist echt: Darsteller (actors/regie.cjs) werfen ihre Angel aus und holen sie ein, der
Aufnahme-Client (Ewald77) angelt in der Ich-Sicht mit echten Klicks; welche Art beim nächsten Biss hängt, legt
`/angeladmin naechster` fest (für die Legende und den schweren Turnierfisch), sonst würfelt der Modus.

  python3 trailers/angelkoenig.py <einstellung …>   # drehen
  python3 make.py angelkoenig music|cards|sheet|cut|fertig
"""
import os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'angelkoenig'
STYLE = 'angelkoenig'
FILE = 'MoinMorni-Trailer-Angelkoenig.mp4'
SLOW = 15
DIM = 'minecraft:angelkoenig'
POV = os.environ.get('MM_CAMERA', 'Ewald77')
HANNI, MATZE, ELLA, RESI = 'HanniHof', 'Matzeee24', 'EllaSommer7', 'ResiBlume19'
ACTORS = [HANNI, MATZE, ELLA, RESI]
Y = 64  # man steht im Dorf auf y 64 (Wasser 62)

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Angelkönig',
     'text': 'Gemütlich angeln im Alpen-Tal – jederzeit, ohne Runden'},
    {'file': 'lt-dorf.png', 'kind': 'lower', 'title': 'Das Dorf am See', 'text': 'Steg, Ruderboote, Lagerfeuer – und vier Fangplätze'},
    {'file': 'lt-biss.png', 'kind': 'lower', 'title': 'Biss!', 'text': 'Auswerfen, warten, einholen – jeder Fang mit Länge und Gewicht'},
    {'file': 'lt-steg.png', 'kind': 'lower', 'title': '20 Fische der Alpen', 'text': 'Was beißt, hängt von Platz, Tageszeit und Wetter ab'},
    {'file': 'lt-legende.png', 'kind': 'lower', 'title': 'Legenden', 'text': 'Goldforelle, Seekönig, Moorkönig, Kristallsaibling'},
    {'file': 'lt-buch.png', 'kind': 'lower', 'title': 'Das Fischbuch', 'text': 'Jede Art einmal fangen – mit Rekorden'},
    {'file': 'lt-haendler.png', 'kind': 'lower', 'title': 'Fischhändler Xaver', 'text': 'Fänge verkaufen, bessere Angeln, Köder, Kleidung'},
    {'file': 'lt-moor.png', 'kind': 'lower', 'title': 'Moorweiher bei Nacht', 'text': 'Irrlichter – und der Aal beißt nur jetzt'},
    {'file': 'lt-eis.png', 'kind': 'lower', 'title': 'Das Eisloch', 'text': 'Hoch oben am zugefrorenen Karsee'},
    {'file': 'lt-turnier.png', 'kind': 'lower', 'title': 'Angel-Turnier', 'text': 'Alle 15 Minuten – der schwerste Fisch gewinnt'},
    {'file': 'lt-koenig.png', 'kind': 'lower', 'title': 'Der Angelkönig', 'text': 'Der Sieger trägt die Königskrone'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Angelkönig“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def day(when='tag', weather='klar'):
    tick()
    rc(f'angeladmin zeit {when}')
    rc(f'angeladmin wetter {weather}')


def tick(rate=20):
    rc(f'tick rate {rate}')


def fish_line(t, name, target, wait=None):
    """Darsteller wirft aus (Blick aufs Wasser, Rechtsklick); eingeholt wird beim Biss (`reeler`)."""
    x, y, z = target
    return [act(t, f'{name} slot 0'), act(t + 0.05, f'{name} blick {x} {y} {z}'), act(t + 0.4, f'{name} use')]


_reel = {'on': False}


def reeler(names):
    """Holt ein, sobald es beißt: fragt `/angeladmin status` (biss = ms seit dem letzten Biss) und klickt dann rechts –
    beim Aufnahme-Client mit der echten Maus (xdotool), bei Darstellern über regie.cjs. Wie ein Spieler, der auf den
    Schwimmer schaut: der Biss kommt nach Wartezeit + Anlocken zufällig, feste Zeiten im Drehbuch verpassen ihn."""
    import subprocess, threading
    _reel['on'] = True
    done = {}

    def run():
        while _reel['on']:
            try:
                st = rc('angeladmin status')
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
                continue
            for line in st.split('\n'):
                n = line.split(' ', 1)[0]
                m = re.search(r'biss=(-?\d+)', line)
                if n not in names or not m:
                    continue
                b = int(m.group(1))
                if 0 <= b < 2500 and time.time() - done.get(n, 0) > 4:
                    done[n] = time.time()
                    if n == POV:
                        subprocess.run(['xdotool', 'click', '3'], env=dict(os.environ, DISPLAY=os.environ['MM_DISPLAY']))
                    else:
                        say(f'{n} use')
            time.sleep(0.2)
    threading.Thread(target=run, daemon=True).start()


def stop_reel():
    _reel['on'] = False


DECK = {HANNI: (-3.5, -8.5, -3.5, -1.0), MATZE: (3.5, -8.5, 3.5, -1.0), ELLA: (-1.5, -7.5, -2.0, 0.5),
        RESI: (2.0, -7.5, 2.5, 0.5)}  # Platz auf der Plattform (x, z) und wohin ausgeworfen wird (x, z)


def to_deck(names, pov=None):
    tick()
    for n in names:
        x, z, _, _ = DECK[n]
        at(f'tp {n} {x} {Y} {z} 0 20')
        say(f'{n} slot 0')
    if pov:
        at(f'tp {POV} {pov[0]} {Y} {pov[1]} 0 20')
    time.sleep(2)


# ------------------------------------------------------------------ Einstellungen


def prep_dorf():
    day()
    for n, (x, z) in {HANNI: (-0.5, -36.0), MATZE: (1.0, -33.0), ELLA: (-0.5, -28.0), RESI: (0.5, -24.0)}.items():
        at(f'tp {n} {x} {Y} {z} 0 0')
    time.sleep(2)
    tick(20 / SLOW)


def _dorf():
    cam = [{'p': [-4.0, 68.5, -41.0], 'look': [0.5, 64.5, -22.0], 't': 0},
           {'p': [-3.0, 67.5, -35.0], 'look': [0.5, 64.0, -12.0], 't': 4.8, 'ease': 1}]
    ev = [act(0.1, f'{RESI} geh 2.5 {Y} -8.5 blick=0,62,0'), act(0.2, f'{ELLA} geh -1.5 {Y} -9.0 blick=-2,62,0'),
          act(0.4, f'{MATZE} geh 0.5 {Y} -15.0 blick=kamera'), act(0.6, f'{HANNI} geh -1.0 {Y} -22.0')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_biss():
    """Toni auf der Plattform, Angel in der Hand; beim nächsten Biss hängt eine Seeforelle."""
    day()
    to_deck([HANNI, MATZE], pov=(0.5, -7.5))
    for n in (ELLA, RESI):
        at(f'tp {n} {-1.0 if n == ELLA else 2.0} {Y} -16.0 0 0')
    rc(f'gamemode adventure {POV}')
    rc(f'angeladmin naechster {POV} seeforelle 64')
    reeler([POV, HANNI])


def _biss():
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True, 'start': {'p': [0.5, Y, -7.5], 'yaw': 0, 'pitch': 25},
            'input': [{'at': 0.05, 'select': 'rod'}],
            'look': [{'at': 0.0, 'target': [0.5, 62.6, -0.5]}],
            'clicks': [{'at': 0.3, 'button': 3}],
            'events': fish_line(0.6, HANNI, (-3.5, 62.6, -1.0), 3.6)}


def prep_steg():
    day()
    to_deck([HANNI, MATZE, ELLA, RESI])
    tick(20 / SLOW)
    reeler(ACTORS)


def _steg():
    cam = [{'p': [8.0, 66.5, 2.5], 'look': [0.0, 64.5, -7.0], 't': 0},
           {'p': [6.5, 66.0, 1.0], 'look': [-0.5, 64.5, -8.0], 't': 4.6, 'ease': 1}]
    ev = []
    for i, n in enumerate([HANNI, MATZE, ELLA, RESI]):
        _, _, tx, tz = DECK[n]
        ev += fish_line(0.2 + 0.3 * i, n, (tx, 62.6, tz), 2.8)
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_legende():
    """Am Gebirgsbach unter dem Wasserfall: beim nächsten Biss hängt die Goldforelle."""
    day()
    rc(f'gamemode adventure {POV}')
    rc(f'angeladmin naechster {POV} goldforelle')
    reeler([POV])


def _legende():
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True, 'start': {'p': [-99.5, Y, -7.5], 'yaw': -10, 'pitch': 15},
            'input': [{'at': 0.05, 'select': 'rod'}],
            'look': [{'at': 0.0, 'target': [-99.5, 62.6, -2.0]}, {'at': 4.2, 'target': [-104.0, 70.0, 2.0]}],
            'clicks': [{'at': 0.3, 'button': 3}]}


def prep_buch():
    tick()
    for sp in ('rotauge', 'barsch', 'renke', 'zander', 'bachforelle', 'aesche', 'hecht', 'schleie', 'rutte'):
        rc(f'angeladmin fischbuch {POV} {sp}')
    rc(f'gamemode adventure {POV}')


def _buch():
    gui, left, top = 3, (1600 // 3 - 176) // 2, (900 // 3 - 222) // 2
    sx, sy = (left + 8 + 3 * 18 + 8) * gui, (top + 18 + 1 * 18 + 8) * gui
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True, 'start': {'p': [0.5, Y, -40.5], 'yaw': 0, 'pitch': 5},
            'input': [{'at': 0.05, 'select': 'book'}, {'at': 0.8, 'mouse': [800, 420], 'dur': 0.2},
                      {'at': 1.1, 'mouse': [sx, sy], 'dur': 0.8}, {'at': 2.4, 'mouse': [sx + 54 * 2, sy], 'dur': 0.6}],
            'clicks': [{'at': 0.4, 'button': 3, 'opens': True}]}


def prep_haendler():
    tick()
    rc(f'gamemode adventure {POV}')
    for sp, cm in (('zander', 71), ('hecht', 88), ('renke', 42)):
        rc(f'angeladmin fisch {POV} {sp} {cm}')


def _haendler():
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True, 'start': {'p': [11.5, Y, -38.5], 'yaw': 0, 'pitch': 8},
            'look': [{'at': 0.0, 'target': [11.5, 65.4, -33.5]}],
            'keys': [{'at': 0.1, 'key': 'w', 'dur': 0.4}],
            'clicks': [{'at': 0.9, 'button': 3, 'opens': True}, {'at': 2.3, 'button': 1}, {'at': 3.6, 'button': 1}],
            'input': [{'at': 1.3, 'mouse': [800, 420], 'dur': 0.1}, {'at': 1.4, 'mouse': [638, 302], 'dur': 0.6},
                      {'at': 2.6, 'mouse': [1015, 195], 'dur': 0.7}]}


def prep_moor():
    day('nacht')
    at(f'tp {RESI} 85.5 {Y + 0.5} 6.5 -90 15')
    say(f'{RESI} slot 0')
    time.sleep(2)
    tick(20 / SLOW)
    reeler([RESI])


def _moor():
    cam = [{'p': [94.0, 66.8, 10.5], 'look': [86.0, 64.8, 6.5], 't': 0},
           {'p': [93.0, 66.3, 9.0], 'look': [86.0, 65.0, 6.5], 't': 4.6, 'ease': 1}]
    return {'camera': cam, 'events': fish_line(0.3, RESI, (90.5, 62.6, 6.5), 3.0), 'fit': False}


def prep_eis():
    day()
    at(f'tp {MATZE} 69.5 83 93.5 0 30')
    say(f'{MATZE} slot 0')
    time.sleep(2)
    tick(20 / SLOW)
    reeler([MATZE])


def _eis():
    cam = [{'p': [72.5, 85.6, 101.0], 'look': [69.5, 84.3, 93.5], 't': 0},
           {'p': [70.5, 85.4, 100.5], 'look': [69.5, 84.3, 94.5], 't': 4.6, 'ease': 1}]
    return {'camera': cam, 'events': fish_line(0.3, MATZE, (69.5, 82.9, 96.0), 3.0), 'fit': False}


TURNIER = {HANNI: (-3.5, -7.5, -4.0, -1.0), MATZE: (3.5, -7.5, 4.0, -1.0), ELLA: (-4.5, -10.0, -7.5, -6.0),
           RESI: (4.5, -10.0, 7.5, -6.0)}  # Toni steht vorn in der Mitte (0.5, -7.5)


def prep_turnier():
    """Turnier auf dem Bergsee: alle auf der Plattform, Toni vorn in der Mitte; Hanni zieht den schweren Waller."""
    day()
    rc('angeladmin turnier stopp')
    for n, (x, z, _, _) in TURNIER.items():
        at(f'tp {n} {x} {Y} {z} 0 20')
        say(f'{n} slot 0')
    at(f'tp {POV} 0.5 {Y} -7.5 0 20')
    rc(f'gamemode adventure {POV}')
    time.sleep(2)
    rc('angeladmin turnier start')
    rc(f'angeladmin naechster {HANNI} waller 170')
    time.sleep(3)
    reeler(ACTORS + [POV])


def _turnier():
    ev = []
    for i, (n, (_, _, tx, tz)) in enumerate(TURNIER.items()):
        ev += fish_line(0.3 + 0.35 * i, n, (tx, 62.6, tz))
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True, 'start': {'p': [0.5, Y, -7.5], 'yaw': 0, 'pitch': 18},
            'input': [{'at': 0.05, 'select': 'rod'}],
            'look': [{'at': 0.0, 'target': [0.5, 62.6, -0.5]}, {'at': 3.6, 'target': [-3.0, 63.5, -3.0]}],
            'clicks': [{'at': 0.5, 'button': 3}], 'events': ev}


def prep_koenig():
    stop_reel()
    tick()
    time.sleep(2)


def _koenig():
    """Ich-Sicht: das Turnier endet – Titel „HanniHof gewinnt“, Ergebnis im Chat, Hanni bekommt die Königskrone."""
    return {'gamemode': 'adventure', 'aim': 25, 'clear_chat': True,
            'look': [{'at': 0.0, 'target': HANNI, 'height': 1.5}],
            'events': [cmd(0.4, 'angeladmin turnier ende'), act(1.6, f'{HANNI} blick {POV}'),
                       act(2.6, f'{HANNI} springe 1')]}


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'prep': day, 'spec': {
        'camera': [{'p': [0.5, 110.0, 110.0], 'look': [0.5, 70.0, -20.0], 't': 0},
                   {'p': [0.5, 92.0, 60.0], 'look': [0.5, 66.0, -30.0], 't': 4.0},
                   {'p': [2.5, 72.0, 10.0], 'look': [0.5, 66.0, -40.0], 't': 4.2, 'ease': 1}]}},
    {'id': '02-dorf', 'bars': 2, 'card': 'lt-dorf.png', 'prep': prep_dorf, 'spec': _dorf},
    {'id': '03-biss', 'bars': 3, 'card': 'lt-biss.png', 'kind': 'ich', 'prep': prep_biss, 'spec': _biss, 'after': stop_reel},
    {'id': '04-steg', 'bars': 2, 'card': 'lt-steg.png', 'prep': prep_steg, 'spec': _steg, 'after': stop_reel},
    {'id': '05-legende', 'bars': 3, 'card': 'lt-legende.png', 'kind': 'ich', 'prep': prep_legende, 'spec': _legende, 'after': stop_reel},
    {'id': '06-buch', 'bars': 2, 'card': 'lt-buch.png', 'kind': 'ich', 'prep': prep_buch, 'spec': _buch},
    {'id': '07-haendler', 'bars': 2, 'card': 'lt-haendler.png', 'kind': 'ich', 'prep': prep_haendler, 'spec': _haendler},
    {'id': '08-moor', 'bars': 2, 'card': 'lt-moor.png', 'prep': prep_moor, 'spec': _moor, 'after': stop_reel},
    {'id': '09-eis', 'bars': 2, 'card': 'lt-eis.png', 'prep': prep_eis, 'spec': _eis, 'after': stop_reel},
    {'id': '10-turnier', 'bars': 3, 'card': 'lt-turnier.png', 'kind': 'ich', 'prep': prep_turnier, 'spec': _turnier},
    {'id': '11-koenig', 'bars': 2, 'card': 'lt-koenig.png', 'kind': 'ich', 'prep': prep_koenig, 'spec': _koenig},
    {'id': '12-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'prep': day, 'spec': {
        'camera': [{'p': [-6.0, 66.5, -15.0], 'look': [0.5, 64.5, -5.0], 't': 0},
                   {'p': [6.0, 90.0, -60.0], 'look': [0.5, 70.0, 40.0], 't': 7.0, 'ease': 1}]}},
]


if __name__ == '__main__':
    D.main(sys.modules[__name__], sys.argv[1:])
