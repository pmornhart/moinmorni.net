"""Trailer: Adlerflug – mit Flügeln durch Ringe in den Bergen: Absprung, Ich-Sicht mit Zeit und Tempo, bewegte Ringe,
Tore im Takt, Bonus-Ringe, die neuen Strecken Felsenlabyrinth und Höllenschlund, Strecke des Tages, Medaillen,
Party-Rennen.

Gedreht auf einem eigenen Test-Server (tools/trailer/server.sh adlerflug 28800 …: Paper 26.1.2, Morni Adlerflug 0.2.0
aus dem GitHub-Release, Test-Netzwerk aus test/fake-network des Modus, ViaVersion/ViaBackwards für den 26.3-Client,
Regie-Plugin `regie als <spieler> <befehl>` nur im Test-Server). Die Welt `minecraft:adlerflug` baut der Modus selbst.

Fliegen: Der Test-Autopilot des Modus (`/adleradmin fliege`) führt den Flieger Tick für Tick den Musterflug entlang –
Ringe, Zeit, Zwischenzeiten, Tempo und Ziel zählt das Plugin wie bei jedem Flug. In der Ich-Sicht fliegt so der
Aufnahme-Client selbst (mit Aktionsleiste), bei Kamerafahrten ein Darsteller ohne eigene Physik (`physik aus`, der
Server führt ihn). Für Einstellungen mitten in einer Strecke läuft der Flug erst in normaler Geschwindigkeit und geht
kurz vor der Stelle in Zeitlupe (`drehbuch.slow_when_near`). Beim Party-Rennen gleitet der Aufnahme-Client echt (ohne
Autopilot) neben einer Darstellerin.

  python3 trailers/adlerflug.py [einstellung …]       # vorbereiten + drehen
  python3 make.py adlerflug music|cards|sheet|cut       # Musik, Karten, Bildübersicht, Schnitt
"""
import json, math, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import drehbuch as D  # noqa: E402
from drehbuch import rc, say  # noqa: E402

NAME = 'adlerflug'
STYLE = 'adlerflug'
FILE = 'MoinMorni-Trailer-Adlerflug.mp4'
SLOW = 20
DIM = 'minecraft:adlerflug'
POV = os.environ.get('MM_CAMERA', 'Toni_Wandert11')
LENA, JAY, LOTTE, EWALD, RESI = 'Lena_Herbst05', 'jay_beatz2', 'lotte_rennt12', 'Ewald77', 'ResiBlume19'
OUT = os.path.join(os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer'), NAME)
SERVER = '/home/user/mm-cache/servers/trailer-adlerflug'

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Adlerflug',
     'text': 'Mit Flügeln durch Ringe in den Bergen – auf Zeit'},
    {'file': 'lt-absprung.png', 'kind': 'lower', 'title': 'Abheben', 'text': 'Von der Schanze ins Tal – die Flügel gehen von selbst auf'},
    {'file': 'lt-ringe.png', 'kind': 'lower', 'title': 'Durch die Ringe', 'text': 'Zeit, Ring und Tempo immer im Blick'},
    {'file': 'lt-klamm.png', 'kind': 'lower', 'title': 'Acht Strecken', 'text': 'Almwiesen, Klamm, Burgruine, Gletscher, Stollen …'},
    {'file': 'lt-bewegt.png', 'kind': 'lower', 'title': 'Bewegte Ringe', 'text': 'Sie gleiten und kreisen – triff sie, wo sie gerade sind'},
    {'file': 'lt-tor.png', 'kind': 'lower', 'title': 'Tore im Takt', 'text': 'Durch kommt nur, wer die Lücke trifft'},
    {'file': 'lt-bonus.png', 'kind': 'lower', 'title': 'Bonus-Ringe', 'text': 'Ein kleiner Umweg – und die Zeit wird kürzer'},
    {'file': 'lt-labyrinth.png', 'kind': 'lower', 'title': 'Neu: Felsenlabyrinth', 'text': 'Slalom um Felsnadeln und durch Felsbögen'},
    {'file': 'lt-schlund.png', 'kind': 'lower', 'title': 'Neu: Höllenschlund', 'text': 'Fallwind, Tor im Takt und eine stockdunkle Höhle'},
    {'file': 'lt-tag.png', 'kind': 'lower', 'title': 'Strecke des Tages', 'text': 'Jeden Tag neu: Richtung, Wind, Tageszeit, Wetter'},
    {'file': 'lt-ziel.png', 'kind': 'lower', 'title': 'Bestzeit und Medaillen', 'text': 'Von Bronze bis Steinadler – mit Bestenliste'},
    {'file': 'lt-rennen.png', 'kind': 'lower', 'title': 'Party-Rennen', 'text': 'Zusammen abspringen – wer ist zuerst im Ziel?'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Adlerflug“ anklicken'},
]

# ------------------------------------------------------------------ Strecken (Ringe aus /adleradmin strecke)

_courses = {}


def course(cid):
    if cid not in _courses:
        _courses[cid] = json.loads(rc(f'adleradmin strecke {cid}'))
    return _courses[cid]


def ring(cid, i):
    return course(cid)['rings'][i]


def at(c):
    return D.at(DIM, c)


def look_dir(p, q):
    dx, dy, dz = q[0] - p[0], q[1] - p[1], q[2] - p[2]
    return math.degrees(math.atan2(-dx, dz)), -math.degrees(math.atan2(dy, math.hypot(dx, dz)))


def act(t, line):
    name, what = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': what}


def cmd(t, c):
    return {'at': t, 'cmd': c}


def fresh_sky():
    at('time set 6000')
    at('weather clear')


# ------------------------------------------------------------------ Vorbereitungen

def ff_flight(who, cid, point, dist, extra=''):
    """`who` fliegt `cid` mit dem Autopiloten; kurz vor `point` (Abstand `dist`) geht es in Zeitlupe."""
    fresh_sky()
    rc('tick rate 20')
    if who != POV:
        say(f'{who} physik aus')
    rc(f'adleradmin start {who} {cid}')
    time.sleep(2.5)  # Chunks an der Schanze
    rc(f'adleradmin fliege {who} {extra}'.strip())
    D.slow_when_near(who, point, dist, SLOW, timeout=90)


def pov_ready():
    """Aufnahme-Client als Spieler (nicht mehr Zuschauer) – sonst nimmt ihn der Autopilot nicht."""
    rc('minecraft:spectate')
    rc('kill @e[tag=mmcam]')
    rc(f'gamemode adventure {POV}')


def prep_intro():
    fresh_sky()
    rc('tick rate 20')
    for n, (x, z) in {LENA: (-3.5, 9.5), JAY: (3.5, 10.5), EWALD: (-9.5, -6.5), RESI: (5.5, -8.5), LOTTE: (1.5, 13.5)}.items():
        say(f'{n} physik an')
        at(f'tp {n} {x} 151 {z} 180 0')
    time.sleep(1.0)


def prep_absprung():
    fresh_sky()
    rc('tick rate 20')
    say(f'{LENA} physik an')
    rc(f'adleradmin reset {LENA}')
    rc(f'adleradmin start {LENA} klammflug')
    time.sleep(3)
    rc(f'tick rate {20 / SLOW:g}')


def prep_race():
    fresh_sky()
    rc('tick rate 20')
    open(os.path.join(SERVER, 'plugins/MoinMorni/fake.properties'), 'w').write(f'party.{LENA}={LENA},{POV}\n')
    say(f'{LENA} physik an')
    for n in (LENA, POV):
        rc(f'regie als {n} adlerflug basislager')
    time.sleep(1.5)
    pov_ready()
    rc(f'regie als {LENA} adlerflug start almrundflug')  # Leitung wählt die Strecke → Einladung an die Party
    time.sleep(2.5)
    rc(f'tick rate {20 / SLOW:g}')


def after_race():
    open(os.path.join(SERVER, 'plugins/MoinMorni/fake.properties'), 'w').write('')
    rc('tick rate 20')


def prep_pov(cid, ring_i, dist, extra='', reset=False, day=None):
    def run():
        if day:
            rc(f'adleradmin tag {day}')
            time.sleep(3)
        pov_ready()
        rc(f'regie als {POV} adlerflug basislager')
        if reset:
            rc(f'adleradmin reset {POV}')
        time.sleep(1.5)
        target = course(cid)['bonus'][0]['c'] if ring_i == 'bonus' else ring(cid, ring_i)['c']
        ff_flight(POV, cid, target, dist, extra)
    return run


def before_camera():
    """Vor jeder Kamerafahrt: der Aufnahme-Client fliegt nicht mehr (sonst setzt ihn der Modus zurück)."""
    rc('tick rate 20')
    rc(f'regie als {POV} adlerflug basislager')
    time.sleep(1)


def prep_bot(who, cid, ring_i, dist, extra=''):
    def run():
        rc(f'regie als {who} adlerflug basislager')
        time.sleep(1)
        ff_flight(who, cid, ring(cid, ring_i)['c'], dist, extra)
    return run


def after_flight():
    rc('tick rate 20')


def after_day():
    rc('tick rate 20')
    rc('adleradmin tag heute')


# ------------------------------------------------------------------ Einstellungen

def flyby(cid, i, who, ahead=12.0, side=3.0, up=1.5):
    """Kamera hinter dem Ring (in Flugrichtung), schaut zurück; der Flieger kommt durch den Ring auf sie zu und
    zieht vorbei – die Kamera dreht mit (follow)."""
    r = ring(cid, i)
    c, n = r['c'], r['n']
    hx, hz = -n[2], n[0]
    hl = math.hypot(hx, hz) or 1
    p0 = [c[0] + n[0] * ahead + hx / hl * side, c[1] + up, c[2] + n[2] * ahead + hz / hl * side]
    p1 = [c[0] + n[0] * (ahead - 2) + hx / hl * (side + 1.5), c[1] + up + 0.5, c[2] + n[2] * (ahead - 2) + hz / hl * (side + 1.5)]
    return {'camera': [{'p': p0, 'look': c, 't': 0}, {'p': p1, 't': 4.5, 'ease': 1}], 'follow': [who]}


def chase(cid, i, who, dist, back=5.5, side=2.0, up=1.2):
    """Verfolgerkamera: hinter dem Flieger her, der gerade auf Ring i zufliegt (Start dort, wo er beim Wechsel in die
    Zeitlupe etwa ist)."""
    r = ring(cid, i)
    c, n = r['c'], r['n']
    p0 = [c[0] - n[0] * (dist + back), c[1] - n[1] * (dist + back) + up, c[2] - n[2] * (dist + back)]
    return {'camera': [{'p': p0, 'look': c, 't': 0}, {'p': p0, 't': 4.9}],
            'chase': {'who': who, 'back': back, 'side': side, 'up': up}}


def _intro():
    cam = [{'p': [0.5, 171.0, 46.0], 'look': [0.5, 150.0, -2.0], 't': 0},
           {'p': [0.5, 164.0, 28.0], 'look': [0.5, 152.0, -6.0], 't': 4.0},
           {'p': [0.5, 156.5, 14.5], 'look': [0.5, 153.5, -10.0], 't': 4.0, 'ease': 1}]
    ev = [act(0.2, f'{LENA} geh -12.5 151 -6.5 blick=-14,153,-9'), act(0.6, f'{JAY} geh 8.5 151 -11.0 blick=10,153,-13'),
          act(0.4, f'{LOTTE} geh 0.5 151 -13.5 blick=0,153,-17'), act(0.1, f'{EWALD} blick -16 153 -4'),
          act(1.5, f'{RESI} geh 4.0 151 -13.0 blick=5,153,-16'), act(4.6, f'{EWALD} gruss 2')]
    return {'camera': cam, 'events': ev}


def _absprung():
    """Lena läuft über die Schanze, der Autopilot übernimmt an der Linie – die Kamera fliegt hinter ihr her."""
    cam = [{'p': [1.6, 170.0, 390.0], 'look': [0.5, 168.8, 399.5], 't': 0}, {'p': [1.6, 170.0, 390.0], 't': 4.9}]
    ev = [act(0.1, f'{LENA} geh 0.5 168 399.9 genau=0.2'), act(1.3, f'{LENA} physik aus'),
          cmd(1.35, f'adleradmin fliege {LENA}')]
    return {'camera': cam, 'chase': {'who': LENA, 'back': 5.5, 'side': 1.4, 'up': 1.4, 'ease': 0.3}, 'events': ev,
            'fit': False}


def _race():
    """Ich-Sicht beim Party-Rennen: Lena steht in der Mitte, die Kamera daneben; 3 – 2 – 1 – Los! Lena fliegt mit dem
    Autopiloten, der Aufnahme-Client gleitet echt hinterher (Blick auf den ersten Ring)."""
    c = course('almrundflug')
    r0 = c['rings'][0]['c']
    line = c['line']
    return {'gamemode': 'adventure', 'aim': 40,
            'look': [{'at': 0.0, 'target': [line[0] + 8, line[1] + 0.6, line[2] + 1.2]},
                     {'at': 3.3, 'target': LENA, 'height': 0.8},
                     {'at': 4.3, 'target': [r0[0], r0[1] - 0.5, r0[2]]}],
            'events': [cmd(0.15, f'regie als {POV} adlerflug mitmachen'), cmd(3.42, f'adleradmin fliege {LENA}'),
                       act(3.40, f'{LENA} physik aus')]}


def _ende():
    cam = [{'p': [7.5, 156.0, 10.0], 'look': [0.5, 153.0, -10.0], 't': 0},
           {'p': [14.0, 174.0, 40.0], 'look': [0.5, 150.0, -4.0], 't': 3.5},
           {'p': [20.0, 194.0, 70.0], 'look': [0.5, 146.0, -6.0], 't': 3.5, 'ease': 1}]
    return {'camera': cam}


SHOTS = [
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'prep': prep_intro, 'spec': _intro},
    {'id': '02-absprung', 'bars': 2, 'card': 'lt-absprung.png', 'prep': prep_absprung, 'spec': _absprung,
     'after': after_flight},
    {'id': '03-ringe', 'bars': 4, 'card': 'lt-ringe.png', 'cardAt': 0.6, 'kind': 'ich', 'start': 0.4,
     'prep': prep_pov('almrundflug', 0, 70, reset=True), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '04-klamm', 'bars': 2, 'card': 'lt-klamm.png', 'prep': prep_bot(JAY, 'klammflug', 3, 48),
     'spec': lambda: chase('klammflug', 3, JAY, 48), 'after': after_flight},
    {'id': '05-bewegt', 'bars': 2, 'card': 'lt-bewegt.png', 'kind': 'ich',
     'prep': prep_pov('gipfelkreuz', 5, 42), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '06-tor', 'bars': 2, 'card': 'lt-tor.png', 'kind': 'ich',
     'prep': prep_pov('gletscherspalte', 5, 42), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '07-bonus', 'bars': 2, 'card': 'lt-bonus.png', 'kind': 'ich',
     'prep': prep_pov('klammflug', 'bonus', 40, 'bonus'), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '08-labyrinth', 'bars': 2, 'card': 'lt-labyrinth.png', 'prep': prep_bot(LOTTE, 'felsenlabyrinth', 6, 48),
     'spec': lambda: chase('felsenlabyrinth', 6, LOTTE, 48, side=3.0), 'after': after_flight},
    {'id': '09-schlund', 'bars': 2, 'card': 'lt-schlund.png', 'kind': 'ich',
     'prep': prep_pov('hoellenschlund', 6, 40), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '10-tag', 'bars': 2, 'card': 'lt-tag.png', 'kind': 'ich',
     'prep': prep_pov('tagesflug', 2, 45, day='2026-11-29'), 'spec': {'gamemode': 'adventure'}, 'after': after_day},
    {'id': '11-ziel', 'bars': 2, 'card': 'lt-ziel.png', 'kind': 'ich',
     'prep': prep_pov('klammflug', 10, 35, reset=True), 'spec': {'gamemode': 'adventure'}, 'after': after_flight},
    {'id': '12-rennen', 'bars': 2, 'card': 'lt-rennen.png', 'kind': 'ich', 'start': 1.2, 'prep': prep_race,
     'spec': _race, 'after': after_race},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.4, 'spec': _ende},
]

if __name__ == '__main__':
    D.main(sys.modules[__name__], sys.argv[1:])
