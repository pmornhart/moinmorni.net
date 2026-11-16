"""Regie-Hilfen für den Burgverlies-Trailer: Abstieg starten, vorspulen, Darsteller stellen.

Umgebung wie shot.py: MM_RCON, MM_RCON_PASS, MM_ACTORS_FIFO (Datei, die bv-actors.cjs per `tail -F` liest).
"""
import json, math, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from shot import Rcon  # noqa: E402

DIM = 'minecraft:burgverlies'
ACTORS = ['Anna', 'Bert', 'Clara', 'Dora']
_rc = None


def rc(cmd):
    global _rc
    if _rc is None:
        _rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    return re.sub('§.', '', _rc(cmd))


def say(*lines):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        for line in lines:
            f.write(line + '\n')


def dbg(name='Anna'):
    out = rc(f'bvadmin debug {name}')
    try:
        return json.loads(out.strip())
    except ValueError:
        return {'run': None}


def wait(pred, timeout=30, step=0.25, what=''):
    end = time.time() + timeout
    while time.time() < end:
        v = pred()
        if v:
            return v
        time.sleep(step)
    raise SystemExit(f'Zeit abgelaufen: {what or pred}')


def tp(name, p, yaw=None, pitch=0):
    r = f' {yaw:.1f} {pitch:.1f}' if yaw is not None else ''
    rc(f'execute in {DIM} run tp {name} {p[0]:.3f} {p[1]:.3f} {p[2]:.3f}{r}')


def pos(name):
    v = re.findall(r'(-?[\d.]+)d', rc(f'data get entity {name} Pos'))
    return [float(x) for x in v[:3]] if len(v) >= 3 else None


def leave_all():
    """Alle aus dem Abstieg zurück ins Torhaus."""
    for n in ACTORS:
        say(f'{n} sneak off')
        if dbg(n).get('run'):
            say(f'{n} chat /verlassen')
    wait(lambda: all(dbg(n).get('run') is None for n in ACTORS), 20, what='alle draußen')
    wait(lambda: '0/' in rc('bvadmin info'), 20, what='Verlies frei')


def start_run():
    leave_all()
    for n in ACTORS:
        rc(f'effect clear {n}')
    out = rc('bvadmin start Anna normal')
    print(' ', out.strip())
    d = wait(lambda: (lambda x: x if x.get('stage') == 'PLAYING' and len(x['heroes']) == 4 else None)(dbg()), 60,
             what='Abstieg startet')
    hearty()
    return d


def hearty():
    """Darsteller halten Treffer aus (Hinfallen geht nur mit „out_of_world“-Schaden)."""
    for n in ACTORS:
        rc(f'effect give {n} resistance infinite 4 true')
        rc(f'effect give {n} saturation infinite 4 true')


def solve(d):
    if d['cur']['phase'] != 'CLEARED':
        rc('bvadmin loesen Anna')
        wait(lambda: dbg()['cur']['phase'] == 'CLEARED', 10, what='Raum gelöst')


def step(d):
    """Einen Raum weiter (bzw. eine Etage tiefer an der Treppe der Krämerstube)."""
    solve(d)
    d = dbg()
    if d['cur']['type'] == 'SHOP':
        fl = d['floor']
        s = d['cur']['stairs']
        for i, n in enumerate(ACTORS):
            if d['heroes'][n]['state'] == 'UP':
                tp(n, [s[0] + (i - 1.5) * 0.6, s[1], s[2]])
        wait(lambda: dbg()['floor'] == fl + 1, 20, what='nächste Etage')
    else:
        nxt = d['next']
        for n in ACTORS:
            tp(n, nxt['entry'])
        wait(lambda: dbg()['room'] == nxt['i'], 10, what=f"Raum {nxt['id']}")
    time.sleep(0.3)
    return dbg()


def advance(floor, room, cleared=True):
    """Abstieg bis zu Raum `room` auf Etage `floor` bringen (Raum geschafft, wenn `cleared`)."""
    d = dbg()
    if d.get('run') is None or (d['floor'], d['room']) > (floor, room) or d['stage'] != 'PLAYING':
        d = start_run()
    for _ in range(40):
        if (d['floor'], d['room']) == (floor, room):
            if cleared:
                solve(d)
            return dbg()
        d = step(d)
    raise SystemExit('vorspulen klappt nicht')


def room_at(floor, room):
    """Raum betreten (alle Darsteller an den Eingang stellen) – das Spiel startet ihn."""
    d = advance(floor, room - 1)
    return step(d)
