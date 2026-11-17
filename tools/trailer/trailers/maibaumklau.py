"""Trailer: Maibaumklau – zwei Dörfer, zwei Maibäume: Wirtsgarten, Dörfer am Bach, Umlegen, Heimtragen mit
leuchtendem Baum, Abfangen durch Berühren, Heuwagen über den Bach, Umlegen in der Ich-Sicht, Almdörfer mit
Hängebrücke, Heimbringen und die Auslöse-Feier mit Brotzeit und Feuerwerk.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh maibaumklau 28900 …: Paper 26.1.2, Morni Maibaumklau
0.1.0, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards, Regie-Plugin nur im Test-Server –
`regie als|halle|raus <spieler>`, Quelle im Cache ~/mm-cache/trailer/regie-modi/). In der config.yml des Test-Servers
startet keine Runde von selbst (mindestens-spieler 16, Countdown 300 s), Umlegen 5 s, Zurück 60 s, Nachspiel 60 s.
Runden startet das Drehbuch mit `/maibaumadmin start <karte>` und `vorspulen los`.

Alles Spielgeschehen ist echt: Darsteller (actors/regie.cjs, echte Physik, nehmen jetzt den Schwung vom Server an –
Heuwagen) legen den Baum um, tragen ihn (der Modus macht sie langsam und lässt sie leuchten), fangen Träger durch
Berühren ab und bringen ihn heim; der Aufnahme-Client (Seppl19) packt in der Ich-Sicht selbst mit an.

Drei Runden: Bach ohne Kamera (02–06), Alm mit Kamera (07), Alm ohne Kamera (08–12).
  python3 trailers/maibaumklau.py runde-bach|runde-alm-ich|runde-alm   # Runde vorbereiten
  python3 trailers/maibaumklau.py <einstellung …>                       # drehen
  python3 make.py maibaumklau music|cards|sheet|cut|fertig
"""
import math, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'maibaumklau'
STYLE = 'maibaumklau'
FILE = 'MoinMorni-Trailer-Maibaumklau.mp4'
SLOW = 15
DIM = 'minecraft:maibaumklau'
POV = os.environ.get('MM_CAMERA', 'Seppl19')
ACTORS = ['ResiBlume19', 'HanniHof', 'Ewald77', 'Matzeee24', 'Lena_Herbst05', 'Yuki_Tor10', 'jay_beatz2']
BACH, ALM = 1000, 2000          # Mitte der Karten (x), Boden y 100 – man steht auf 101
POLE = {'blau': -44, 'rot': 44}  # Maibaum relativ zur Mitte (x), z = 0
Y = 101

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Maibaumklau',
     'text': 'Zwei Dörfer, zwei Maibäume – 2 bis 16 Leute'},
    {'file': 'lt-doerfer.png', 'kind': 'lower', 'title': 'Zwei Dörfer', 'text': 'Blau gegen Rot – jedes mit seinem Maibaum'},
    {'file': 'lt-umlegen.png', 'kind': 'lower', 'title': 'Umlegen', 'text': 'Am fremden Baum stehen – zu dritt dreimal so schnell'},
    {'file': 'lt-tragen.png', 'kind': 'lower', 'title': 'Heimtragen', 'text': 'Langsam und leuchtend – wer mitläuft, trägt mit'},
    {'file': 'lt-abfangen.png', 'kind': 'lower', 'title': 'Abfangen', 'text': 'Einmal berühren genügt – ganz ohne Schaden'},
    {'file': 'lt-heuwagen.png', 'kind': 'lower', 'title': 'Heuwagen', 'text': 'Mit Schwung über den Bach'},
    {'file': 'lt-anpacken.png', 'kind': 'lower', 'title': 'Selbst anpacken', 'text': 'Der Balken zeigt, wie weit der Baum schon ist'},
    {'file': 'lt-alm.png', 'kind': 'lower', 'title': 'Almdörfer', 'text': 'Hängebrücke, Baumstamm und Felsbogen über der Schlucht'},
    {'file': 'lt-bruecke.png', 'kind': 'lower', 'title': 'Über die Schlucht', 'text': 'Wer fällt, ist wieder daheim – der Baum auch'},
    {'file': 'lt-heim.png', 'kind': 'lower', 'title': 'Heimgebracht!', 'text': 'Der fremde Baum auf dem eigenen Dorfplatz'},
    {'file': 'lt-feier.png', 'kind': 'lower', 'title': 'Auslösen', 'text': 'Wie beim echten Brauch: Brotzeit, Musik, Feuerwerk'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Maibaumklau“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def tp(name, x, z, yaw=0, y=Y):
    at(f'tp {name} {x} {y} {z} {yaw} 0')


# ------------------------------------------------------------------ Zustand der Runde

def status(karte=None):
    """/maibaumadmin status → {phase, trees: [{state, leader, carriers, base, at}], players: {Name: (seite, zustand)}}."""
    for line in rc('maibaumadmin status').split('\n'):
        if not line.startswith('karte=') or (karte and not line.startswith(f'karte={karte} ')):
            continue
        out = {'trees': [{}, {}], 'players': {}}
        for part in line.split(' '):
            k, _, v = part.partition('=')
            if k.startswith('baum') and k[4:].isdigit():
                f = v.split(':')
                out['trees'][int(k[4:])].update(state=f[0], leader=f[3], carriers=int(f[5]))
            elif k[:4] in ('fuss', 'lage') and k[4:].isdigit():
                out['trees'][int(k[4:])][k[:4]] = [float(x) for x in v.split(':')]
            elif v.count(':') >= 8:  # Spieler (Namen dürfen klein anfangen)
                f = v.split(':')
                out['players'][k] = (f[0], f[1] if len(f) > 1 else f[0])
            else:
                out[k] = v
        return out
    return {}


def team(side, karte=None):
    return [n for n, (s, _) in status(karte)['players'].items() if s == side and n != POV]


def stop_round(karte):
    rc('tick rate 20')
    if status(karte).get('phase'):
        rc(f'maibaumadmin stopp {karte}')
        time.sleep(6)


def start_round(karte, pov_in):
    for k in ('bachdoerfer', 'almdoerfer'):
        stop_round(k)
    at('time set 6000')
    at('weather clear')
    for n in ACTORS:
        rc(f'regie halle {n}')
        say(f'{n} physik an', f'{n} stopp')
    if pov_in:
        rc(f'gamemode adventure {POV}')
        rc(f'regie halle {POV}')
    else:
        rc(f'regie raus {POV}')
        rc(f'gamemode spectator {POV}')
    time.sleep(1)
    rc(f'maibaumadmin start {karte}')
    time.sleep(1)
    rc(f'maibaumadmin vorspulen los {karte}')
    D.until(lambda: status(karte).get('phase') == 'PLAY', 15, 0.5, 'Runde läuft')
    time.sleep(2)


def runde_bach():
    start_round('bachdoerfer', pov_in=False)


def runde_alm_ich():
    start_round('almdoerfer', pov_in=True)


def runde_alm():
    start_round('almdoerfer', pov_in=False)


def fell(karte, cx, side_pole, lifters, timeout=20):
    """Ohne Kamera (normale Geschwindigkeit): `lifters` an den fremden Baum stellen, bis er getragen wird."""
    px = cx + POLE[side_pole]
    spots = [(1.5, 1.5), (1.5, -1.5), (-1.5, 1.5)]
    for n, (dx, dz) in zip(lifters, spots):
        tp(n, px + 0.5 + dx, 0.5 + dz)
    idx = 0 if side_pole == 'blau' else 1
    D.until(lambda: status(karte)['trees'][idx].get('state') == 'CARRIED', timeout, 0.4, 'Baum umgelegt')


# ------------------------------------------------------------------ Einstellungen

def _intro():
    """Wirtsgarten „Zum Maibaum“: Leute kommen zusammen, stimmen ab, grüßen."""
    spots = [(-3.5, 6.5), (3.5, 7.0), (-1.5, 9.5), (2.0, 10.5), (-5.0, 9.0), (5.5, 9.5), (0.5, 12.5)]
    for n, (x, z) in zip(ACTORS, spots):
        tp(n, x, z + 4, 180)
    cam = [{'p': [0.5, 122.0, 44.0], 'look': [0.5, 104.0, 4.0], 't': 0},
           {'p': [0.5, 112.0, 30.0], 'look': [0.5, 104.0, 2.0], 't': 4.0},
           {'p': [4.0, 104.5, 19.0], 'look': [0.0, 104.0, 0.0], 't': 4.0, 'ease': 1}]
    ev = [act(0.2 + 0.4 * i, f'{n} geh {x} {Y} {z} blick=0,104,0') for i, (n, (x, z)) in enumerate(zip(ACTORS, spots))]
    ev += [act(5.0, 'ResiBlume19 gruss 2'), act(5.6, 'Matzeee24 springe 1'), act(6.2, 'HanniHof blick kamera')]
    return {'camera': cam, 'events': ev}


def prep_intro():
    for k in ('bachdoerfer', 'almdoerfer'):
        stop_round(k)
    at('time set 6000')
    for n in ACTORS:
        rc(f'regie halle {n}')
        say(f'{n} physik an')
    rc(f'regie raus {POV}')


def _doerfer():
    """Über den Bach ins rote Dorf: Blau rennt über die Mittelbrücke, Rot steht am Maibaum."""
    blue, red = team('blau', 'bachdoerfer'), team('rot', 'bachdoerfer')
    for i, n in enumerate(blue):
        tp(n, BACH - 10 - 1.5 * i, -1.0 + 1.0 * i, -90)
    for i, n in enumerate(red):
        tp(n, BACH + 47 + 2 * i, 6.5 + 2 * i, 90)
    cam = [{'p': [BACH - 18.0, 106.0, 9.0], 'look': [BACH - 6.0, 102.0, 0.0], 't': 0},
           {'p': [BACH + 6.0, 106.5, 9.0], 'look': [BACH + 24.0, 103.0, 0.0], 't': 2.6},
           {'p': [BACH + 22.0, 107.0, 9.0], 'look': [BACH + 44.0, 106.0, 0.0], 't': 2.2, 'ease': 1}]
    ev = [act(0.1 + 0.25 * i, f'{n} lauf {BACH + 32 + i} {Y} {-1.5 + 1.5 * i}') for i, n in enumerate(blue)]
    ev += [act(0.3, f'{red[0]} geh {BACH + 46.5} {Y} 3.5 blick={BACH + 30},102,0')] if red else []
    return {'camera': cam, 'events': ev}


def _umlegen():
    """Drei aus Blau legen den roten Baum um – er kippt und schwebt über ihren Köpfen."""
    blue, red = team('blau', 'bachdoerfer'), team('rot', 'bachdoerfer')
    px = BACH + POLE['rot']
    for i, n in enumerate(red):
        tp(n, px + 9 + i, 12 + i, 180)
    for i, n in enumerate(blue[:3]):
        tp(n, px - 9, -2.5 + 2.5 * i, -90)
    spots = [(1.5, 1.5), (1.5, -1.5), (-1.0, 2.0)]
    cam = [{'p': [px - 4.0, 102.0, -3.5], 'look': [px + 0.5, 108.0, 0.5], 't': 0},
           {'p': [px - 5.5, 102.6, -1.5], 'look': [px + 0.5, 104.0, 0.5], 't': 6.4, 'ease': 1}]
    ev = [act(0.2 + 0.2 * i, f'{n} lauf {px + 0.5 + dx} {Y} {0.5 + dz} blick={px + 0.5},106,0.5')
          for i, (n, (dx, dz)) in enumerate(zip(blue[:3], spots))]
    ev += [act(4.6, f'{blue[0]} geh {px - 10} {Y} 0.5')]
    return {'camera': cam, 'events': ev}


def _carriers(karte, cx, side_pole):
    s = status(karte)
    idx = 0 if side_pole == 'blau' else 1
    leader = s['trees'][idx].get('leader')
    if not leader or leader == '-':
        raise SystemExit(f'niemand trägt den Baum ({s["trees"][idx]})')
    side = s['players'][leader][0]
    helpers = [n for n in team(side, karte) if n != leader]
    return leader, helpers


def _tragen():
    """Mit dem roten Baum auf den Schultern zurück Richtung Bach – langsam und leuchtend, die anderen tragen mit."""
    leader, helpers = _carriers('bachdoerfer', BACH, 'rot')
    tp(leader, BACH + 30.5, 0.5, 90)
    for i, n in enumerate(helpers[:2]):
        tp(n, BACH + 31.5, -1.0 + 3 * i, 90)
    cam = [{'p': [BACH + 27.0, 103.2, -7.5], 'look': [BACH + 30.0, 103.0, 0.5], 't': 0},
           {'p': [BACH + 19.0, 103.0, -7.0], 'look': [BACH + 22.0, 103.0, 0.5], 't': 6.4}]
    ev = [act(0.1, f'{leader} geh {BACH + 12.5} {Y} 0.5'),
          act(0.3, f'{helpers[0]} folge {leader} 1.6')] + ([act(0.5, f'{helpers[1]} folge {leader} 2.4')]
                                                            if len(helpers) > 1 else [])
    return {'camera': cam, 'follow': [leader], 'events': ev}


def _abfangen():
    """Lena aus Rot rennt hinterher und berührt den Träger – der Baum fällt, der Träger muss heim."""
    leader, helpers = _carriers('bachdoerfer', BACH, 'rot')
    red = team('rot', 'bachdoerfer')
    tp(leader, BACH + 22.5, 0.5, 90)
    for i, n in enumerate(helpers[:2]):
        tp(n, BACH + 24.5, -1.5 + 3 * i, 90)
    catcher = red[0]
    tp(catcher, BACH + 34.5, 6.5, 90)
    cam = [{'p': [BACH + 18.0, 102.8, -6.0], 'look': [BACH + 24.0, 102.5, 1.0], 't': 0},
           {'p': [BACH + 16.5, 103.2, -6.5], 'look': [BACH + 19.0, 102.0, 1.0], 't': 4.4}]
    ev = [act(0.0, f'{leader} geh {BACH + 8.5} {Y} 0.5')] + \
         [act(0.1, f'{n} folge {leader} 1.8') for n in helpers[:2]] + \
         [act(0.2, f'{catcher} folge {leader} 0.3 sprint')]
    return {'camera': cam, 'events': ev}


def _heuwagen():
    """Einer rennt über den Heuwagen am Ufer und fliegt mit Schwung über den Bach."""
    s = status('bachdoerfer')
    jumper = next(n for n, (side, st) in s['players'].items() if side == 'blau' and n != POV)
    tp(jumper, BACH - 5.7, -31.5, 0)
    cam = [{'p': [BACH + 5.0, 108.0, -15.0], 'look': [BACH - 3.0, 101.5, -24.0], 't': 0},
           {'p': [BACH + 4.0, 106.0, -17.0], 'look': [BACH + 0.5, 101.5, -22.0], 't': 4.4, 'ease': 1}]
    ev = [act(0.3, f'{jumper} renne {BACH - 4.2} -10 2.4')]
    return {'camera': cam, 'events': ev}


def _anpacken():
    """Ich-Sicht (Seppl): mit zwei aus dem eigenen Dorf an den fremden Baum – der Balken füllt sich, der Baum kippt."""
    s = status('almdoerfer')
    side = s['players'][POV][0]
    other = 'rot' if side == 'blau' else 'blau'
    px = ALM + POLE[other]
    toward = 1 if other == 'rot' else -1          # von der Mitte zum fremden Baum
    for n in team(other, 'almdoerfer'):
        tp(n, px + toward * 10, 14, 0)
    mates = team(side, 'almdoerfer')[:2]
    start = px - toward * 6.5
    yaw = -90 if toward > 0 else 90
    tp(POV, start, 0.5, yaw)
    for i, n in enumerate(mates):
        tp(n, start - toward * 1.5, -2.5 + 5 * i, yaw)
    return {'gamemode': 'survival', 'aim': 30, 'clear_chat': True,
            'start': {'p': [start, Y, 0.5], 'yaw': yaw, 'pitch': -12},
            'look': [{'at': 0.0, 'target': [px + 0.5, 108, 0.5]}, {'at': 3.6, 'yaw': -yaw, 'pitch': 5}],
            'keys': [{'at': 0.2, 'key': 'w', 'dur': 1.05}, {'at': 4.2, 'key': 'w', 'dur': 1.6}],
            'events': [act(0.25, f'{mates[0]} lauf {px + 0.5 - toward * 1.5} {Y} -1.5'),
                       act(0.4, f'{mates[1]} lauf {px + 0.5 - toward * 1.0} {Y} 2.5'),
                       act(4.4, f'{mates[0]} geh {start - toward * 10} {Y} -1.5'),
                       act(4.4, f'{mates[1]} geh {start - toward * 10} {Y} 2.5')]}


def _alm():
    """Durch die Schlucht der Almdörfer auf die Hängebrücke zu – zwei rennen gerade hinüber."""
    blue = team('blau', 'almdoerfer')
    for i, n in enumerate(blue[:2]):
        tp(n, ALM - 16 - 2 * i, 0.5 + i, -90)
    cam = [{'p': [ALM + 0.5, 92.0, -42.0], 'look': [ALM + 0.5, 96.0, 0.0], 't': 0},
           {'p': [ALM + 0.5, 99.0, -16.0], 'look': [ALM + 0.5, 101.0, 0.0], 't': 4.6, 'ease': 1}]
    ev = [act(0.4 + 0.5 * i, f'{n} lauf {ALM + 16 + i} {Y} {0.5 + i}') for i, n in enumerate(blue[:2])]
    return {'camera': cam, 'events': ev}


def prep_bruecke():
    """Blau legt den roten Baum um (ohne Kamera) und trägt ihn bis vor die Hängebrücke (normale Geschwindigkeit;
    Träger lassen sich nicht teleportieren – der Modus hält sie beim Baum)."""
    blue, red = team('blau', 'almdoerfer'), team('rot', 'almdoerfer')
    for i, n in enumerate(red):
        tp(n, ALM + 52 + i, 14 + i, 180)
    s = status('almdoerfer')
    if s['trees'][1].get('state') != 'CARRIED':
        fell('almdoerfer', ALM, 'rot', blue[:3])
        time.sleep(1)
    leader, helpers = _carriers('almdoerfer', ALM, 'rot')
    say(f'{leader} geh {ALM + 13.5} {Y} 0.5', *[f'{n} folge {leader} 1.4' for n in helpers[:1]])
    for n in helpers[1:]:
        say(f'{n} geh {ALM + 20} {Y} 6')
    D.until(lambda: (lambda p: p and abs(p[0] - (ALM + 13.5)) < 1.2)(D.pos(leader)), 60, 0.5, 'an der Brücke')
    time.sleep(1.5)


def _bruecke():
    """Die Träger mit dem leuchtenden Baum über die Hängebrücke – von unten aus der Schlucht."""
    leader, helpers = _carriers('almdoerfer', ALM, 'rot')
    cam = [{'p': [ALM + 5.0, 94.5, 15.0], 'look': [ALM + 9.0, 100.0, 0.5], 't': 0},
           {'p': [ALM - 3.0, 95.5, 14.0], 'look': [ALM - 2.0, 99.5, 0.5], 't': 4.4, 'ease': 1}]
    ev = [act(0.1, f'{leader} renne {ALM - 30} 0.5 12')] + [act(0.3, f'{n} folge {leader} 1.4') for n in helpers[:1]]
    return {'camera': cam, 'follow': [leader], 'events': ev}


def prep_heim():
    """Die Träger gehen (normale Geschwindigkeit) Richtung Dorfplatz; kurz davor beginnt die Zeitlupe."""
    leader, helpers = _carriers('almdoerfer', ALM, 'rot')
    px = ALM + POLE['blau']
    rc('tick rate 20')
    x = lambda: (D.pos(leader) or [ALM])[0]
    if x() > ALM - 11:  # über die Hängebrücke findet die Wegsuche nicht – stur geradeaus hinüber
        say(f'{leader} renne {ALM - 30} 0.5 20', *[f'{n} folge {leader} 1.6' for n in helpers[:2]])
        D.until(lambda: x() <= ALM - 11, 60, 0.1, 'über die Brücke')
    say(f'{leader} geh {px + 2.5} {Y} 0.5', *[f'{n} folge {leader} 1.8' for n in helpers[:2]])
    D.until(lambda: (lambda p: p and p[0] <= px + 19.0)(D.pos(leader)), 90, 0.05, 'kurz vor dem Dorfplatz')
    rc(f'tick rate {20 / SLOW:g}')


def _heim():
    """Auf den eigenen Dorfplatz damit – Sieg für Blau."""
    px = ALM + POLE['blau']
    cam = [{'p': [px + 2.5, 102.5, -8.0], 'look': [px + 12.0, 103.0, 0.5], 't': 0},
           {'p': [px + 1.0, 103.0, -7.0], 'look': [px + 5.0, 103.0, 0.5], 't': 4.4, 'ease': 1}]
    return {'camera': cam}


def _feier():
    """Auslösen: alle auf dem Platz der Sieger, Brotzeit schwebt um den Maibaum, Feuerwerk, „Prost!“."""
    px = ALM + POLE['blau']
    cam = [{'p': [px + 9.5, 103.5, -5.0], 'look': [px + 0.5, 104.5, 0.5], 't': 0},
           {'p': [px + 9.0, 105.0, 5.0], 'look': [px + 0.5, 105.5, 0.5], 't': 6.4, 'ease': 1}]
    ev = [act(0.4 + 0.5 * i, f'{n} springe 1') for i, n in enumerate(ACTORS[:4])]
    ev += [act(1.2, 'ResiBlume19 gruss 2'), act(2.0, 'Matzeee24 chat Prost!'), act(2.6, 'HanniHof chat Prost! :D'),
           act(3.4, 'Ewald77 gruss 2')]
    return {'camera': cam, 'events': ev}


def _ende():
    px = ALM + POLE['blau']
    cam = [{'p': [px + 8.0, 105.0, 3.0], 'look': [px + 0.5, 106.0, 0.5], 't': 0},
           {'p': [px + 34.0, 128.0, 10.0], 'look': [px + 0.5, 101.0, 0.5], 't': 7.0, 'ease': 1}]
    return {'camera': cam}


def prep_feier():
    """Läuft die Runde noch: Träger in normaler Geschwindigkeit heimbringen lassen, beim Sieg sofort Zeitlupe."""
    if status('almdoerfer').get('phase') == 'PLAY':
        prep_heim()
        rc('tick rate 20')
        D.until(lambda: status('almdoerfer').get('phase') == 'OVER', 90, 0.1, 'Sieg')
        time.sleep(1.5)
        rc(f'tick rate {20 / SLOW:g}')


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': _intro},
    {'id': '02-doerfer', 'bars': 2, 'card': 'lt-doerfer.png', 'spec': _doerfer},
    {'id': '03-umlegen', 'bars': 3, 'card': 'lt-umlegen.png', 'spec': _umlegen},
    {'id': '04-tragen', 'bars': 3, 'card': 'lt-tragen.png', 'spec': _tragen},
    {'id': '05-abfangen', 'bars': 2, 'card': 'lt-abfangen.png', 'spec': _abfangen},
    {'id': '06-heuwagen', 'bars': 2, 'card': 'lt-heuwagen.png', 'spec': _heuwagen},
    {'id': '07-anpacken', 'bars': 3, 'card': 'lt-anpacken.png', 'kind': 'ich', 'spec': _anpacken},
    {'id': '08-alm', 'bars': 2, 'card': 'lt-alm.png', 'spec': _alm},
    {'id': '09-bruecke', 'bars': 2, 'card': 'lt-bruecke.png', 'spec': _bruecke},
    {'id': '10-heim', 'bars': 2, 'card': 'lt-heim.png', 'prep': prep_heim, 'spec': _heim},
    {'id': '11-feier', 'bars': 3, 'card': 'lt-feier.png', 'cardAt': 0.6, 'prep': prep_feier, 'spec': _feier},
    {'id': '12-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'spec': _ende},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    steps = {'feier': prep_feier, 'runde-bach': runde_bach, 'runde-alm-ich': runde_alm_ich, 'runde-alm': runde_alm,
             'baum-bruecke': prep_bruecke, 'intro-vorher': prep_intro}
    if args and args[0] in steps:
        steps[args[0]]()
    else:
        D.main(sys.modules[__name__], args)
