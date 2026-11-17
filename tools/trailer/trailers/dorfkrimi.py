"""Trailer: Dorfkrimi – ein Wilderer im Dorf: Oberdorf bei Nacht und Vollmond, geheime Rolle beim Start, Spuren, der
Wilderer betäubt, Feder am Tatort, die Dienstmütze fällt und wird aufgehoben, Glocke und Dorfversammlung mit
Abstimmung, Festnahme, die Bank vor der Wirtschaft, Almwirtschaft im Nebel.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh dorfkrimi 28900 …: Paper 26.1.2, Morni Dorfkrimi 0.1.0,
Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards, Regie-Plugin nur im Test-Server –
`regie als|halle|raus <spieler>`, Quelle im Cache ~/mm-cache/trailer/regie-modi/). config.yml des Test-Servers: keine
Runde von selbst (mindestens-spieler 16), 30 Minuten, Schonzeit 2 s, Betäuben-/Festnahme-Pause 3 s, Spuren nur per
`/krimiadmin spur`, Versammlung ab Sekunde 2, Abstimmzeit 60 s, Nachspiel 60 s. Rollen gibt das Drehbuch mit
`/krimiadmin rolle` vor. Aufnahme-Client mit Helligkeit 1.0 (client.sh … gamma:1.0), damit die Nacht lesbar bleibt.

Alles Spielgeschehen ist echt: Der Wilderer (Darsteller) betäubt mit dem Schlafpulver, der Gendarm nimmt mit der
Dienstmütze fest, Darsteller läuten die Glocke und stimmen im Stimmzettel ab; der Aufnahme-Client (Seppl19) ist in
Runde A der Gendarm und spielt in der Ich-Sicht.

  python3 trailers/dorfkrimi.py runde-a          # Runde A (Oberdorf, Seppl Gendarm, Matze Wilderer) – vor 02-rolle
  python3 trailers/dorfkrimi.py runde-b          # Runde B (Almwirtschaft, ohne Kamera) – vor 05-muetze, 10-alm
  python3 trailers/dorfkrimi.py <einstellung …>
  python3 make.py dorfkrimi music|cards|sheet|cut|fertig
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'dorfkrimi'
STYLE = 'dorfkrimi'
FILE = 'MoinMorni-Trailer-Dorfkrimi.mp4'
SLOW = 15
DIM = 'minecraft:dorfkrimi'
POV = os.environ.get('MM_CAMERA', 'Seppl19')
ACTORS = ['ResiBlume19', 'HanniHof', 'Ewald77', 'Matzeee24', 'Lena_Herbst05', 'Yuki_Tor10', 'jay_beatz2', 'EllaSommer7']
WILDERER = 'Matzeee24'
OB, ALM = 1000, 2000   # Mitte der Karten (x); Oberdorf: Platz bei z 0, Alm: Wiese bei z 4. Man steht auf y 101.
Y = 101
BELL = (OB + 13, 103, -5)          # Glocke am Rathaus (Osten)
BENCH_X = OB - 13                  # Bank vor dem Gasthaus „Zur Post“ (Westen), Blick zum Platz
CHURCH = (OB, 112, -34)
ALM_BELL = (ALM + 10, 103, 4)     # Almglocke auf der Wiese

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Dorfkrimi',
     'text': 'Ein Wilderer im Dorf – wer ist es? 4 bis 16 Leute'},
    {'file': 'lt-rolle.png', 'kind': 'lower', 'title': 'Geheime Rollen', 'text': 'Wilderer, Gendarm oder Dorf – das weißt nur du'},
    {'file': 'lt-spur.png', 'kind': 'lower', 'title': 'Spuren', 'text': 'Jede Spur verrät etwas über die Tracht des Wilderers'},
    {'file': 'lt-betaeubt.png', 'kind': 'lower', 'title': 'Der Wilderer', 'text': 'Schlafpulver – am Tatort bleibt eine Feder'},
    {'file': 'lt-muetze.png', 'kind': 'lower', 'title': 'Die Dienstmütze', 'text': 'Falsch festgenommen? Wer sie aufhebt, ist der neue Gendarm'},
    {'file': 'lt-glocke.png', 'kind': 'lower', 'title': 'Dorfversammlung', 'text': 'Wer die Glocke läutet, ruft alle zusammen'},
    {'file': 'lt-abstimmen.png', 'kind': 'lower', 'title': 'Abstimmen', 'text': 'Wer wird festgenommen – oder lieber abwarten?'},
    {'file': 'lt-festnahme.png', 'kind': 'lower', 'title': 'Festnahme!', 'text': 'Mit der Dienstmütze – hoffentlich den Richtigen'},
    {'file': 'lt-bank.png', 'kind': 'lower', 'title': 'Auf der Bank', 'text': 'Wer schläft, plaudert vor der Wirtschaft – ganz ohne Blut'},
    {'file': 'lt-alm.png', 'kind': 'lower', 'title': 'Almwirtschaft im Nebel', 'text': 'Zwei Karten: Oberdorf bei Nacht und die Hochalm'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Dorfkrimi“ anklicken'},
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


def status(karte):
    """/krimiadmin status → {phase, hats: {id: [...]}, players: {Name: (rolle, zustand)}}."""
    for line in rc('krimiadmin status').split('\n'):
        if not line.startswith(f'karte={karte} '):
            continue
        out = {'players': {}, 'hats': {}}
        for part in line.split(' '):
            k, _, v = part.partition('=')
            if k.startswith('muetze'):
                out['hats'][k[6:]] = v.split(':')
            elif v.count(':') >= 8:  # Spieler (Namen dürfen klein anfangen)
                f = v.split(':')
                out['players'][k] = (f[0], f[1] if len(f) > 1 else f[0])
            else:
                out[k] = v
        return out
    return {}


def night():
    """Nacht mit Vollmond (Tag 0) – um 15000 steht der Mond schräg im Osten über dem Dorf."""
    at('time set 15000')
    at('weather clear')


def stop_round(karte):
    rc('tick rate 20')
    if status(karte).get('phase'):
        rc(f'krimiadmin stopp {karte}')
        time.sleep(6)


def to_hall(pov_in):
    for k in ('oberdorf', 'almwirtschaft'):
        stop_round(k)
    for n in ACTORS:
        rc(f'regie halle {n}')
        say(f'{n} physik an', f'{n} stopp')
    if pov_in:
        rc(f'gamemode adventure {POV}')
        rc(f'regie halle {POV}')
    else:
        rc(f'regie raus {POV}')
        rc(f'gamemode spectator {POV}')


def runde_a():
    """Alle an die Dorflinde, Rollen vorgeben – gestartet wird in der Einstellung 02-rolle (Ich-Sicht)."""
    to_hall(pov_in=True)
    rc(f'krimiadmin rolle {POV} gendarm')
    rc(f'krimiadmin rolle {WILDERER} wilderer')
    for n in ACTORS:
        if n != WILDERER:
            rc(f'krimiadmin rolle {n} dorf')
    night()


def runde_b():
    """Almwirtschaft ohne Kamera: Lena ist Gendarm, Matze Wilderer."""
    to_hall(pov_in=False)
    rc(f'krimiadmin rolle Lena_Herbst05 gendarm')
    rc(f'krimiadmin rolle {WILDERER} wilderer')
    for n in ACTORS:
        if n not in (WILDERER, 'Lena_Herbst05'):
            rc(f'krimiadmin rolle {n} dorf')
    rc('krimiadmin start almwirtschaft')
    time.sleep(1)
    rc('krimiadmin vorspulen los almwirtschaft')
    D.until(lambda: status('almwirtschaft').get('phase') == 'PLAY', 20, 0.5, 'Runde läuft')
    at('time set 23300')
    time.sleep(2)


def los_a():
    rc('krimiadmin vorspulen los oberdorf')
    D.until(lambda: status('oberdorf').get('phase') == 'PLAY', 20, 0.5, 'Runde läuft')
    time.sleep(2)


# ------------------------------------------------------------------ Einstellungen

def _intro():
    """Vom Vollmond hinab ins Oberdorf: Laternen, Dorfplatz mit Brunnen, Kirchturm."""
    night()
    cam = [{'p': [OB - 70.0, 128.0, 5.0], 'look': [OB + 0.0, 170.0, 0.0], 't': 0},
           {'p': [OB - 52.0, 121.0, 4.5], 'look': [OB + 0.0, 116.0, 0.0], 't': 2.6},
           {'p': [OB - 22.0, 108.0, 3.0], 'look': [OB + 0.5, 103.0, -2.0], 't': 5.4, 'ease': 1}]
    return {'camera': cam}


def _rolle():
    """Ich-Sicht an der Dorflinde: die Runde startet, man steht auf dem Dorfplatz – „Du bist der Gendarm!“."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True,
            'events': [cmd(0.3, 'krimiadmin start oberdorf')],
            'look': [{'at': 1.4, 'target': [OB + 0.5, 106, -20]}]}


def _spur():
    """Ich-Sicht (Gendarm): zur leuchtenden Spur am Brunnen – „Hinweis!“ mit einem Stück Tracht."""
    tp('Ewald77', OB + 6.5, 7.5, 0)
    time.sleep(1.0)
    rc('krimiadmin spur Ewald77')
    tp('Ewald77', OB + 14.5, 14.5, 0)
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': True,
            'start': {'p': [OB + 6.5, Y, 1.5], 'yaw': 0, 'pitch': 30},
            'look': [{'at': 0.0, 'target': [OB + 6.5, 101.0, 7.5]}],
            'keys': [{'at': 0.4, 'key': 'w', 'dur': 1.3}]}


def _betaeubt():
    """Der Wilderer schleicht sich von hinten an Ewald heran – Schlafpulver, er schläft ein, eine Feder bleibt liegen."""
    tp('Ewald77', OB + 4.5, 5.5, 135)
    tp(WILDERER, OB + 10.5, 10.5, 135)
    say('Ewald77 blick 1000.5 102.5 0.5', 'Ewald77 leerlauf aus')
    cam = [{'p': [OB + 0.5, 102.9, 10.5], 'look': [OB + 5.5, 101.8, 6.0], 't': 0},
           {'p': [OB + 1.5, 102.5, 9.5], 'look': [OB + 4.8, 101.0, 5.8], 't': 4.4, 'ease': 1}]
    ev = [act(0.0, f'{WILDERER} slot 0'), act(0.2, f'{WILDERER} geh {OB + 5.7} {Y} 6.7 genau=0.3 blick=Ewald77'),
          act(1.9, f'{WILDERER} attack Ewald77'), act(2.2, f'{WILDERER} attack Ewald77'),
          act(3.3, f'{WILDERER} geh {OB + 14.5} {Y} 12.5'), act(4.0, 'Ewald77 leerlauf an')]
    return {'camera': cam, 'events': ev}


def _glocke():
    """Almwirtschaft: Yuki läutet die Almglocke – alle kommen in den Kreis auf der Wiese (Kamera nicht in der Runde,
    sonst ginge bei ihr der Stimmzettel auf)."""
    bx, by, bz = ALM_BELL
    tp('Yuki_Tor10', bx - 1.5, bz + 0.5, -90)
    cam = [{'p': [bx - 7.0, 104.0, bz + 6.0], 'look': [bx, 103.5, bz], 't': 0},
           {'p': [ALM - 4.0, 108.0, bz + 12.0], 'look': [ALM + 0.5, 101.5, 4.0], 't': 4.4, 'ease': 1}]
    ev = [act(0.0, f'Yuki_Tor10 blick {bx + 0.5} {by + 0.5} {bz + 0.5}'),
          act(0.6, f'Yuki_Tor10 klick {bx} {by} {bz} west')]
    return {'camera': cam, 'events': ev}


def _abstimmen():
    """Ich-Sicht: Stimmzettel auf, mit der Maus über die Köpfe, Stimme für den mit der passenden Tracht."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': False,
            'events': [cmd(0.3, f'regie als {POV} abstimmen')],
            'clicks': [{'at': 3.0, 'button': 1}],
            'input': [{'at': 0.8, 'mouse': VOTE_MOUSE[0], 'dur': 0.7}, {'at': 1.8, 'mouse': VOTE_MOUSE[1], 'dur': 0.7},
                      {'at': 4.2, 'key': 'Escape'}]}


VOTE_MOUSE = [[692, 276], [638, 276]]   # aus dem Bild: dritter Kopf, dann Matze (zweiter)


def _festnahme():
    """Ich-Sicht (Gendarm): zum Verdächtigen, Dienstmütze in der Hand – Festnahme, der Wilderer ist gefasst."""
    return {'gamemode': 'adventure', 'aim': 45, 'clear_chat': True,
            'look': [{'at': 0.0, 'target': WILDERER, 'height': 1.4}],
            'keys': [{'at': 0.2, 'key': '1', 'dur': 0.1}, {'at': 0.3, 'key': 'w', 'dur': 1.0}],
            'clicks': [{'at': 1.6, 'button': 1}, {'at': 2.0, 'button': 1}]}


def prep_festnahme():
    p = D.pos(WILDERER)
    at(f'tp {POV} {p[0] - 3.5} {Y} {p[2]} -90 0')
    say(f'{WILDERER} stopp', f'{WILDERER} blick {POV}')
    time.sleep(1.5)


def _bank():
    """Almwirtschaft: wer betäubt wurde, sitzt auf der Bank vor der Wirtschaft (die Kamera ist nicht in der Runde –
    für die Wachen sind die Schläfer unsichtbar)."""
    cam = [{'p': [ALM - 9.0, 102.6, -6.0], 'look': [ALM - 6.5, 101.8, -12.0], 't': 0},
           {'p': [ALM - 3.0, 102.4, -6.5], 'look': [ALM - 5.0, 101.8, -12.0], 't': 4.6, 'ease': 1}]
    return {'camera': cam}


def stun_more():
    """Ohne Kamera: der Wilderer betäubt noch zwei – damit die Bank voller wird."""
    for victim in ('ResiBlume19', 'jay_beatz2'):
        p = D.pos(victim)
        if not p:
            continue
        at(f'tp {WILDERER} {p[0] + 1.2} {p[1]} {p[2]} 90 0')
        time.sleep(1.0)
        say(f'{WILDERER} slot 0', f'{WILDERER} attack {victim}')
        time.sleep(1.5)
        say(f'{WILDERER} attack {victim}')
        time.sleep(4)


def _muetze():
    """Almwirtschaft: der Gendarm nimmt Hanni fest – falsch! Er ist blamiert, die Mütze bleibt liegen, Yuki hebt sie auf."""
    st = status('almwirtschaft')
    gendarm = st['hats'].get('0', ['Lena_Herbst05'])[0]
    victim = next(n for n, (role, state) in st['players'].items()
                  if role == 'dorf' and state == 'awake' and n not in (gendarm, 'Yuki_Tor10', POV))
    for i, n in enumerate(n for n, (role, state) in st['players'].items()
                          if state == 'awake' and n not in (gendarm, victim, 'Yuki_Tor10', POV)):
        tp(n, ALM - 22 + 3 * i, 22.5, 180)
    tp(gendarm, ALM - 2.6, 16.5, -90)
    tp(victim, ALM - 0.8, 16.5, 90)
    tp('Yuki_Tor10', ALM + 4.5, 21.5, 90)
    say(f'{victim} leerlauf aus', f'{victim} blick {gendarm}')
    cam = [{'p': [ALM - 1.2, 104.2, 11.0], 'look': [ALM - 1.8, 101.3, 16.5], 't': 0},
           {'p': [ALM - 2.6, 103.8, 11.6], 'look': [ALM - 2.2, 101.0, 16.5], 't': 4.4, 'ease': 1}]
    ev = [act(0.0, f'{gendarm} slot 0'), act(0.0, f'{gendarm} blick {victim}'), act(0.5, f'{gendarm} attack {victim}'),
          act(0.9, f'{gendarm} attack {victim}'), act(1.2, f'{victim} geh {ALM + 3.5} {Y} 15.5'),
          act(2.3, f'Yuki_Tor10 lauf {ALM - 2.1} {Y} 16.5'), act(3.6, 'Yuki_Tor10 springe 1')]
    return {'camera': cam, 'events': ev}


def _alm():
    """Die Almwirtschaft im Morgengrauen: Nebelschwaden um die Leute, Kapelle, Almglocke."""
    at('time set 23300')
    for i, n in enumerate(['Ewald77', 'Matzeee24', 'EllaSommer7']):
        tp(n, ALM - 6 + 4 * i, 14.5 - i, 180)
    cam = [{'p': [ALM + 0.5, 118.0, 44.0], 'look': [ALM + 0.5, 104.0, 4.0], 't': 0},
           {'p': [ALM - 10.0, 107.0, 22.0], 'look': [ALM - 2.0, 103.0, -4.0], 't': 4.6, 'ease': 1}]
    ev = [act(0.2 + 0.3 * i, f'{n} geh {ALM - 4 + 3 * i} {Y} {6 - i}') for i, n in enumerate(['Ewald77', 'Matzeee24', 'EllaSommer7'])]
    return {'camera': cam, 'events': ev}


def _ende():
    night()
    cam = [{'p': [OB + 0.5, 106.0, 7.0], 'look': [OB + 0.5, 102.0, 0.0], 't': 0},
           {'p': [OB + 0.5, 126.0, 38.0], 'look': [OB + 25.0, 128.0, -6.0], 't': 6.0, 'ease': 1}]
    return {'camera': cam}


SHOTS = [
    {'id': '01-intro', 'bars': 3, 'card': 'intro.png', 'cardAt': 0.5, 'spec': _intro},
    {'id': '02-rolle', 'bars': 2, 'start': 1.0, 'card': 'lt-rolle.png', 'cardAt': 2.6, 'kind': 'ich', 'spec': _rolle},
    {'id': '03-spur', 'bars': 2, 'card': 'lt-spur.png', 'kind': 'ich', 'spec': _spur},
    {'id': '04-betaeubt', 'bars': 2, 'card': 'lt-betaeubt.png', 'spec': _betaeubt},
    {'id': '05-muetze', 'bars': 2, 'card': 'lt-muetze.png', 'spec': _muetze},
    {'id': '06-glocke', 'bars': 2, 'card': 'lt-glocke.png', 'spec': _glocke},
    {'id': '07-abstimmen', 'bars': 2, 'card': 'lt-abstimmen.png', 'kind': 'ich', 'spec': _abstimmen},
    {'id': '08-festnahme', 'bars': 2, 'card': 'lt-festnahme.png', 'kind': 'ich', 'prep': prep_festnahme,
     'spec': _festnahme},
    {'id': '09-bank', 'bars': 2, 'card': 'lt-bank.png', 'spec': _bank},
    {'id': '10-alm', 'bars': 2, 'card': 'lt-alm.png', 'spec': _alm},
    {'id': '11-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'spec': _ende},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    steps = {'runde-a': runde_a, 'runde-b': runde_b, 'los-a': los_a, 'mehr-betaeuben': stun_more}
    if args and args[0] in steps:
        steps[args[0]]()
    else:
        D.main(sys.modules[__name__], args)
