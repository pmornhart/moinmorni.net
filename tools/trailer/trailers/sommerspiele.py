"""UNFERTIG (17.11. auf Philips Wunsch abgebrochen): gedreht sind 01, 02, 04 (schwach), 06 (leer, Rennen schon vorbei –
jetzt starten die Selbstfahrer im Bild), 07; es fehlen 03, 05, 08, 09, 10 und der Schnitt.

Trailer: Sommerspiele – Sommerdorf am Bergsee, Almlauf (Heuballen, Bach, Moor, Kuhweide), Bogenschießen mit Wind
auf 20/35/50 Blöcke (auch in der Ich-Sicht), Ruderregatta mit Bojen-Toren und Strömung, Seifenkistenrennen auf
Schienen mit Weiche und Entgleisen, Medaillen und Siegerehrung.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh sommerspiele 28900 …: Paper 26.1.2, Morni Sommerspiele
0.1.0, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards, Regie-Plugin nur im Test-Server –
`regie als|halle|raus <spieler>`, Quelle im Cache ~/mm-cache/trailer/regie-modi/). config.yml des Test-Servers: kein
Start von selbst (Countdown 300 s, mindestens 12), Pause zwischen den Disziplinen 25 s, Siegerehrung 60 s, Almlauf
400 s, Bogen 90 s je Durchgang.

Gespielt wird echt: Die Darsteller laufen, rudern und fahren mit den Selbstfahrern des Modus (`/sommeradmin laufen`,
`fahren … ziel`, `fahren … auto steil|kehre`, `vollgas` – die Zeitnahme sieht es wie echt; mineflayer kann Boot und
Lore nicht selbst steuern) und schießen mit `/sommeradmin schiessen` (gezielter Pfeil, „daneben“ in Blöcken); der
Aufnahme-Client (Seppl19) schießt in der Ich-Sicht selbst mit dem Bogen.

Zwei Wettkämpfe: „wettkampf“ (alle vier) nur mit den Darstellern (02–04, 06, 07, 09) und „bogen“ mit Seppl (05, 08).
  python3 trailers/sommerspiele.py wettkampf     # Start (Seppl schaut zu)
  python3 trailers/sommerspiele.py bogen         # Start nur Bogenschießen mit Seppl
  python3 trailers/sommerspiele.py <einstellung …>
  python3 make.py sommerspiele music|cards|sheet|cut|fertig
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'sommerspiele'
STYLE = 'sommerspiele'
FILE = 'MoinMorni-Trailer-Sommerspiele.mp4'
SLOW = 15
DIM = 'minecraft:sommerspiele'
POV = os.environ.get('MM_CAMERA', 'Seppl19')
ACTORS = ['ResiBlume19', 'Matzeee24', 'Lena_Herbst05', 'Yuki_Tor10']
Y = 101
RANGE_X0, RANGE_DX, MAT_Z = -129, 6, 40     # Bogenplatz: Bahn 0 bei x −129, je 6 weiter, Matten bei z 40
PODIUM = (0.5, 101.0, -8.5)

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Sommerspiele',
     'text': 'Vier Disziplinen am Bergsee – 2 bis 12 Leute'},
    {'file': 'lt-almlauf.png', 'kind': 'lower', 'title': 'Almlauf', 'text': 'Massenstart über Heuballen, Bach, Moor und Kuhweide'},
    {'file': 'lt-almlauf2.png', 'kind': 'lower', 'title': 'Acht Kontrollpunkte', 'text': 'Wer zuerst über die Ziellinie kommt, gewinnt'},
    {'file': 'lt-bogen.png', 'kind': 'lower', 'title': 'Bogenschießen', 'text': '20, 35 und 50 Blöcke – und der Wind treibt ab'},
    {'file': 'lt-bogen-ich.png', 'kind': 'lower', 'title': 'Ins Gold', 'text': 'Die Pfeile fallen wie in Minecraft – Mitte zählt 10'},
    {'file': 'lt-regatta.png', 'kind': 'lower', 'title': 'Ruderregatta', 'text': 'Durch die Bojen-Tore – Strömung und Strudel inklusive'},
    {'file': 'lt-kiste.png', 'kind': 'lower', 'title': 'Seifenkistenrennen', 'text': 'Steilstück oder Kehren? Wer zu schnell ist, entgleist'},
    {'file': 'lt-medaillen.png', 'kind': 'lower', 'title': 'Gold, Silber, Bronze', 'text': 'Nach jeder Disziplin der Medaillenspiegel'},
    {'file': 'lt-sieger.png', 'kind': 'lower', 'title': 'Siegerehrung', 'text': 'Aufs Treppchen – mit Feuerwerk'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Sommerspiele“ anklicken'},
]


def at(c):
    return D.at(DIM, c)


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def status():
    """/sommeradmin status → {comp: {...}, stage: {...}, rows: {kind: {name: {...}}}}."""
    out = {'top': {}, 'comp': {}, 'stage': {}, 'rows': {}}
    for line in rc('sommeradmin status').split('\n'):
        kv = {}
        for part in line.strip().split(' '):
            k, _, v = part.partition('=')
            if v:
                kv[k] = v
        if 'bereit' in kv:
            out['top'] = kv
        elif 'wettkampf' in kv:
            out['comp'] = kv
        elif 'stage' in kv:
            out['stage'] = kv
        else:
            for key in ('r', 't', 'k', 'a', 'l'):
                if key in kv:
                    out['rows'].setdefault(key, {})[kv[key]] = kv
                    break
    return out


def wait_stage(cond, t=120, what=''):
    rc('tick rate 20')
    return D.until(lambda: cond(status()), t, 0.5, what)


def start(program, pov_in):
    rc('tick rate 20')
    if status()['top'].get('laeuft') == 'true':
        rc('sommeradmin stopp')
        time.sleep(6)
    at('time set 4000')
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
    rc(f'sommeradmin start {program}')


def wettkampf():
    start('wettkampf', pov_in=False)
    wait_stage(lambda s: s['comp'].get('disziplin') == 'almlauf' and s['stage'].get('phase') == 'COUNT', 40, 'Almlauf')


def bogen():
    start('bogen', pov_in=True)
    wait_stage(lambda s: s['comp'].get('disziplin') == 'bogen' and s['stage'].get('phase') == 'shoot', 60, 'Bogen')


# ------------------------------------------------------------------ Einstellungen

def _intro():
    at('time set 4000')
    cam = [{'p': [0.5, 134.0, 96.0], 'look': [0.5, 104.0, 0.0], 't': 0},
           {'p': [6.0, 118.0, 52.0], 'look': [2.0, 106.0, 4.0], 't': 3.8},
           {'p': [26.0, 110.0, 30.0], 'look': [80.0, 101.0, 30.0], 't': 3.8, 'ease': 1}]
    return {'camera': cam}


def _almlauf():
    """Massenstart: die Darsteller laufen los (Selbstläufer des Modus), die Kamera hinterher."""
    lead = ACTORS[0]
    ev = [act(0.0, f'{n} physik aus') for n in ACTORS]
    ev += [cmd(0.4 + 0.25 * i, f'sommeradmin laufen {n}') for i, n in enumerate(ACTORS)]
    p = D.pos(lead)
    cam = [{'p': [p[0] - 5.0, p[1] + 2.5, p[2] + 7.0], 'look': [p[0], p[1] + 1.0, p[2]], 't': 0},
           {'p': [p[0] - 5.0, p[1] + 2.5, p[2] + 7.0], 't': 5.7}]
    return {'camera': cam, 'chase': {'who': lead, 'back': 7, 'side': 3.0, 'up': 2.2, 'ease': 0.25}, 'events': ev,
            'fit': False}


def prep_almlauf():
    wait_stage(lambda s: s['stage'].get('phase') == 'RUN', 30, 'LOS')


def prep_almlauf2():
    """In normaler Geschwindigkeit weiterlaufen lassen, dann mitten im Lauf in die Zeitlupe."""
    rc('tick rate 20')
    time.sleep(9)


def _almlauf2():
    prep_almlauf2()
    lead = ACTORS[2]
    p = D.pos(lead)
    cam = [{'p': [p[0] + 4.0, p[1] + 3.0, p[2] + 6.0], 'look': [p[0], p[1] + 1.0, p[2]], 't': 0},
           {'p': [p[0] + 4.0, p[1] + 3.0, p[2] + 6.0], 't': 5.7}]
    return {'camera': cam, 'chase': {'who': lead, 'back': 6, 'side': -3.5, 'up': 2.0, 'ease': 0.25}, 'fit': False}


def prep_bogen():
    wait_stage(lambda s: s['comp'].get('disziplin') == 'bogen' and s['stage'].get('phase') == 'shoot', 300,
               'Bogenschießen')
    rc('sommeradmin wind 2')


def _bogen():
    """An der Schießlinie: alle vier schießen nacheinander, der Wind treibt ab."""
    prep_bogen()
    archers = status()['rows'].get('a', {})
    lanes = sorted(int(v.get('lane', 1)) - 1 for v in archers.values())
    x0 = RANGE_X0 + RANGE_DX * (lanes[0] if lanes else 0)
    cam = [{'p': [x0 + 22.0, 103.0, MAT_Z + 8.0], 'look': [x0 + 6.0, 102.6, MAT_Z + 1.0], 't': 0},
           {'p': [x0 + 20.0, 103.6, MAT_Z + 13.0], 'look': [x0 + 6.0, 102.6, MAT_Z + 4.0], 't': 5.7, 'ease': 1}]
    offs = ['0', '0.6', '-1.2', '0.3']
    ev = [cmd(0.6 + 1.1 * i, f'sommeradmin schiessen {n} {offs[i % 4]}') for i, n in enumerate(archers)]
    return {'camera': cam, 'events': ev, 'fit': False}


def prep_regatta():
    wait_stage(lambda s: s['comp'].get('disziplin') == 'regatta' and s['stage'].get('phase') == 'RUN', 400, 'Regatta')
    time.sleep(1)


def _regatta():
    prep_regatta()
    lead = ACTORS[1]
    p = D.pos(lead)
    cam = [{'p': [p[0] - 6.0, p[1] + 3.0, p[2] + 6.0], 'look': [p[0], p[1], p[2]], 't': 0},
           {'p': [p[0] - 6.0, p[1] + 3.0, p[2] + 6.0], 't': 7.6}]
    ev = [cmd(0.2 + 0.15 * i, f'sommeradmin fahren {n} ziel') for i, n in enumerate(ACTORS)]
    return {'camera': cam, 'chase': {'who': lead, 'back': 8, 'side': 4.5, 'up': 3.0, 'ease': 0.25}, 'events': ev,
            'fit': False}


def prep_kiste():
    wait_stage(lambda s: s['comp'].get('disziplin') == 'seifenkiste' and s['stage'].get('phase') == 'RUN', 400,
               'Seifenkiste')
    time.sleep(1)


def _kiste():
    prep_kiste()
    lead = ACTORS[1]
    p = D.pos(lead)
    cam = [{'p': [p[0] + 5.0, p[1] + 3.0, p[2] + 5.0], 'look': [p[0], p[1], p[2]], 't': 0},
           {'p': [p[0] + 5.0, p[1] + 3.0, p[2] + 5.0], 't': 7.6}]
    how = ['auto steil', 'vollgas kehre', 'auto kehre', 'auto kehre']
    ev = [cmd(0.2 + 0.1 * i, f'sommeradmin fahren {n} {how[i]}') for i, n in enumerate(ACTORS)]
    return {'camera': cam, 'chase': {'who': lead, 'back': 7, 'side': 3.5, 'up': 3.0, 'ease': 0.3}, 'events': ev,
            'fit': False}


def prep_sieger():
    wait_stage(lambda s: s['comp'].get('phase') == 'CEREMONY', 400, 'Siegerehrung')
    time.sleep(1)


def _sieger():
    prep_sieger()
    px, py, pz = PODIUM
    cam = [{'p': [px - 8.0, py + 3.0, pz + 11.0], 'look': [px, py + 2.0, pz], 't': 0},
           {'p': [px + 7.0, py + 3.5, pz + 10.0], 'look': [px, py + 2.5, pz], 't': 5.7, 'ease': 1}]
    ev = [act(1.0, f'{ACTORS[0]} springe 1'), act(1.6, f'{ACTORS[2]} gruss 2')]
    return {'camera': cam, 'events': ev}


def _bogen_ich():
    """Ich-Sicht an der eigenen Matte: Bogen spannen, zielen, loslassen – Treffer."""
    a = status()['rows'].get('a', {}).get(POV, {})
    lane = int(a.get('lane', 1)) - 1
    rnd = int(status()['stage'].get('round', 1)) - 1
    tz = MAT_Z + [20, 35, 50][rnd]
    tx = RANGE_X0 + RANGE_DX * lane + 0.5
    return {'gamemode': 'adventure', 'aim': 40, 'clear_chat': True,
            'input': [{'at': 0.1, 'select': 'bow'}],
            'look': [{'at': 0.0, 'target': [tx, 104.6 + 0.04 * (tz - MAT_Z), tz]}],
            'clicks': [{'at': 1.0, 'button': 3, 'dur': 1.6}, {'at': 3.6, 'button': 3, 'dur': 1.4}]}


def _medaillen():
    """Ich-Sicht nach dem letzten Durchgang: Platz, Medaille und Medaillenspiegel."""
    return {'gamemode': 'adventure', 'aim': 30, 'clear_chat': False}


def prep_medaillen():
    """Ohne Kamera: die anderen schießen daneben, Seppl trifft – bis das Bogenschießen gewertet ist."""
    rc('tick rate 20')
    rc('sommeradmin wind 0')
    end = time.time() + 400
    while time.time() < end:
        s = status()
        if s['comp'].get('phase') in ('BETWEEN', 'CEREMONY') or s['stage'].get('stage') != 'bogen':
            return
        if s['stage'].get('phase') == 'shoot':
            for n in s['rows'].get('a', {}):
                rc(f'sommeradmin schiessen {n} {0 if n == POV else 1.7}')
        time.sleep(1.0)


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': _intro},
    {'id': '02-almlauf', 'bars': 3, 'card': 'lt-almlauf.png', 'prep': prep_almlauf, 'spec': _almlauf},
    {'id': '03-almlauf2', 'bars': 3, 'card': 'lt-almlauf2.png', 'spec': _almlauf2},
    {'id': '04-bogen', 'bars': 3, 'card': 'lt-bogen.png', 'spec': _bogen},
    {'id': '05-bogen-ich', 'bars': 3, 'card': 'lt-bogen-ich.png', 'kind': 'ich', 'spec': _bogen_ich},
    {'id': '06-regatta', 'bars': 4, 'card': 'lt-regatta.png', 'spec': _regatta},
    {'id': '07-kiste', 'bars': 4, 'card': 'lt-kiste.png', 'spec': _kiste},
    {'id': '08-medaillen', 'bars': 2, 'card': 'lt-medaillen.png', 'kind': 'ich', 'prep': prep_medaillen,
     'spec': _medaillen},
    {'id': '09-sieger', 'bars': 3, 'card': 'lt-sieger.png', 'spec': _sieger},
    {'id': '10-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'spec': lambda: {
        'camera': [{'p': [0.5, 106.0, 12.0], 'look': [0.5, 106.0, -8.0], 't': 0},
                   {'p': [-10.0, 128.0, 60.0], 'look': [0.5, 104.0, 0.0], 't': 6.0, 'ease': 1}]}},
]


if __name__ == '__main__':
    args = sys.argv[1:]
    steps = {'wettkampf': wettkampf, 'bogen': bogen}
    if args and args[0] in steps:
        steps[args[0]]()
    else:
        D.main(sys.modules[__name__], args)
