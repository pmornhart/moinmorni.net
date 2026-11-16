#!/usr/bin/env python3
"""Regie für den Morni-Party-Trailer: stellt die echte Partie für jede Einstellung ein und dreht sie.

  python3 regie.py <befehl> [...]
    shot <id> [...]        Einstellung(en) drehen (Partie-/Minispiel-Einstellungen nur mit laufender Partie)
    game1 | game2          Partie anlegen (Edelweiß-Jagd 20 Runden auf dem Schloss / Gipfelrennen auf der Alm)
    state                  Zustand der Partie
    quick                  einen Zug ohne Kamera spielen
Umgebung wie shot.py (MM_RCON, MM_RCON_PASS, MM_CAMERA, MM_DISPLAY), dazu ACTORS_FIFO (Datei für party-actors.cjs).
"""
import copy, json, math, os, random, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'trailers'))
import make  # noqa: E402
from shot import Rcon  # noqa: E402

T = make.load('party')
OUT = os.path.join(make.OUT, 'party')
FIFO = os.environ.get('ACTORS_FIFO', os.path.join(HERE, 'fifo.txt'))
NAMES = ['Anna', 'Bert', 'Clara', 'Dora']
rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
DIM = 'execute in minecraft:party run '


def say(*lines):
    with open(FIFO, 'a') as f:
        for line in lines:
            f.write(line + '\n')


def state():
    out = rc('mparty zustand')
    try:
        return json.loads(re.sub('§.', '', out))
    except ValueError:
        return {'games': []}


def game():
    g = state()['games']
    return g[0] if g else None


def wait(pred, timeout=60, step=0.15):
    end = time.time() + timeout
    while time.time() < end:
        g = game()
        if g and pred(g):
            return g
        time.sleep(step)
    raise SystemExit(f'Zeit abgelaufen: {pred}')


def pos(name):
    out = rc(f'data get entity {name} Pos')
    v = re.findall(r'(-?[\d.]+)d', out)
    return [float(x) for x in v[:3]]


def holds(name, item):
    out = rc(f'clear {name} minecraft:{item} 0')
    m = re.search(r'Found (\d+)', out)
    return int(m.group(1)) if m else 0


def shot_length(sid):
    info = make.music_info(OUT, T.STYLE)
    for s, L in zip(T.SHOTS, make.lengths(T, info)):
        if s['id'] == sid:
            return s, L
    raise SystemExit(f'unbekannt: {sid}')


def fill(obj, names):
    if isinstance(obj, dict):
        return {k: fill(v, names) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fill(v, names) for v in obj]
    if isinstance(obj, str):
        for k, v in names.items():
            obj = obj.replace('{' + k + '}', v)
    return obj


def film(s, L, spec, names=None):
    spec = make.fitted(spec, L + make.FADE + make.MARGIN) if spec.get('fit', True) else copy.deepcopy(spec)
    spec.pop('fit', None)
    spec = fill(spec, names or {})
    spec.setdefault('slow', float(os.environ.get('MM_SLOW', T.SLOW)))
    need = L + make.FADE + s.get('start', 0)
    have = make.spec_duration(spec) + spec.get('tail', 0.5)
    if have < need:
        print(f'  Achtung: {s["id"]} ist {have:.1f}s lang, gebraucht {need:.1f}s')
    sf = os.path.join(OUT, f"{s['id']}.json")
    json.dump(spec, open(sf, 'w'), indent=1)
    print(f"== {s['id']} ({L:.1f}s)", flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'party_shot.py'), sf, os.path.join(OUT, f"{s['id']}.mp4")], check=True)


# ------------------------------------------------------------------ Partie

def quick_turn():
    """Wer dran ist, würfelt sofort (normale Geschwindigkeit) – ohne Kamera."""
    g = wait(lambda x: x['phase'] in ('turn',) or x['phase'].startswith('mini'), 120)
    if g['phase'] != 'turn':
        return g
    cur, rnd = g['current'], g['round']
    rc(f'mparty wuerfel {cur} {random.choice([1, 2, 3])}')
    say(f'{cur} slot 0', f'{cur} use')
    return wait(lambda x: x['current'] != cur or x['round'] != rnd or x['phase'].startswith('mini') or x['phase'] == 'end', 60)


def setup_board(gm, g):
    cur = g['current']
    others = [p['name'] for p in g['players'] if p['name'] != cur and not p['left']]
    cmds = [f"mparty stand {gm['stand']}", f"mparty feld {cur} {gm['cur']}"]
    for name, f in zip(others, gm.get('others', [])):
        cmds.append(f'mparty feld {name} {f}')
    if 'taler' in gm:
        cmds.append(f"mparty taler {cur} {gm['taler']}")
    if 'item' in gm:
        cmds.append(f"mparty gegenstand {cur} {gm['item']}")
    if 'roll' in gm:
        cmds.append(f"mparty wuerfel {cur} {gm['roll']}")
    for c in cmds:
        print('  ', c, '→', re.sub('§.', '', rc(c)).strip()[:60])
    say(f'{cur} slot 0', f"all delay {gm.get('menuDelay', 1500)}")
    return cur, others


def board_shot(sid):
    s, L = shot_length(sid)
    gm = s['game']
    g = wait(lambda x: x['phase'] == 'turn' and x['board'] == gm['board'], 120)
    cur, others = setup_board(gm, g)
    time.sleep(1.5)
    film(s, L, s['spec'], {'cur': cur, 'other': others[0] if others else cur})
    say('all delay 1500')


# ------------------------------------------------------------------ Minispiele

def ring_walk(start, centre, radius, turn, speed, n=8, y=None):
    """Kreisbogen um die Mitte (vom Startplatz aus), Tempo in Blöcken/s."""
    a0 = math.atan2(start[2] - centre[2], start[0] - centre[0])
    pts = [start]
    for k in range(1, n + 1):
        a = a0 + turn * k / n
        r = radius(k / n) if callable(radius) else radius
        pts.append([centre[0] + math.cos(a) * r, y if y is not None else start[1], centre[2] + math.sin(a) * r])
    return T.walk(pts, speed)


def mini_actors(mini, c, names):
    """Wege und Handlungen der Darsteller ab ihrem echten Startplatz."""
    P = {n: pos(n) for n in names}
    # Startplätze wie im Plugin (MiniRun.spawns): Kreis um die Mitte – falls jemand verrutscht ist
    ring = {'heisse-brezn': 4.5, 'gipfelkoenig': 9.5, 'talerregen': 4.5, 'broeckelboden': 4.5}.get(mini)
    if ring:
        for i, n in enumerate(names):
            a = 2 * math.pi * i / len(names)
            want = [c[0] + math.cos(a) * ring, c[1] + 1, c[2] + math.sin(a) * ring]
            if math.dist(P[n], want) > 1.5:
                print(f'  {n} stand bei {P[n]}, setze auf {want}')
                P[n] = want
    actors, events = {}, []
    if mini == 'kuhglocke':
        for k, (n, at) in enumerate(zip(names, [0.35, 0.6, 0.8, 1.15])):
            events += [{'at': at, 'actor': n, 'act': 'swing'}, {'at': at + 0.02, 'actor': n, 'act': 'use'}]
    elif mini == 'scheibenschiessen':
        rnd = random.Random(5)
        for k, n in enumerate(names):
            p = P[n]
            path = [{'p': p, 't': 0, 'look': [c[0] + rnd.uniform(-6, 6), c[1] + 3.5, c[2] + 12]}]
            for j in range(6):
                path.append({'p': p, 't': 0.75, 'look': [c[0] + rnd.uniform(-6.5, 6.5), c[1] + rnd.uniform(2.5, 6.5), c[2] + rnd.uniform(9, 15)]})
            actors[n] = path
            for j in range(6):
                at = 0.5 + 0.75 * j + k * 0.17
                events += [{'at': at, 'actor': n, 'act': 'use'}]
    elif mini == 'broeckelboden':
        turns = [2.6, -2.4, 2.2, -2.6]
        for k, n in enumerate(names):
            p = P[n]
            r0 = math.dist([p[0], p[2]], [c[0], c[2]])
            actors[n] = ring_walk(p, c, lambda u, r0=r0, k=k: r0 + (2.5 if k % 2 else -1.0) * u, turns[k], 2.7, 14)
        # Die Letzte bleibt kurz stehen – der Boden bricht, sie fällt eine Etage tiefer und läuft dort weiter
        last = names[-1]
        p = P[last]
        q = [p[0] + 1.6, p[1], p[2] + 1.2]
        low = [q[0], q[1] - 8, q[2]]
        actors[last] = ([{'p': p, 't': 0}, {'p': q, 't': 0.8, 'hold': 0.55},
                         {'p': [q[0], q[1] - 0.7, q[2]], 't': 0.25}, {'p': [q[0], q[1] - 3.2, q[2]], 't': 0.3},
                         {'p': low, 't': 0.3}]
                        + T.walk([low, [c[0] + (c[0] - low[0]) * 0.3, low[1], c[2] + 2], [c[0] - 3, low[1], c[2] + 4]], 2.6)[1:])
    elif mini == 'heisse-brezn':
        holder = next((n for n in names if holds(n, 'bread') > 0), names[0])
        rest = [n for n in names if n != holder]
        victim, o1, o2 = rest[0], rest[1], rest[2]
        at = lambda x, z: [c[0] + x, c[1] + 1, c[2] + z]  # noqa: E731
        hp, vp, meet = at(-4, -2.5), at(1.5, 1.5), at(-0.3, 0.2)
        # Brezn-Halter läuft zum Opfer, gibt sie mit einem Schlag weiter; das Opfer rennt mit der Brezn davon.
        actors[holder] = T.walk([hp, meet], 3.4) + [{'p': meet, 't': 0.1, 'look': [vp[0], vp[1] + 1.4, vp[2]], 'hold': 0.5},
                                                     {'p': at(-2.5, -1.5), 't': 0.8}, {'p': at(-3, -3), 't': 0.6}]
        t_hit = math.dist(hp, meet) / 3.4 + 0.2
        actors[victim] = [{'p': vp, 't': 0, 'look': [meet[0], meet[1] + 1.6, meet[2]], 'hold': t_hit + 0.3}] + \
            T.walk([vp, at(3.5, -1), at(5, -4)], 3.8)[1:]
        actors[o1] = T.walk([at(-4, 4.5), at(-1, 5.5), at(1, 4.5)], 1.6)
        actors[o2] = T.walk([at(5, 4), at(3.5, 5.5), at(1.5, 6)], 1.4)
        events += [{'at': t_hit - 0.05, 'actor': holder, 'act': 'swing'}, {'at': t_hit, 'actor': holder, 'act': 'attack', 'arg': victim}]
        print('  Brezn:', holder, '→', victim)
    elif mini == 'gipfelkoenig':
        def level(x, z):
            d = max(abs(math.floor(x - c[0])), abs(math.floor(z - c[2])))
            return max(0, 4 - d // 2)

        def climb(p, end, speed, frac=1.0):
            out, steps = [{'p': p, 't': 0}], 24
            prev = p
            for k in range(1, steps + 1):
                u = k / steps * frac
                x, z = p[0] + (end[0] - p[0]) * u, p[2] + (end[2] - p[2]) * u
                y = c[1] + 1 + level(x, z)
                q = [x, y, z]
                d = math.dist([prev[0], prev[2]], [x, z])
                if y > prev[1]:
                    out.append({'p': [x, y + 0.45, z], 't': d / speed * 0.6})
                    out.append({'p': q, 't': d / speed * 0.4})
                else:
                    out.append({'p': q, 't': d / speed})
                prev = q
            return out
        top = [c[0] + 0.5, c[1] + 5, c[2] + 0.5]
        order = sorted(names, key=lambda n: math.dist(P[n], top))
        king = order[0]
        actors[king] = climb(P[king], [top[0] - 0.6, 0, top[2] - 0.2], 3.4) + [{'p': [top[0] - 0.6, top[1], top[2] - 0.2], 't': 0.1, 'hold': 2.2}]
        rival = order[1]
        r_path = climb(P[rival], [top[0] + 0.7, 0, top[2] + 0.5], 2.6, 1.0)
        actors[rival] = r_path + [{'p': [top[0] + 0.7, top[1], top[2] + 0.5], 't': 0.1, 'look': [top[0] - 0.6, top[1] + 1.4, top[2] - 0.2], 'hold': 2}]
        t_r = make.spec_duration({'camera': actors[rival][:-1]})
        events += [{'at': t_r + 0.2, 'actor': rival, 'act': 'swing'}, {'at': t_r + 0.22, 'actor': rival, 'act': 'attack', 'arg': king}]
        # Der König wird geschubst: ein Satz zurück, eine Stufe tiefer
        kp = actors[king]
        kp[-1]['hold'] = max(0.1, t_r + 0.3 - make.spec_duration({'camera': kp}) + kp[-1]['hold'])
        kp += [{'p': [top[0] - 1.8, top[1] + 0.5, top[2] - 1.0], 't': 0.18}, {'p': [top[0] - 2.6, top[1] - 1, top[2] - 1.5], 't': 0.22, 'hold': 2}]
        for n in order[2:]:
            actors[n] = climb(P[n], top, 2.2, 0.55)
    elif mini == 'talerregen':
        rnd = random.Random(7)
        for k, n in enumerate(names):
            p = P[n]
            pts = [p]
            for j in range(3):
                pts.append([c[0] + rnd.uniform(-7, 7), p[1], c[2] + rnd.uniform(-7, 7)])
            actors[n] = T.walk(pts, 4.0)
    return actors, events


def mini_shot(sid, play=True):
    s, L = shot_length(sid)
    mini = s['mini']
    c = list(T.MINI[mini])
    rc(f'mparty minispiel {mini}')
    if play:
        g = game()
        while not g['phase'].startswith('mini'):
            g = quick_turn()
    g = wait(lambda x: x['phase'] == 'mini' and x['mini'] == mini, 60, 0.05)
    names = [p['name'] for p in g['players'] if not p['left']]
    if mini == 'talerregen':
        time.sleep(2.0)
    elif mini == 'kuhglocke':
        end = time.time() + 20
        while time.time() < end and 'passed' not in rc(f'{DIM}execute if block {c[0]} {c[1] + 4} {c[2] + 7} minecraft:lime_wool'):
            time.sleep(0.05)
    elif mini == 'heisse-brezn':
        time.sleep(0.3)
    rc('tick rate 1')
    actors, events = mini_actors(mini, c, names)
    spec = copy.deepcopy(s['spec'])
    spec['actors'] = actors
    spec['events'] = sorted(spec.get('events', []) + events, key=lambda e: e['at'])
    film(s, L, spec)
    rc('tick rate 20')
    wait(lambda x: x['phase'] == 'turn' or x['phase'] == 'end', 120)


# ------------------------------------------------------------------ Partie anlegen

def new_game(board_slot, mode_slot):
    say(f'all rule Spielart {mode_slot}', f'all rule Spielbrett {board_slot}')
    for n in NAMES:
        say(f'{n} chat /mitspielen')
        time.sleep(0.6)
    time.sleep(1)
    for n in NAMES:
        say(f'{n} slot 2', f'{n} use')
        time.sleep(2.4)
        say(f'{n} slot 3', f'{n} use')
        time.sleep(2.4)
    print(re.sub('§.', '', rc('mparty start')))
    g = wait(lambda x: x['phase'] == 'turn', 30)
    print(json.dumps({k: g[k] for k in ('board', 'mode', 'current')}), [p['name'] for p in g['players']])


def main():
    cmd, *rest = sys.argv[1:]
    if cmd == 'state':
        print(json.dumps(game(), indent=1))
    elif cmd == 'quick':
        for _ in range(int(rest[0]) if rest else 1):
            print(quick_turn()['current'])
    elif cmd == 'game1':
        new_game(13, 16)
    elif cmd == 'game2':
        new_game(11, 10)
    elif cmd == 'game3':
        new_game(15, 12)
    elif cmd == 'shot':
        for sid in rest:
            s, L = shot_length(sid)
            if 'mini' in s:
                mini_shot(sid, play='--steh' not in rest)
            elif 'game' in s:
                board_shot(sid)
            else:
                film(s, L, s['spec'])


if __name__ == '__main__':
    main()
