"""ENTWURF (17.11., nicht fertig geschnitten – Philip: alte Fassung bleibt). Trailer: Duels (0.2.0) – Turnierhof, 20 Kampfarten in drei Gruppen, Klassisch mit Suppe, Axt und Schild, Sumo auf
dem Tanzboden, Brücke mit Toren, Labyrinth, Spleef, „Bester aus 3“, Party-Kämpfe und Ranglisten je Kampfart.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh duels 28100 …: Paper 26.1.2, MoinMorni Duels 0.2.0 aus
dem GitHub-Release, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards; config.yml mit einer
Kopie je Arena, Zeitlimit 1 Stunde). Alle Kämpfe sind echt: Die Darsteller (actors/regie.cjs, echte Physik) fordern
sich per /duel heraus, nehmen an und kämpfen mit echten Klicks (`kaempfe`), laufen ins Tor, durch den Irrgarten und
schaufeln den Schnee weg (`grabe`); Schaden, Rückstoß, Tore, Runden und Feuerwerk macht das Plugin. Der Aufnahme-Client
(Matzeee24) spielt „Bester aus 3“ in der Ich-Sicht selbst.

  python3 trailers/duels.py [einstellung …]          # drehen (ohne Angabe: alle)
  python3 make.py duels music|cards|sheet|cut|fertig

Vorher ein paar echte gewertete Kämpfe, damit die Ranglisten im Turnierhof gefüllt sind.
Videos zeigen echte Minecraft-Grafik: nur lokal (~/mm-cache/trailer/duels/). Gedrehte Einstellungen 01–10 liegen
unter ~/mm-cache/trailer/duels/neu-abgebrochen/ (11-rangliste und 12-ende noch nicht gelungen).
"""
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'duels'
STYLE = 'duels'
FILE = 'MoinMorni-Trailer-Duels.mp4'
SLOW = 12
DIM = 'minecraft:duels'
Y = 101  # Füße auf Turnierhof und Arenen
POV = os.environ.get('MM_CAMERA', 'Matzeee24')
KUNO, LENA, LUCHS, KATZE = 'RitterKuno11', 'Lena_Herbst05', 'NebelLuchs7', 'Neonkatze2'
YUKI, AMARA, LOTTE, JAY = 'Yuki_Tor10', 'AmaraSun08', 'lotte_rennt12', 'jay_beatz2'
ACTORS = [KUNO, LENA, LUCHS, KATZE, YUKI, AMARA, LOTTE, JAY]
# Arenen (Kopie 0): x = (Art + 1) · 1000
ALM, BURG, BERG, WIRT, TANZ, SCHNEE, IRR, KLAMM = (1000.5, 2000.5, 3000.5, 4000.5, 5000.5, 6000.5, 7000.0, 8000.5)
FAKE = '/home/user/mm-cache/servers/trailer-duels/plugins/MoinMorni/fake.properties'
PARTIES = {'zwei': f'party.{KUNO}={KUNO},{LENA}\nparty.{LUCHS}={LUCHS},{KATZE}\n',
           'vier': f'party.{YUKI}={YUKI},{AMARA},{LOTTE},{JAY}\n'}

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Duels',
     'text': '20 Kampfarten – 1 gegen 1, 2 gegen 2 und mit der ganzen Party'},
    {'file': 'lt-kampfarten.png', 'kind': 'lower', 'title': '20 Kampfarten',
     'text': 'Klassisch, Modern und Spaß – jede mit eigener Rangliste'},
    {'file': 'lt-klassisch.png', 'kind': 'lower', 'title': 'Klassisch', 'text': 'Kampf wie früher – Pilzsuppe heilt sofort'},
    {'file': 'lt-modern.png', 'kind': 'lower', 'title': 'Axt und Schild',
     'text': 'Modern: Kampf wie heute – dazu UHC, Tränke, Enderperlen …'},
    {'file': 'lt-sumo.png', 'kind': 'lower', 'title': 'Sumo', 'text': 'Kein Schaden – wer vom Tanzboden fällt, verliert'},
    {'file': 'lt-bruecke.png', 'kind': 'lower', 'title': 'Brücke',
     'text': 'Über die Klamm ins gegnerische Tor – drei Tore gewinnen'},
    {'file': 'lt-labyrinth.png', 'kind': 'lower', 'title': 'Labyrinth',
     'text': 'Jede Runde ein neuer Irrgarten – wer ist zuerst am Ziel?'},
    {'file': 'lt-spleef.png', 'kind': 'lower', 'title': 'Spleef', 'text': 'Schaufel den Schnee unter dem Gegner weg'},
    {'file': 'lt-runden.png', 'kind': 'lower', 'title': 'Bester aus 3 oder 5', 'text': 'Wer zuerst zwei Runden holt, gewinnt'},
    {'file': 'lt-party.png', 'kind': 'lower', 'title': 'Party-Kämpfe',
     'text': 'Party gegen Party, Jeder gegen jeden oder zwei Teams'},
    {'file': 'lt-rangliste.png', 'kind': 'lower', 'title': 'Gewertet',
     'text': 'Elo und Rangliste für jede Kampfart – locker geht auch'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Duels“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def x_of(name):
    p = D.pos(name)
    return p[0] if p else None


def parties(which):
    with open(FAKE, 'w') as f:
        f.write(PARTIES[which])


def reset(who=None):
    """Alle Darsteller zurück in den Turnierhof (laufende Kämpfe verlassen), normale Geschwindigkeit."""
    rc('tick rate 20')
    who = who or ACTORS
    for n in who:
        say(f'{n} stopp', f'{n} chat /verlassen')
    D.until(lambda: all(abs(x_of(n) or 999) < 60 for n in who), 40, 0.5, 'alle im Turnierhof')
    time.sleep(1.0)


def challenge(a, b, kit, *more, wait=4.0):
    """Echte Herausforderung: a fordert b heraus, b nimmt an; wartet, bis beide in der Arena sind (+ Countdown)."""
    for _ in range(3):
        say(f'{a} chat /duel {b} {kit} {" ".join(more)}'.rstrip())
        time.sleep(2.0)
        say(f'{b} chat /duel annehmen {a}')
        try:
            D.until(lambda: all((x_of(n) or 0) > 500 for n in (a, b)), 8, 0.4, f'Kampf {kit} startet')
            break
        except SystemExit:
            reset([a, b])
    else:
        raise SystemExit(f'Kampf {kit} startet nicht')
    time.sleep(wait)


def face_off(a, b, cx, cz, gap=3.0):
    """Beide nach dem Countdown in die Mitte der Arena stellen (Nord gegen Süd)."""
    at(f'tp {a} {cx} {Y} {cz - gap / 2} 0 0')
    at(f'tp {b} {cx} {Y} {cz + gap / 2} 180 0')
    time.sleep(0.5)


def sky():
    at('time set 6000')
    at('weather clear')


# ------------------------------------------------------------------ Einstellungen

def prep_intro():
    reset()
    sky()
    spots = {KUNO: (-6.5, 4.5, 90), LENA: (-4.0, 4.5, -90), LUCHS: (6.5, -2.5, 0), KATZE: (3.5, 9.5, 180),
             YUKI: (-9.5, -6.5, 0), AMARA: (9.5, 6.5, 135), LOTTE: (0.5, -8.5, 0), JAY: (2.0, -6.5, 90)}
    for n, (x, z, yaw) in spots.items():
        at(f'tp {n} {x} {Y} {z} {yaw} 0')
    time.sleep(1.5)


def _intro():
    cam = [{'p': [14, 128, 52], 'look': [0, 101, 0], 't': 0},
           {'p': [4, 117, 32], 'look': [0, 102, -2], 't': 4},
           {'p': [0.5, 106.8, 14.5], 'look': [0, 103, -6], 't': 4.2, 'ease': 1}]
    ev = [act(0.2, f'{KUNO} geh -1.5 {Y} 1.5 blick={LENA}'), act(0.4, f'{LENA} geh -3.0 {Y} 0.5 blick={KUNO}'),
          act(0.1, f'{LUCHS} geh 4.5 {Y} -9.5'), act(0.6, f'{KATZE} geh 2.5 {Y} 3.5 blick=kamera'),
          act(0.3, f'{YUKI} geh -6.5 {Y} -12.5'), act(0.8, f'{AMARA} geh 6.5 {Y} 1.5 blick={KATZE}'),
          act(1.2, f'{LOTTE} geh -2.5 {Y} -4.5'), act(2.5, f'{JAY} springe 2'), act(4.0, f'{KUNO} gruss 2')]
    return {'camera': cam, 'events': ev}


def prep_kampfarten():
    reset([KUNO, LENA])
    sky()
    rc(f'gamemode adventure {POV}')
    at(f'tp {POV} 0.5 {Y} 4.5 180 0')
    time.sleep(2)


def _kampfarten():
    """Ich-Sicht: Schwert = Kampf wählen – die Maus fährt über die drei Gruppen und bleibt auf Sumo stehen."""
    col = lambda c: 582 + 54 * c
    row = lambda r: 198 + 54 * r
    return {'gamemode': 'adventure', 'clear_chat': True, 'aim': 40,
            'start': {'p': [0.5, Y, 4.5], 'yaw': 180, 'pitch': 0},
            'input': [{'at': 0.05, 'select': 'sword'},
                      {'at': 0.5, 'mouse': [col(0), row(1)], 'dur': 0.3},
                      {'at': 0.85, 'mouse': [col(6), row(1)], 'dur': 0.7},
                      {'at': 1.6, 'mouse': [col(1), row(2)], 'dur': 0.6},
                      {'at': 2.3, 'mouse': [col(2), row(3)], 'dur': 0.5}],
            'clicks': [{'at': 0.25, 'button': 3, 'opens': True}]}


def prep_klassisch():
    reset([KUNO, LENA])
    sky()
    challenge(KUNO, LENA, 'klassisch', 'almwiese')
    face_off(KUNO, LENA, ALM, 0.5)
    for n in (KUNO, LENA):
        at(f'effect give {n} minecraft:resistance 60 2 true')
    at(f'damage {LENA} 6')


def _klassisch():
    cam = [{'p': [ALM + 4.0, 103.6, 3.5], 'look': [ALM, Y + 1, 0.5], 't': 0},
           {'p': [ALM + 3.6, 103.2, -1.5], 'look': [ALM, Y + 1, 0.5], 't': 4.8, 'ease': 1}]
    ev = [act(0.0, f'{KUNO} kaempfe {LENA} dauer=6 stil=klassisch cps=9'),
          act(0.0, f'{LENA} kaempfe {KUNO} dauer=1.3 stil=klassisch cps=9'),
          act(1.35, f'{LENA} nimm stew'), act(1.6, f'{LENA} use'),
          act(1.85, f'{LENA} kaempfe {KUNO} dauer=6 stil=klassisch cps=10 waffe=sword')]
    return {'camera': cam, 'follow': [KUNO, LENA], 'events': ev, 'fit': False}


def prep_modern():
    reset([KUNO, LENA])
    sky()
    challenge(LUCHS, KATZE, 'axt', 'burghof')
    face_off(LUCHS, KATZE, BURG, 8.5)
    for n in (LUCHS, KATZE):
        at(f'effect give {n} minecraft:resistance 60 2 true')


def _modern():
    cam = [{'p': [BURG - 3.5, 103.6, 12.0], 'look': [BURG, Y + 1, 8.5], 't': 0},
           {'p': [BURG - 2.5, 103.2, 5.5], 'look': [BURG, Y + 1, 8.5], 't': 4.8, 'ease': 1}]
    ev = [act(0.0, f'{LUCHS} kaempfe {KATZE} dauer=6 stil=modern krit=0.5 schild=0.4 waffe=axe'),
          act(0.0, f'{KATZE} kaempfe {LUCHS} dauer=6 stil=modern krit=0.4 schild=0.5 waffe=axe')]
    return {'camera': cam, 'follow': [LUCHS, KATZE], 'events': ev, 'fit': False}


def _sumo():
    """Sumo: echter Kampf in normaler Geschwindigkeit, bis einer an der Kante steht – dann Zeitlupe und die Kamera
    stellt sich passend hinter die Kante (die Einstellung entsteht erst jetzt)."""
    import math
    rc(f'gamemode spectator {POV}')
    at(f'tp {POV} {TANZ + 9} 106 9 facing {TANZ} {Y} 0.5')
    reset([LUCHS, KATZE, KUNO, LENA])
    sky()
    time.sleep(4)
    challenge(KUNO, LENA, 'sumo', wait=3.6)
    face_off(KUNO, LENA, TANZ, 0.5)
    at(f'item replace entity {KUNO} hotbar.0 with minecraft:stick[enchantments={{"minecraft:knockback":2}}]')
    time.sleep(0.5)
    say(f'{KUNO} kaempfe {LENA} dauer=60 stil=klassisch cps=6 waffe=stick', f'{LENA} kaempfe {KUNO} dauer=60 stil=klassisch cps=9')
    edge = {}

    def near_edge():
        for n in (KUNO, LENA):
            p = D.pos(n)
            if p and math.hypot(p[0] - TANZ, p[2] - 0.5) > 2.8:
                edge['p'] = p
                return True
        return False
    D.until(near_edge, 60, 0.05, 'Sumo an der Kante')
    rc(f'tick rate {20 / SLOW:g}')
    ex, _, ez = edge['p']
    a = math.atan2(ez - 0.5, ex - TANZ)
    c = lambda da, r, y: [TANZ + r * math.cos(a + da), y, 0.5 + r * math.sin(a + da)]
    look = [TANZ + 2.0 * math.cos(a), Y + 0.3, 0.5 + 2.0 * math.sin(a)]
    cam = [{'p': c(1.3, 10.5, 105.0), 'look': look, 't': 0},
           {'p': c(1.0, 9.5, 104.0), 'look': [look[0], Y - 0.5, look[2]], 't': 4.8, 'ease': 1}]
    return {'camera': cam, 'fit': False}


def prep_bruecke():
    reset([KUNO, LENA, LUCHS, KATZE])
    sky()
    challenge(LUCHS, KATZE, 'bruecke', wait=3.6)
    at(f'tp {LUCHS} {KLAMM} {Y} -7.5 0 0')
    at(f'tp {KATZE} {KLAMM + 3.5} {Y} 23.5 180 0')
    time.sleep(1)


def _bruecke():
    """Luchs (Blau) rennt über die Klammbrücke, Katze (Rot) stellt sich ihm in den Weg – kurzer Schlagabtausch, sie
    weicht, er springt ins rote Tor."""
    cam = [{'p': [KLAMM + 3.5, 106.0, -13.0], 'look': [KLAMM, Y + 1, -4.0], 't': 0},
           {'p': [KLAMM + 6.5, 107.5, 6.0], 'look': [KLAMM, Y + 0.5, 15.0], 't': 3.2},
           {'p': [KLAMM + 6.5, 106.5, 20.5], 'look': [KLAMM, Y - 1, 25.5], 't': 2.6, 'ease': 1},
           {'p': [KLAMM + 6.0, 106.3, 21.0], 'look': [KLAMM, Y - 1, 25.5], 't': 2.4}]
    ev = [act(0.0, f'{LUCHS} lauf {KLAMM} {Y} 25.5 genau=0.3'),
          act(0.3, f'{KATZE} blick {LUCHS}'),
          act(3.8, f'{KATZE} geh {KLAMM + 1.0} {Y} 21.0 blick={LUCHS}'),
          act(5.2, f'{KATZE} swing'), act(5.6, f'{KATZE} swing')]
    return {'camera': cam, 'events': ev, 'fit': False}


def maze_path(start, goal=(0, 0), r=18):
    """Weg durch den Irrgarten (er wächst jede Runde neu): Gänge per RCON abfragen (Kopfhöhe frei = Gang), dann
    Breitensuche von der Startecke bis zum Ziel in der Mitte. Ergebnis: Blockmitten (x, z) Schritt für Schritt."""
    free = {}
    for dx in range(-r, r + 1):
        for dz in range(-r, r + 1):
            x, z = int(IRR) + dx, dz
            free[(x, z)] = 'passed' in rc(f'execute in {DIM} if block {x} {Y + 1} {z} minecraft:air')
    sx, sz = int(start[0] // 1), int(start[2] // 1)
    gx, gz = int(IRR) + goal[0], goal[1]
    prev, todo = {(sx, sz): None}, [(sx, sz)]
    while todo:
        c = todo.pop(0)
        if abs(c[0] - gx) <= 1 and abs(c[1] - gz) <= 1:
            out = []
            while c:
                out.append(c)
                c = prev[c]
            return out[::-1]
        for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + d[0], c[1] + d[1])
            if free.get(n) and n not in prev:
                prev[n] = c
                todo.append(n)
    raise SystemExit('kein Weg durch den Irrgarten')


def run_maze(name, speed=5.0, keep=4.2):
    """Darsteller läuft den echten Weg durch den Irrgarten (geführte Bahn); gibt die Zeit bis zum Ziel zurück."""
    cells = maze_path(D.pos(name))
    pts = [f'{cells[0][0] + 0.5},{Y},{cells[0][1] + 0.5},0']
    for a_, b_ in zip(cells, cells[1:]):
        pts.append(f'{b_[0] + 0.5},{Y},{b_[1] + 0.5},{1 / speed:.3f}')
    say(f'{name} bahn ' + ' '.join(pts))
    return (len(cells) - 1) / speed


def prep_labyrinth():
    reset([LUCHS, KATZE])
    sky()
    challenge(YUKI, AMARA, 'labyrinth', wait=3.6)
    ty = run_maze(YUKI, 5.0)
    ta = run_maze(AMARA, 4.6)
    # so lange in normaler Geschwindigkeit, dass Yuki gegen Ende der Einstellung am Ziel ankommt
    time.sleep(max(0.0, ty - 5.0))
    rc(f'tick rate {20 / SLOW:g}')  # ab jetzt Zeitlupe – shot.py braucht noch ein paar Sekunden bis zur Aufnahme


def _labyrinth():
    cam = [{'p': [IRR + 7.0, 130.0, 14.0], 'look': [IRR, Y, 0.0], 't': 0},
           {'p': [IRR + 3.0, 121.0, 7.0], 'look': [IRR - 1.5, Y, -2.0], 't': 4.8, 'ease': 1}]
    return {'camera': cam, 'fit': False}


def prep_spleef():
    reset([YUKI, AMARA])
    sky()
    challenge(KUNO, LENA, 'spleef', wait=3.6)
    at(f'tp {KUNO} {SCHNEE} {Y} -6.5 0 0')
    say(f'{LENA} geh {SCHNEE} {Y} -3.5 genau=0.2 blick={KUNO}', f'{KUNO} blick {LENA}')
    time.sleep(2.5)


def _spleef():
    cam = [{'p': [SCHNEE + 5.0, 103.6, -1.5], 'look': [SCHNEE, Y - 0.5, -5.0], 't': 0},
           {'p': [SCHNEE + 3.8, 103.0, -3.0], 'look': [SCHNEE, Y - 1.0, -5.5], 't': 4.8, 'ease': 1}]
    x = int(SCHNEE - 0.5)
    ev = [act(0.2, f'{LENA} grabe {x} 100 -5'), act(0.7, f'{LENA} grabe {x + 1} 100 -5'),
          act(1.2, f'{LENA} grabe {x + 1} 100 -6'), act(1.7, f'{LENA} grabe {x - 1} 100 -6'),
          act(2.4, f'{LENA} grabe {x} 100 -7'), act(2.8, f'{LENA} grabe {x - 1} 100 -7'),
          act(0.5, f'{KUNO} grabe {x} 100 -3'), act(1.0, f'{KUNO} grabe {x - 1} 100 -3'), act(1.4, f'{KUNO} blick {LENA}')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_runden():
    """Matze fordert Kuno zu „Nur Schwert – Bester aus 3“ heraus (echter Chat im Client); Kuno hat wenig Leben."""
    reset([KUNO, LENA])
    sky()
    env = dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':93'))
    x = lambda *a: subprocess.run(['xdotool', *map(str, a)], env=env, check=True)
    D.close_pause_menu()
    if abs(x_of(POV) or 0) > 500:  # noch in einem Kampf vom letzten Versuch
        x('key', 't'); time.sleep(0.8); x('type', '--delay', 50, '/verlassen'); time.sleep(0.3); x('key', 'Return')
        D.until(lambda: abs(x_of(POV) or 999) < 60, 30, 0.5, 'Aufnahme-Client im Turnierhof')
    rc(f'gamemode adventure {POV}')
    at(f'tp {POV} 0.5 {Y} 4.5 180 0')
    time.sleep(1.5)
    x('key', 't'); time.sleep(0.8)
    x('type', '--delay', 50, f'/duel {KUNO} schwert almwiese 3'); time.sleep(0.3)
    x('key', 'Return'); time.sleep(1.5)
    say(f'{KUNO} chat /duel annehmen')
    D.until(lambda: all((x_of(n) or 0) > 500 for n in (KUNO, POV)), 25, 0.4, 'Bester aus 3 startet')
    IN_FIGHT[POV] = True
    time.sleep(4.2)
    me = D.pos(POV)
    d = 1 if me[2] < 0.5 else -1          # zur Mitte der Arena
    at(f'tp {POV} {me[0]} {Y} {me[2] + d * 9} {0 if d > 0 else 180} 0')
    at(f'tp {KUNO} {me[0] + 0.3} {Y} {me[2] + d * 13} {180 if d > 0 else 0} 0')
    time.sleep(0.6)
    at(f'damage {KUNO} 9')
    at(f'damage {POV} 13')


def _runden():
    return {'gamemode': 'adventure', 'aim': 70, 'clear_chat': True,
            'look': [{'at': 0.0, 'target': KUNO, 'height': 1.3}],
            'keys': [{'at': 0.0, 'key': 'w', 'dur': 1.2}],
            'clicks': [{'at': t, 'button': 1} for t in (0.7, 0.95, 1.2, 1.45, 1.7)],
            'events': [act(0.0, f'{KUNO} kaempfe {POV} dauer=3 stil=klassisch cps=8')]}


def prep_party():
    reset([KUNO, YUKI, AMARA, LOTTE, JAY])
    sky()
    parties('vier')
    time.sleep(0.5)
    four = (YUKI, AMARA, LOTTE, JAY)
    for _ in range(3):
        say(f'{YUKI} chat /partykampf klassisch wirtshausgarten')
        try:
            D.until(lambda: all((x_of(n) or 0) > 500 for n in four), 10, 0.4, 'Party-Kampf startet')
            break
        except SystemExit:
            reset(list(four))
    else:
        raise SystemExit('Party-Kampf startet nicht')
    time.sleep(3.8)
    for n, (x, z, yaw) in {YUKI: (WIRT - 3.6, 2.3, 0), AMARA: (WIRT - 3.6, 4.9, 180),
                           LOTTE: (WIRT + 4.4, 1.3, 0), JAY: (WIRT + 4.4, 3.9, 180)}.items():
        at(f'tp {n} {x} {Y} {z} {yaw} 0')
        at(f'effect give {n} minecraft:resistance 60 2 true')
    time.sleep(0.4)
    rc(f'tick rate {20 / SLOW:g}')  # Zeitlupe schon jetzt – shot.py braucht noch ein paar Sekunden bis zur Aufnahme
    say(f'{YUKI} kaempfe {AMARA} dauer=30 stil=klassisch', f'{AMARA} kaempfe {YUKI} dauer=30 stil=klassisch',
        f'{LOTTE} kaempfe {JAY} dauer=30 stil=klassisch', f'{JAY} kaempfe {LOTTE} dauer=30 stil=klassisch')
    time.sleep(1.0)


def _party():
    cam = [{'p': [WIRT + 0.5, 104.6, 13.5], 'look': [WIRT + 0.4, Y + 0.8, 3.0], 't': 0},
           {'p': [WIRT + 0.5, 103.6, 10.0], 'look': [WIRT + 0.4, Y + 0.9, 3.0], 't': 4.8, 'ease': 1}]
    return {'camera': cam, 'fit': False}


def prep_rangliste():
    reset([YUKI, AMARA, LOTTE, JAY])
    parties('zwei')
    sky()
    for n, (x, z) in {KUNO: (-3.5, -9.5), LENA: (-2.0, -10.5), LUCHS: (4.5, -10.0), KATZE: (6.0, -9.0)}.items():
        at(f'tp {n} {x} {Y} {z} 180 0')
    time.sleep(1)


def _rangliste():
    cam = [{'p': [-8.5, 108.4, -12.6], 'look': [-9.5, 108.3, -17.5], 't': 0},
           {'p': [9.5, 108.4, -12.6], 'look': [10.5, 108.3, -17.5], 't': 4.8, 'ease': 1}]
    ev = [act(0.1, f'{KUNO} blick -9.5 108 -17.5'), act(0.2, f'{LENA} blick 0.5 108 -17.5'),
          act(0.4, f'{LUCHS} blick 10.5 108 -17.5'), act(1.6, f'{KATZE} geh 2.5 {Y} -11.5 blick=0.5,108,-17.5')]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_ende():
    reset([KUNO, LENA, LUCHS, KATZE])
    sky()
    spots = {KUNO: (-1.6, 1.2), LENA: (1.2, 1.6), LUCHS: (-0.6, 2.6), KATZE: (2.6, 0.2), YUKI: (-2.8, -0.4),
             AMARA: (0.4, 3.4), LOTTE: (3.6, 2.4), JAY: (-3.6, 2.2)}
    for n, (x, z) in spots.items():
        at(f'tp {n} {x} {Y} {z} 180 0')
        say(f'{n} blick kamera')
    time.sleep(1.5)


def _ende():
    cam = [{'p': [6, 103.5, 9], 'look': [0.5, 102.5, 1.0], 't': 0},
           {'p': [4, 110, 15], 'look': [0, 103, 0], 't': 3.2},
           {'p': [8, 126, 46], 'look': [0, 103, -2], 't': 4.0, 'ease': 1}]
    ev = [act(t, f'{n} {w}') for t, n, w in [(0.4, KUNO, 'gruss 2'), (0.7, LENA, 'springe 1'), (1.0, YUKI, 'gruss 2'),
                                            (1.3, KATZE, 'springe 1'), (1.6, JAY, 'gruss 2'), (2.0, AMARA, 'springe 2')]]
    return {'camera': cam, 'events': ev}


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'prep': prep_intro, 'spec': _intro},
    {'id': '02-kampfarten', 'bars': 2, 'card': 'lt-kampfarten.png', 'kind': 'ich', 'prep': prep_kampfarten,
     'spec': _kampfarten},
    {'id': '03-klassisch', 'bars': 2, 'card': 'lt-klassisch.png', 'prep': prep_klassisch, 'spec': _klassisch},
    {'id': '04-modern', 'bars': 2, 'card': 'lt-modern.png', 'prep': prep_modern, 'spec': _modern},
    {'id': '05-sumo', 'bars': 2, 'card': 'lt-sumo.png', 'preload': 0, 'spec': _sumo},
    {'id': '06-bruecke', 'bars': 4, 'card': 'lt-bruecke.png', 'prep': prep_bruecke, 'spec': _bruecke},
    {'id': '07-labyrinth', 'bars': 2, 'card': 'lt-labyrinth.png', 'prep': prep_labyrinth, 'spec': _labyrinth},
    {'id': '08-spleef', 'bars': 2, 'card': 'lt-spleef.png', 'prep': prep_spleef, 'spec': _spleef},
    {'id': '09-runden', 'bars': 2, 'card': 'lt-runden.png', 'kind': 'ich', 'prep': prep_runden, 'spec': _runden},
    {'id': '10-party', 'bars': 2, 'card': 'lt-party.png', 'prep': prep_party, 'spec': _party},
    {'id': '11-rangliste', 'bars': 2, 'card': 'lt-rangliste.png', 'prep': prep_rangliste, 'spec': _rangliste},
    {'id': '12-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'prep': prep_ende, 'spec': _ende},
]


IN_FIGHT = {}


def before_camera():
    """Vor jeder Kamerafahrt: Spielmenü zu, den Aufnahme-Client aus einem laufenden Kampf nehmen."""
    D.close_pause_menu()
    if IN_FIGHT.pop(POV, False):
        say(f'{KUNO} chat /verlassen')  # Gegner aus „Bester aus 3“ – der Aufnahme-Client geht über den Chat
        env = dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':93'))
        for k in (['key', 't'], ['type', '--delay', '40', '/verlassen'], ['key', 'Return']):
            subprocess.run(['xdotool', *k], env=env)
            time.sleep(0.6)


if __name__ == '__main__':
    D.main(sys.modules[__name__], sys.argv[1:])
