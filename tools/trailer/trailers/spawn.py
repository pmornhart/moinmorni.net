"""Trailer: Spawn / Lobby – das Alpendorf auf dem Stand vom 17.11.: Ankunft am Dorfplatz, Maibaum-Markt mit den
Modus-Figuren im Kostüm (Schilder in drei Zeilen), Klick auf eine Figur (Funken, Winken), Dorfleben im Biergarten,
Schlossmarkt mit Sport-Stand, Prunkaufgang mit rotem Teppich, Launchpad, Prunkbrunnen, Festsaal, Jump and Run hoch
über dem Dorf (Blöcke ploppen nur für den Läufer auf), Doppelsprung, Kompass-Menü, die vier Saisons (Winter-Wunderland,
Wiesn mit Kettenkarussell, Ostern, Halloween-Riesenkürbis) und das angestrahlte Schloss bei Nacht.

Gedreht auf einem eigenen Test-Server (nur im Cache, nicht im Repo): Paper 26.1.2 + Netzwerk-Plugin aus diesem
Branch + ViaVersion/ViaBackwards, Lobby mit dem echten Selbstbau (`apps/server/scripts/lobby-selbstbau.ts`, Saisons
mit MM_SEASON), Test-Hub `apps/server/scripts/hub-dev.ts --steuer` (Einstellungen wie im Panel, Lobby-Paket mit Möbeln,
Trachten und Brunnen über HTTP), alle Spielmodi „auf Zuruf“ als laufend gemeldet (Live-Zahlen auf den Schildern).
Regie-Plugin nur im Test-Server: `/jnrauto <spieler> an|aus [warte-ticks]` lässt den Läufer im Jump and Run mit echtem
Schwung springen (der Client fliegt den Bogen mit seiner eigenen Physik) und stellt einen Marker `jnr_ziel` auf den
nächsten Block (Blickziel). Quelle im Cache ~/mm-cache/trailer/regie-spawn/.

Darsteller (actors/regie.cjs, echte Physik): ResiBlume19 Seppl19 EllaSommer7 Matzeee24 Lena_Herbst05 lotte_rennt12;
Aufnahme-Client Toni_Wandert11 (Ich-Sicht mit dessen Skin).

  python3 trailers/spawn.py <einstellung …>          # drehen (Saisons: vorher `saison <name>`)
  python3 trailers/spawn.py saison none|winter|wiesn|easter|halloween
  python3 make.py spawn music|cards|sheet|cut|fertig
Umgebung zusätzlich: MM_STEUER (Steuerung des Test-Hubs, z. B. http://127.0.0.1:27951/), MM_LOBBY_DIR (Server-Ordner).
"""
import json, os, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'spawn'
STYLE = 'spawn'
FILE = 'MoinMorni-Trailer-Spawn.mp4'
SLOW = 15
POV = os.environ.get('MM_CAMERA', 'Toni_Wandert11')
RESI, SEPPL, ELLA, MATZE, LENA, LOTTE = ('ResiBlume19', 'Seppl19', 'EllaSommer7', 'Matzeee24', 'Lena_Herbst05',
                                          'lotte_rennt12')
ACTORS = [RESI, SEPPL, ELLA, MATZE, LENA, LOTTE]
Y = 65               # Füße auf dem Dorfplatz (Boden 64)
FOUNTAIN = (0.5, 92, -111.5)   # Prunkbrunnen im Ehrenhof (Marker mm_brunnen_mitte)
JNR_START = (-57.5, 65, -40.5)  # östlich vom Smaragd (−60/−41) – von dort auf den Smaragd laufen
STEUER = os.environ.get('MM_STEUER', 'http://127.0.0.1:27951/')

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'Willkommen in', 'title': 'MoinMorni',
     'text': 'Ein Alpendorf voller Spielmodi – für Java und Bedrock'},
    {'file': 'lt-ankunft.png', 'kind': 'lower', 'title': 'Servus im Dorf!', 'text': 'Du kommst mitten am Dorfplatz an'},
    {'file': 'lt-figuren.png', 'kind': 'lower', 'title': 'Jede Figur ein Spielmodus', 'text': 'Im Kostüm – mit Live-Zahl über dem Kopf'},
    {'file': 'lt-klick.png', 'kind': 'lower', 'title': 'Anklicken und los', 'text': 'Rechtsklick auf die Figur – schon bist du dabei'},
    {'file': 'lt-leute.png', 'kind': 'lower', 'title': 'Das Dorf lebt', 'text': 'Biergarten mit Wirt, Gästen und Leuten in Tracht'},
    {'file': 'lt-schlossmarkt.png', 'kind': 'lower', 'title': 'Der Schlossmarkt', 'text': 'Noch mehr Modi – und der Sport-Stand'},
    {'file': 'lt-treppe.png', 'kind': 'lower', 'title': 'Der Prunkaufgang', 'text': 'Marmor, roter Teppich, Fahnen'},
    {'file': 'lt-launchpad.png', 'kind': 'lower', 'title': 'Launchpads', 'text': 'Oder mit Schwung hinauf'},
    {'file': 'lt-brunnen.png', 'kind': 'lower', 'title': 'Der Prunkbrunnen', 'text': 'Mitten im Ehrenhof des Schlosses'},
    {'file': 'lt-festsaal.png', 'kind': 'lower', 'title': 'Der Festsaal', 'text': 'Rotunde, Prunktreppe und Galerie'},
    {'file': 'lt-jnr.png', 'kind': 'lower', 'title': 'Jump and Run', 'text': 'Hoch über dem Dorf – Block für Block'},
    {'file': 'lt-doppelsprung.png', 'kind': 'lower', 'title': 'Doppelsprung', 'text': 'Zweimal Leertaste – und hui!'},
    {'file': 'lt-kompass.png', 'kind': 'lower', 'title': 'Alle Modi im Kompass', 'text': 'Ein Klick bringt dich hin'},
    {'file': 'lt-winter.png', 'kind': 'lower', 'title': 'Winter-Wunderland', 'text': 'Der Dorfplatz feiert jede Saison'},
    {'file': 'lt-wiesn.png', 'kind': 'lower', 'title': 'Wiesn', 'text': 'Mit Kettenkarussell und Riesenrad'},
    {'file': 'lt-ostern.png', 'kind': 'lower', 'title': 'Ostern', 'text': 'Osterbrunnen und Kirschblüte'},
    {'file': 'lt-halloween.png', 'kind': 'lower', 'title': 'Halloween', 'text': 'Der Riesenkürbis leuchtet'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'Komm vorbei – wir sehen uns im Dorf!'},
]


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def tp(name, x, z, yaw=0, y=Y):
    rc(f'tp {name} {x} {y} {z} {yaw} 0')


def lobby(**values):
    """Einstellung wie im Panel (Bereich Lobby) über die Steuerung des Test-Hubs."""
    req = urllib.request.Request(STEUER, data=json.dumps({'area': 'lobby', 'values': values}).encode(),
                                 headers={'content-type': 'application/json'})
    urllib.request.urlopen(req, timeout=20).read()


def daytime(when):
    lobby(daytime=when)
    time.sleep(3)


def park(*names):
    """Darsteller aus dem Bild stellen (hinter das Wirtshaus)."""
    for i, n in enumerate(names):
        tp(n, 60 + i, 30)
    say(*[f'{n} stopp' for n in names])


def saison(name):
    """Saison wie im Panel: Plugin (Biom, Teilchen) über den Hub, Blöcke und Anzeigen mit dem echten Selbstbau."""
    lobby(season=name)
    d = os.environ.get('MM_LOBBY_DIR', '/home/user/mm-cache/servers/trailer-spawn')
    host, port = os.environ['MM_RCON'].split(':')
    env = dict(os.environ, MM_SEASON=name)
    subprocess.run(['npx', 'tsx', 'scripts/lobby-selbstbau.ts', d, f'{host}:{port}', os.path.join(d, '.rcon-pass')],
                   cwd=os.path.join(HERE, '..', '..', '..', 'apps', 'server'), env=env, check=True)


# ------------------------------------------------------------------ Einstellungen

def _intro():
    """Anflug von Süden über die Dorfstraße auf Markt, Maibaum und Schloss."""
    cam = [{'p': [46.0, 128.0, 104.0], 'look': [0.0, 82.0, -50.0], 't': 0},
           {'p': [20.0, 108.0, 70.0], 'look': [0.0, 84.0, -70.0], 't': 5.0},
           {'p': [4.0, 92.0, 48.0], 'look': [0.0, 86.0, -90.0], 't': 5.0, 'ease': 1}]
    return {'camera': cam}


def prep_ankunft():
    daytime('day')
    spots = [(RESI, -1.5, 27.5), (SEPPL, 2.5, 29.0), (ELLA, -3.0, 31.0)]
    for n, x, z in spots:
        tp(n, x, z, 180)
    park(MATZE, LENA, LOTTE)
    time.sleep(1)


def _ankunft():
    """Hinter den Neuen her vom Ankunftsplatz auf den Dorfmarkt mit Maibaum, das Schloss im Hintergrund."""
    cam = [{'p': [0.5, 67.6, 35.0], 'look': [0.0, 76.0, -40.0], 't': 0},
           {'p': [0.5, 67.4, 25.0], 'look': [0.0, 77.0, -60.0], 't': 6.0, 'ease': 1}]
    M = D.mensch
    ev = M.merge(M.gruppe(RESI, [SEPPL, ELLA], [(-1.5, 27.5), (-2.5, 14.5)], y=Y, seed='ankunft',
                          plaudern=[(SEPPL, 'boah ist das schön hier'), (ELLA, 'wo gehts zu duels?')]),
                 M.gruss(SEPPL, 4.0, 'hey'))
    return {'camera': cam, 'events': ev}


def prep_figuren():
    park(RESI, SEPPL, ELLA, MATZE, LENA, LOTTE)


def _figuren():
    """Am Maibaum vorbei: Morni Party und Burgverlies – Kostüme, Gegenstand, Schild in drei Zeilen."""
    cam = [{'p': [-8.5, 66.3, -8.5], 'look': [-13.5, 67.0, -7.0], 't': 0},
           {'p': [-8.0, 66.4, 0.5], 'look': [-14.0, 67.0, 0.5], 't': 3.0},
           {'p': [-8.5, 66.3, 9.5], 'look': [-13.5, 67.0, 8.0], 't': 3.0, 'ease': 1}]
    return {'camera': cam}


def _klick():
    """Ich-Sicht: auf die Duels-Figur zu, Rechtsklick – Klang, Funken in der Modusfarbe, sie winkt."""
    return {'gamemode': 'adventure', 'aim': 40,
            'start': {'p': [8.5, Y, -8.8], 'yaw': 180, 'pitch': 0},
            'look': [{'at': 0.0, 'target': [8.5, 66.2, -13.5]}],
            'keys': [{'at': 0.05, 'key': '5', 'dur': 0.05}, {'at': 0.2, 'key': 'w', 'dur': 0.6}],
            'clicks': [{'at': 1.3, 'button': 3, 'dur': 0.4}]}


def prep_biergarten():
    tp(ELLA, 30.5, -2.5, -90)
    tp(MATZE, 31.5, 1.0, -90)
    tp(LENA, 49.5, 6.5, 90)


def _biergarten():
    """Biergarten unter den Kastanien: Wirt, Gäste mit Steinkrügen, Leute schlendern durch."""
    cam = [{'p': [30.0, 67.0, -12.0], 'look': [42.0, 65.6, -1.0], 't': 0},
           {'p': [36.0, 66.7, -11.5], 'look': [44.0, 65.6, 2.5], 't': 6.0, 'ease': 1}]
    M = D.mensch
    ev = M.merge(M.laufen(ELLA, [(40.5, 2.5), (44.5, -3.5)], y=Y, seed='bg-ella'),
                 M.laufen(MATZE, [(41.5, 4.0), (45.5, -1.0)], y=Y, seed='bg-matze', sprint=0.6),
                 M.laufen(LENA, [(33.5, 5.5), (37.5, 2.5)], y=Y, seed='bg-lena'),
                 M.chat([(MATZE, 'erstmal ne brezn'), (LENA, 'prost'), (ELLA, 'hahaha')], 1.0, seed='bg'))
    return {'camera': cam, 'events': ev}


def prep_schlossmarkt():
    park(ELLA, MATZE, LENA)
    tp(RESI, -15.5, -24.0, 90)
    tp(SEPPL, -17.5, -26.5, 90)


def _schlossmarkt():
    """Marktzeile am Schlossberg: Bootshaus der Sommerspiele (Sport-Stand) und die Stände daneben."""
    cam = [{'p': [-12.0, 67.6, -21.0], 'look': [-26.0, 66.6, -31.5], 't': 0},
           {'p': [-19.0, 67.0, -23.5], 'look': [-29.0, 66.6, -32.0], 't': 6.0, 'ease': 1}]
    ev = [act(0.1, f'{RESI} geh -24.5 {Y} -27.0 blick=-25.5,66.5,-31.5'), act(0.4, f'{SEPPL} geh -31.5 {Y} -27.5')]
    return {'camera': cam, 'events': ev}


def prep_treppe():
    park(RESI, SEPPL)
    for i, (n, x) in enumerate(((ELLA, -0.5), (MATZE, 1.5), (LENA, 0.5))):
        tp(n, x, -36.0 - 1.0 * i, 180, 70.0)
    time.sleep(1)


def _treppe():
    """Durchs Prunkportal die Schlosstreppe hinauf – der rote Teppich führt bis vor das Schloss."""
    cam = [{'p': [0.5, 67.4, -24.0], 'look': [0.5, 70.0, -46.0], 't': 0},
           {'p': [2.6, 67.6, -31.0], 'look': [0.5, 74.0, -52.0], 't': 1.8},
           {'p': [2.6, 72.5, -38.0], 'look': [0.5, 82.0, -62.0], 't': 1.6},
           {'p': [0.5, 81.5, -48.5], 'look': [0.5, 94.0, -78.0], 't': 2.2, 'ease': 1}]
    ev = [act(0.1, f'{n} geh {x} 92 -72') for n, x in ((ELLA, -0.5), (MATZE, 1.5), (LENA, 0.5))]
    return {'camera': cam, 'events': ev}


def prep_launchpad():
    park(ELLA, MATZE, LENA)
    tp(LOTTE, -13.5, -20.5, 180)
    time.sleep(1)


def _launchpad():
    """Auf das Launchpad am Schlossmarkt – und in hohem Bogen die Schlosstreppe hinauf."""
    cam = [{'p': [-25.0, 69.0, -13.0], 'look': [-11.0, 69.0, -30.0], 't': 0},
           {'p': [-24.0, 71.5, -15.0], 'look': [-6.0, 76.0, -40.0], 't': 6.0, 'ease': 1}]
    ev = [act(0.2, f'{LOTTE} renne -13.5 -26.5 1.5')]
    return {'camera': cam, 'events': ev}


def prep_brunnen():
    park(LOTTE)
    tp(RESI, FOUNTAIN[0] + 6, FOUNTAIN[2] + 3, 90, FOUNTAIN[1])


def _brunnen():
    fx, fy, fz = FOUNTAIN
    cam = [{'p': [fx + 10.0, fy + 3.5, fz + 7.0], 'look': [fx, fy + 3.0, fz], 't': 0},
           {'p': [fx + 2.0, fy + 3.0, fz + 11.0], 'look': [fx, fy + 3.5, fz], 't': 3.0},
           {'p': [fx - 8.0, fy + 3.5, fz + 8.0], 'look': [fx, fy + 3.5, fz], 't': 3.0, 'ease': 1}]
    ev = [act(0.2, f'{RESI} geh {fx + 3} {fy} {fz + 6} blick={fx},{fy + 3},{fz}')]
    return {'camera': cam, 'events': ev}


def prep_festsaal():
    park(RESI)


def _festsaal():
    cam = [{'p': [-8.0, 96.0, -130.5], 'look': [0.5, 96.8, -137.0], 't': 0},
           {'p': [0.5, 96.3, -129.5], 'look': [0.5, 97.5, -138.0], 't': 3.0},
           {'p': [9.0, 96.0, -130.5], 'look': [0.5, 97.0, -137.5], 't': 3.0, 'ease': 1}]
    return {'camera': cam}


def prep_jnr():
    """Auf den Smaragd laufen (normale Geschwindigkeit) – oben in der eigenen Bahn ist die Ich-Sicht."""
    rc('tick rate 20')
    rc(f'jnrauto {POV} aus')
    rc('minecraft:spectate')
    rc(f'gamemode adventure {POV}')
    x, y, z = JNR_START
    rc(f'tp {POV} {x} {y} {z} 90 10')
    time.sleep(3)
    env = dict(os.environ, DISPLAY=os.environ['MM_DISPLAY'])
    subprocess.run(['xdotool', 'keydown', 'w'], env=env)
    try:  # loslassen, sobald man oben steht – sonst läuft man gleich vom Startblock
        D.until(lambda: (D.pos(POV) or [0, 0, 0])[1] > 140, 10, 0.05, 'oben im Jump and Run')
    finally:
        subprocess.run(['xdotool', 'keyup', 'w'], env=env)
    time.sleep(1.5)


def _jnr():
    """Ich-Sicht hoch über dem Dorf: jeder Sprung ein Punkt, der nächste Block ploppt auf (nur für den Läufer)."""
    return {'gamemode': 'adventure', 'aim': 90, 'wait': 0.5,
            'look': [{'at': 0.0, 'target': '@e[type=marker,tag=jnr_ziel,limit=1]', 'height': 0.3}],
            'events': [{'at': 0.1, 'cmd': f'jnrauto {POV} an 9'}]}


def _doppelsprung():
    """Ich-Sicht am Dorfplatz: anlaufen, springen, in der Luft noch einmal – der Schwung trägt weit nach vorn."""
    return {'gamemode': 'adventure', 'aim': 40,
            'start': {'p': [0.5, Y, 24.0], 'yaw': 180, 'pitch': -8},
            'look': [{'at': 0.0, 'yaw': 180, 'pitch': -10}],
            'keys': [{'at': 0.1, 'key': 'w', 'dur': 2.0}, {'at': 0.3, 'key': 'space', 'dur': 0.08},
                     {'at': 0.5, 'key': 'space', 'dur': 0.08}]}


def _kompass():
    """Ich-Sicht: Kompass in der Hand, Rechtsklick – das Menü mit allen Spielmodi."""
    return {'gamemode': 'adventure', 'aim': 40,
            'start': {'p': [0.5, Y, 18.0], 'yaw': 180, 'pitch': -5},
            'input': [{'at': 0.05, 'select': 'compass'}, {'at': 1.2, 'mouse': [700, 330], 'dur': 0.5},
                      {'at': 1.9, 'key': 'Escape'}],
            'clicks': [{'at': 0.3, 'button': 3, 'opens': True}]}


def _saison():
    """Gleiche Fahrt in jeder Saison: der Maibaum-Platz als Winter-Wunderland, Wiesn, Ostern, Halloween."""
    cam = [{'p': [-5.0, 75.0, 26.0], 'look': [0.5, 73.0, 0.5], 't': 0},
           {'p': [-13.0, 75.5, 22.0], 'look': [0.5, 73.5, 0.5], 't': 6.0, 'ease': 1}]
    return {'camera': cam}


def prep_saison():
    daytime('day')


def prep_nacht():
    daytime('night')


def _ende():
    """Nacht: Lichter am Markt, das Schloss angestrahlt – die Kamera steigt auf."""
    cam = [{'p': [7.0, 69.5, 10.0], 'look': [-2.0, 90.0, -100.0], 't': 0},
           {'p': [9.0, 80.0, 30.0], 'look': [-1.0, 90.0, -100.0], 't': 4.0},
           {'p': [14.0, 96.0, 50.0], 'look': [0.0, 88.0, -100.0], 't': 4.0, 'ease': 1}]
    return {'camera': cam}


SHOTS = [
    {'id': '01-intro', 'bars': 3, 'card': 'intro.png', 'cardAt': 0.5, 'spec': _intro},
    {'id': '02-ankunft', 'bars': 2, 'card': 'lt-ankunft.png', 'prep': prep_ankunft, 'spec': _ankunft},
    {'id': '03-figuren', 'bars': 2, 'card': 'lt-figuren.png', 'prep': prep_figuren, 'spec': _figuren},
    {'id': '04-klick', 'bars': 2, 'card': 'lt-klick.png', 'kind': 'ich', 'spec': _klick},
    {'id': '05-biergarten', 'bars': 1.5, 'card': 'lt-leute.png', 'prep': prep_biergarten, 'spec': _biergarten},
    {'id': '06-schlossmarkt', 'bars': 2, 'card': 'lt-schlossmarkt.png', 'prep': prep_schlossmarkt,
     'spec': _schlossmarkt},
    {'id': '07-treppe', 'bars': 2, 'card': 'lt-treppe.png', 'prep': prep_treppe, 'spec': _treppe},
    {'id': '08-launchpad', 'bars': 1.5, 'card': 'lt-launchpad.png', 'prep': prep_launchpad, 'spec': _launchpad},
    {'id': '09-brunnen', 'bars': 1.5, 'card': 'lt-brunnen.png', 'prep': prep_brunnen, 'spec': _brunnen},
    {'id': '10-festsaal', 'bars': 1.5, 'card': 'lt-festsaal.png', 'prep': prep_festsaal, 'spec': _festsaal},
    {'id': '11-jnr', 'bars': 2, 'card': 'lt-jnr.png', 'kind': 'ich', 'prep': prep_jnr, 'spec': _jnr,
     'after': lambda: rc(f'jnrauto {POV} aus')},
    {'id': '12-doppelsprung', 'bars': 1, 'card': 'lt-doppelsprung.png', 'kind': 'ich', 'spec': _doppelsprung},
    {'id': '13-kompass', 'bars': 1, 'card': 'lt-kompass.png', 'kind': 'ich', 'spec': _kompass},
    {'id': '14-winter', 'bars': 1, 'card': 'lt-winter.png', 'prep': prep_saison, 'spec': _saison},
    {'id': '15-wiesn', 'bars': 1, 'card': 'lt-wiesn.png', 'prep': prep_saison, 'spec': _saison},
    {'id': '16-ostern', 'bars': 1, 'card': 'lt-ostern.png', 'prep': prep_saison, 'spec': _saison},
    {'id': '17-halloween', 'bars': 1, 'card': 'lt-halloween.png', 'prep': prep_saison, 'spec': _saison},
    {'id': '18-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.35, 'prep': prep_nacht, 'spec': _ende},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == 'saison':
        saison(args[1])
    else:
        D.main(sys.modules[__name__], args)
