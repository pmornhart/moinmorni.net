"""Trailer: Versteckerl – Verstecken mit Verwandlung: Gendarmerie, Gestalt wählen, als Fass und Heuballen durchs Dorf,
Einrasten zwischen echten Attrappen, Dorfgendarmen, falscher Treffer, Fund, Pfiff, Kramerkiste, Krämer Wastl,
Abrechnung.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh versteckerl 28810 …: Paper 26.1.2, Morni Versteckerl
0.2.1 aus dem GitHub-Release, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards). In der
config.yml des Test-Servers startet keine Runde von selbst (mindestens-spieler 16) – Runden startet das Drehbuch mit
`/versteckerladmin sucher …` und `start dorfplatz`, Zeiten mit `zeit`. Regie-Plugin nur im Test-Server
(`regie als|halle|raus <spieler>`, Quelle im Cache ~/mm-cache/trailer/versteckerl/regie-plugin/).

Alles Spielgeschehen ist echt: Darsteller (actors/regie.cjs, echte Physik) wählen ihre Gestalt im Truhen-Fenster,
gehen als Gestalt durchs Dorf und rasten ein, wenn sie still stehen; der Aufnahme-Client (Seppl19) spielt in der
Ich-Sicht mit echten Klicks als Versteckter bzw. als Dorfgendarm.

Drei Runden: B (Kamera schaut zu: 04, 05, 08), A (Kamera versteckt sich: 03), C (Kamera sucht: 06, 07, 09, 11).
  python3 trailers/versteckerl.py runde-b|runde-a|runde-c     # Runde vorbereiten (Gestalten, Verstecke)
  python3 trailers/versteckerl.py <einstellung …>              # drehen
  python3 make.py versteckerl music|cards|sheet|cut|fertig
"""
import os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'versteckerl'
STYLE = 'versteckerl'
FILE = 'MoinMorni-Trailer-Versteckerl.mp4'
SLOW = 15
DIM = 'minecraft:versteckerl'
POV = os.environ.get('MM_CAMERA', 'Seppl19')
HANNI, ELLA, MATZE, MIA, RESI, EWALD = 'HanniHof', 'EllaSommer7', 'Matzeee24', 'mia_lofi06', 'ResiBlume19', 'Ewald77'
ACTORS = [HANNI, ELLA, MATZE, MIA, RESI, EWALD]
X0 = 1000  # Dorfplatz (Mitte x), Boden y 100 – man steht auf 101
SLOT = {'heuballen': 10, 'fass': 11, 'blumentopf': 12, 'kuerbis': 13}

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Versteckerl',
     'text': 'Verstecken mit Verwandlung – 4 bis 16 Leute'},
    {'file': 'lt-gendarmerie.png', 'kind': 'lower', 'title': 'Die Gendarmerie', 'text': 'Karte wählen, „bereit“ sagen – los geht’s'},
    {'file': 'lt-gestalt.png', 'kind': 'lower', 'title': 'Verwandeln', 'text': 'Fass, Heuballen, Blumentopf, Kürbis …'},
    {'file': 'lt-einrasten.png', 'kind': 'lower', 'title': 'Still stehen', 'text': 'Wer sich nicht rührt, wird ein echter Block'},
    {'file': 'lt-gendarmen.png', 'kind': 'lower', 'title': 'Die Dorfgendarmen', 'text': 'Sie suchen – und schlagen auf alles Verdächtige'},
    {'file': 'lt-daneben.png', 'kind': 'lower', 'title': 'Daneben!', 'text': 'Ein Schlag auf ein echtes Fass kostet Leben'},
    {'file': 'lt-fund.png', 'kind': 'lower', 'title': 'Gefunden!', 'text': 'Wer gefunden wird, sucht ab jetzt mit'},
    {'file': 'lt-pfiff.png', 'kind': 'lower', 'title': 'Pfeifen bringt Punkte', 'text': 'Je mutiger, desto mehr'},
    {'file': 'lt-kiste.png', 'kind': 'lower', 'title': 'Die Kramerkiste', 'text': 'Laterne, Nebelwolke, Lockpfiff – für Punkte aus der Runde'},
    {'file': 'lt-wastl.png', 'kind': 'lower', 'title': 'Krämer Wastl', 'text': 'Gestalten, Pfiff-Klänge, Effekte und Titel'},
    {'file': 'lt-abrechnung.png', 'kind': 'lower', 'title': 'Die Abrechnung', 'text': 'Punkte aufs Guthaben – nichts für echtes Geld'},
    {'file': 'lt-karten.png', 'kind': 'lower', 'title': 'Drei Karten', 'text': 'Dorfplatz, Wirtshaus und Heustadel'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Versteckerl“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def status():
    """/versteckerladmin status → {phase, zeit, members: {Name: [rolle, gestalt, eingerastet, leben, punkte …]}}."""
    out = {'members': {}}
    for line in rc('versteckerladmin status').split('\n'):
        if line.startswith('karte=dorfplatz'):
            for part in line.split(' '):
                k, _, v = part.partition('=')
                if k[:1].isupper():
                    out['members'][k] = v.split(':')
                else:
                    out[k] = v
    return out


def sky():
    at('time set 5000')
    at('weather clear')


def stop_round():
    rc('tick rate 20')
    if status().get('phase'):
        rc('versteckerladmin ende dorfplatz')
        time.sleep(14)  # Nachspiel, dann zurück in die Gendarmerie


def start_round(seekers, pov_in):
    """Neue Runde auf dem Dorfplatz; `seekers` werden Gendarmen; die Kamera spielt mit oder schaut zu."""
    stop_round()
    sky()
    for n in ACTORS:
        rc(f'regie halle {n}')
        say(f'{n} physik an')
    if pov_in:
        rc(f'gamemode adventure {POV}')
        rc(f'regie halle {POV}')
    else:
        rc(f'regie raus {POV}')
        rc(f'gamemode spectator {POV}')
    time.sleep(1)
    rc('versteckerladmin sucher ' + ' '.join(seekers))
    rc('versteckerladmin start dorfplatz')
    D.until(lambda: status().get('phase') == 'HIDE', 15, 0.5, 'Runde startet')
    rc('versteckerladmin zeit 900')
    time.sleep(2)


def shapes(**chosen):
    for n, s in chosen.items():
        say(f'{n} click {SLOT[s]}')
    time.sleep(2)


def lock(name, x, z, yaw=0):
    """Darsteller (als Gestalt) an seinen Platz stellen und einrasten lassen (still stehen)."""
    at(f'tp {name} {x} 101 {z} {yaw} 0')


def runde_b():
    """Kamera schaut zu: Matze (Fass) und Hanni (Heuballen) verstecken sich, Ella (Blumentopf) und Resi (Kürbis) auch."""
    start_round([EWALD, MIA], pov_in=False)
    shapes(HanniHof='heuballen', Matzeee24='fass', EllaSommer7='blumentopf', ResiBlume19='kuerbis')
    lock(ELLA, X0 - 6.5, -4.5)
    lock(RESI, X0 - 22.5, 3.5)


def runde_a():
    """Kamera versteckt sich (Gestalt-Fenster in der Ich-Sicht)."""
    start_round([EWALD, MIA], pov_in=True)
    shapes(HanniHof='heuballen', Matzeee24='fass', EllaSommer7='blumentopf', ResiBlume19='kuerbis')


def runde_c():
    """Kamera sucht: Matze steckt als Fass zwischen den Fässern im Biergarten, Hanni im Heu."""
    start_round([POV, EWALD], pov_in=True)
    shapes(HanniHof='heuballen', Matzeee24='fass', EllaSommer7='blumentopf', ResiBlume19='kuerbis')
    lock(MATZE, X0 + 7.5, -12.5)
    lock(HANNI, X0 + 23.5, 14.5)
    lock(ELLA, X0 - 6.5, -4.5)
    lock(RESI, X0 - 22.5, 3.5)
    time.sleep(5)
    rc('versteckerladmin zeit 1')  # Versteckzeit vorbei – die Gendarmen kommen aus der Stube
    D.until(lambda: status().get('phase') == 'SEEK', 15, 0.5, 'Suchzeit')
    rc('versteckerladmin zeit 900')


# ------------------------------------------------------------------ Einstellungen

def _gendarmerie():
    """In der Gendarmerie: Leute kommen an, einer stimmt mit dem Kompass ab, die anderen sagen „bereit“."""
    cam = [{'p': [8.5, 103.2, 14.0], 'look': [0.5, 102.0, 1.0], 't': 0},
           {'p': [4.0, 102.8, 12.0], 'look': [-1.0, 102.2, -1.0], 't': 4.6, 'ease': 1}]
    ev = [act(0.1, f'{HANNI} geh -7.5 101 1.5 blick=-8,102,-1'), act(0.3, f'{MATZE} geh 0.5 101 2.0 blick=0,102,-1'),
          act(0.5, f'{ELLA} geh 6.0 101 3.0 blick=kamera'), act(0.2, f'{RESI} geh -3.0 101 5.5 blick={MATZE}'),
          act(1.6, f'{EWALD} geh 2.5 101 6.0 blick={RESI}'), act(2.6, f'{RESI} gruss 2'), act(3.2, f'{ELLA} springe 1')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_gendarmerie():
    stop_round()
    sky()
    for n, (x, z) in {HANNI: (-4.5, 10.5), MATZE: (2.5, 11.5), ELLA: (6.5, 9.5), RESI: (-1.5, 9.0), EWALD: (3.5, 12.5),
                      MIA: (-9.5, 6.5)}.items():
        rc(f'regie halle {n}')
        say(f'{n} physik an')
        at(f'tp {n} {x} 101 {z} 180 0')
    rc(f'regie raus {POV}')
    time.sleep(2)


def _verwandelt():
    """Matze als Fass: aus der Gasse über den Platz in den Biergarten, stellt sich zu den Fässern und rastet ein."""
    cam = [{'p': [X0 + 1.0, 103.4, -4.0], 'look': [X0 + 3.0, 101.6, -8.0], 't': 0},
           {'p': [X0 + 2.0, 103.0, -6.5], 'look': [X0 + 7.0, 101.5, -12.0], 't': 8.6, 'ease': 1}]
    ev = [act(0.2, f'{MATZE} geh {X0 + 7.5} 101 -12.5 genau=0.15'), act(0.1, f'{MATZE} leerlauf aus')]
    return {'camera': cam, 'follow': [MATZE], 'events': ev, 'fit': False}


def prep_verwandelt():
    sky()
    at(f'tp {MATZE} {X0 + 3.5} 101 -2.5 180 0')
    time.sleep(1.5)


def _heu():
    """Hanni als Heuballen auf der Wiese zwischen den Heumandln – still stehen, einrasten."""
    cam = [{'p': [X0 + 16.0, 103.0, 10.0], 'look': [X0 + 23.5, 101.5, 14.5], 't': 0},
           {'p': [X0 + 17.5, 102.6, 9.0], 'look': [X0 + 23.5, 101.3, 14.5], 't': 4.6, 'ease': 1}]
    ev = [act(0.1, f'{HANNI} geh {X0 + 23.5} 101 14.5 genau=0.15')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_heu():
    sky()
    at(f'tp {HANNI} {X0 + 18.5} 101 18.5 0 0')
    time.sleep(2)


def _gendarmen():
    """Suchzeit: die Gendarmen kommen aus der Stube, Ewald geht mit dem Stab an Ellas Blumentopf vorbei."""
    cam = [{'p': [X0 - 1.5, 103.0, 4.5], 'look': [X0 - 6.5, 101.5, -3.0], 't': 0},
           {'p': [X0 - 2.5, 102.6, 3.0], 'look': [X0 - 6.5, 101.5, -4.0], 't': 4.6, 'ease': 1}]
    ev = [act(0.0, f'{EWALD} nimm stick'), act(0.1, f'{EWALD} geh {X0 - 4.5} 101 -3.5 blick={X0 - 7},101.5,-5'),
          act(0.3, f'{MIA} nimm stick'), act(0.4, f'{MIA} geh {X0 - 9.5} 101 1.0 blick={X0 - 12},101.5,-2')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_gendarmen():
    sky()
    if status().get('phase') != 'SEEK':
        rc('versteckerladmin zeit 1')
        D.until(lambda: status().get('phase') == 'SEEK', 20, 0.5, 'Suchzeit')
        rc('versteckerladmin zeit 900')
    at(f'tp {EWALD} {X0 + 0.5} 101 9.5 180 0')
    at(f'tp {MIA} {X0 - 3.5} 101 10.5 180 0')
    time.sleep(2)


def _pfiff():
    """Ella (Blumentopf, eingerastet) pfeift, als Ewald ganz nah ist – Noten steigen auf."""
    cam = [{'p': [X0 - 2.5, 102.6, -1.0], 'look': [X0 - 6.5, 101.3, -4.5], 't': 0},
           {'p': [X0 - 3.2, 102.4, -1.8], 'look': [X0 - 6.5, 101.4, -4.5], 't': 4.6, 'ease': 1}]
    ev = [act(0.8, f'{ELLA} use'), act(0.1, f'{EWALD} geh {X0 - 8.0} 101 -2.0 blick={X0 - 6.5},101.5,-4.5')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_pfiff():
    say(f'{ELLA} slot 1')
    at(f'tp {EWALD} {X0 - 9.5} 101 1.5 180 10')
    time.sleep(1)


def prep_pfiff_ich():
    """Runde A, Suchzeit: die Kamera steht als Fass bei den Fässern, Ewald kommt mit dem Stab näher."""
    if status().get('phase') != 'SEEK':
        rc('versteckerladmin zeit 1')
        D.until(lambda: status().get('phase') == 'SEEK', 20, 0.5, 'Suchzeit')
        rc('versteckerladmin zeit 900')
    at(f'tp {POV} {X0 + 6.5} 101 -10.5 -30 5')
    at(f'tp {EWALD} {X0 + 1.5} 101 -2.5 -150 0')
    say(f'{EWALD} nimm stick')
    time.sleep(4)


def _pfiff_ich():
    return {'gamemode': 'adventure', 'aim': 40, 'clear_chat': True,
            'look': [{'at': 0.0, 'target': EWALD, 'height': 1.4}],
            'keys': [{'at': 0.3, 'key': '2', 'dur': 0.1}],
            'clicks': [{'at': 1.6, 'button': 3}],
            'events': [act(0.1, f'{EWALD} geh {X0 + 4.5} 101 -7.0 blick={X0 + 6.5},101.6,-10.5')]}


def _gestalt():
    """Ich-Sicht als Versteckter: das Gestalt-Fenster ist offen – Klick auf das Fass, dann zu den Fässern laufen."""
    gui, left, top = 3, (1600 // 3 - 176) // 2, (900 // 3 - 204) // 2
    sx, sy = (left + 8 + 2 * 18 + 8) * gui, (top + 18 + 1 * 18 + 8) * gui   # Platz 11 = Fass
    return {'gamemode': 'adventure', 'clear_chat': True, 'aim': 40,
            'start': {'p': [X0 + 2.5, 101, -3.5], 'yaw': -151, 'pitch': 12},
            'clicks': [{'at': 0.05, 'button': 3, 'opens': True}, {'at': 1.2, 'button': 1}],
            'input': [{'at': 0.3, 'mouse': [800, 420], 'dur': 0.1}, {'at': 0.5, 'mouse': [sx, sy], 'dur': 0.6}],
            'keys': [{'at': 1.6, 'key': 'w', 'dur': 1.2}],
            'events': [cmd(0.05, f'regie als {POV} gestalt')]}


def prep_gestalt():
    sky()
    import subprocess
    subprocess.run(['xdotool', 'key', 'Escape'], env=dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':150')))
    time.sleep(2)


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'prep': sky, 'spec': {
        'camera': [{'p': [X0 + 0.5, 126.0, 44.0], 'look': [X0 + 0.5, 104.0, 0.0], 't': 0},
                   {'p': [X0 + 0.5, 116.0, 26.0], 'look': [X0 + 0.5, 104.0, -4.0], 't': 4.0},
                   {'p': [X0 + 4.5, 106.0, 10.0], 'look': [X0 + 0.5, 106.0, -12.0], 't': 4.0, 'ease': 1}]}},
    {'id': '02-gendarmerie', 'bars': 2, 'card': 'lt-gendarmerie.png', 'prep': prep_gendarmerie, 'spec': _gendarmerie},
    {'id': '03-gestalt', 'bars': 2, 'card': 'lt-gestalt.png', 'kind': 'ich', 'prep': prep_gestalt, 'spec': _gestalt},
    {'id': '04-verwandelt', 'bars': 4, 'card': 'lt-einrasten.png', 'cardAt': 3.5, 'prep': prep_verwandelt,
     'spec': _verwandelt},
    {'id': '05-gendarmen', 'bars': 2, 'card': 'lt-gendarmen.png', 'prep': prep_gendarmen, 'spec': _gendarmen},
    {'id': '06-daneben', 'bars': 2, 'card': 'lt-daneben.png', 'kind': 'ich', 'prep': lambda: None, 'spec': lambda: _hit(False)},
    {'id': '07-fund', 'bars': 2, 'card': 'lt-fund.png', 'kind': 'ich', 'prep': lambda: None, 'spec': lambda: _hit(True)},
    {'id': '08-pfiff', 'bars': 2, 'card': 'lt-pfiff.png', 'kind': 'ich', 'prep': prep_pfiff_ich, 'spec': lambda: _pfiff_ich()},
    {'id': '09-kiste', 'bars': 2, 'card': 'lt-kiste.png', 'kind': 'ich', 'prep': lambda: None, 'spec': lambda: _kiste()},
    {'id': '10-wastl', 'bars': 2, 'card': 'lt-wastl.png', 'kind': 'ich', 'prep': lambda: None, 'spec': lambda: _wastl()},
    {'id': '11-abrechnung', 'bars': 2, 'card': 'lt-abrechnung.png', 'kind': 'ich', 'prep': lambda: None,
     'spec': lambda: _abrechnung()},
    {'id': '12-karten', 'bars': 2, 'card': 'lt-karten.png', 'prep': sky, 'spec': {
        'camera': [{'p': [2000.5, 122.0, 36.0], 'look': [2000.5, 104.0, 0.0], 't': 0},
                   {'p': [2006.5, 116.0, 26.0], 'look': [2000.5, 103.0, 0.0], 't': 4.6, 'ease': 1}]}},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'prep': sky, 'spec': {
        'camera': [{'p': [X0 + 6.0, 106.0, 8.0], 'look': [X0 + 0.5, 106.0, -12.0], 't': 0},
                   {'p': [X0 + 12.0, 122.0, 34.0], 'look': [X0 + 0.5, 104.0, -4.0], 't': 6.0, 'ease': 1}]}},
]


def _hit(found):
    """Ich-Sicht als Gendarm: daneben auf das echte Fass – oder dreimal auf Matzes Fass."""
    target = [X0 + 8.5, 101.5, -12.5] if found is False else [X0 + 7.5, 101.5, -12.5]
    if found:
        clicks = [{'at': t, 'button': 1} for t in (1.1, 1.9, 2.7)]
    else:
        clicks = [{'at': t, 'button': 1} for t in (1.1, 2.1)]
    return {'gamemode': 'adventure', 'aim': 50, 'start': {'p': [X0 + 5.5, 101, -9.0], 'yaw': -150, 'pitch': 20},
            'look': [{'at': 0.0, 'target': target}],
            'keys': [{'at': 0.2, 'key': 'w', 'dur': 0.45}], 'clicks': clicks,
            'input': [{'at': 0.05, 'select': 'stick'}]}


def _kiste():
    """Ich-Sicht als Gendarm: Kramerkiste auf, Maus auf die Laterne (Erklärung), kaufen – Funken zeigen, wer sich bewegt."""
    return {'gamemode': 'adventure', 'aim': 40, 'start': {'p': [X0 + 12.5, 101, 8.5], 'yaw': 140, 'pitch': 8},
            'clicks': [{'at': 0.3, 'button': 3, 'opens': True}, {'at': 2.0, 'button': 1}],
            'input': [{'at': 0.7, 'mouse': [692, 330], 'dur': 0.6}],
            'events': [cmd(0.3, f'regie als {POV} laden'), act(2.4, f'{HANNI} geh {X0 + 18.5} 101 9.5'),
                       act(2.5, f'{RESI} geh {X0 + 6.5} 101 2.5')]}


def _wastl():
    return {'gamemode': 'adventure', 'aim': 40, 'start': {'p': [7.5, 101, -5.5], 'yaw': -90, 'pitch': 5},
            'look': [{'at': 0.0, 'target': [11.5, 102.6, -5.5]}],
            'keys': [{'at': 0.1, 'key': 'w', 'dur': 0.5}],
            'clicks': [{'at': 1.0, 'button': 3, 'opens': True}],
            'input': [{'at': 1.6, 'mouse': [700, 300], 'dur': 0.6}, {'at': 2.5, 'mouse': [900, 330], 'dur': 0.6}]}


def _abrechnung():
    return {'gamemode': 'adventure', 'aim': 40, 'clear_chat': False,
            'events': [cmd(0.3, 'versteckerladmin zeit 1')]}


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0].startswith('runde-'):
        {'runde-a': runde_a, 'runde-b': runde_b, 'runde-c': runde_c}[args[0]]()
    else:
        D.main(sys.modules[__name__], args)
