"""Beweis-Clip für die neuen Darsteller (tools/trailer/actors): echte Physik in Zeitlupe, eigene Skins und Namen,
natürlicher Kopf, Wege, Truhe, Brücke, Kampf – dazu eine Ich-Sicht mit Anzeige und eine Kamerafahrt.

Gedreht auf einer Kopie des Wolkenkampf-Test-Servers (Port 26110, RCON 26210; Wolkenhafen bei 0|0, Wolkenalm bei
x 1000, eigene Welt minecraft:wolkenkampf). In der Kopie startet keine Runde von selbst (mindestens-spieler 99).
Der Aufnahme-Client heißt wie ein Darsteller (POV, Standard Toni_Wandert11) – so trägt sein Arm in der Ich-Sicht den
eigenen Skin; bei Kamerafahrten schaut er unsichtbar zu.

  tail -n0 -F $MM_ACTORS_FIFO | node ../actors/regie.cjs 127.0.0.1 26110 <ACTORS …>     # Darsteller
  python3 darsteller-demo.py runde             # Runde auf der Wolkenalm starten, Gondeln öffnen, Inseln merken
  python3 darsteller-demo.py <einstellung …>   # vorbereiten + drehen (01-ankunft vor der Runde!)
  python3 darsteller-demo.py schnitt           # zusammenschneiden + Kontaktbogen

Umgebung wie bei shot.py: MM_RCON, MM_RCON_PASS, MM_CAMERA (= POV), MM_DISPLAY, MM_ACTORS_FIFO.
Videos zeigen echte Minecraft-Grafik: nur lokal (/home/user/mm-cache/trailer/darsteller-demo/).
"""
import json, math, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, '..')
OUT = os.path.join(os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer'), 'darsteller-demo')
DIM = 'minecraft:wolkenkampf'
SLOW = float(os.environ.get('MM_SLOW', 12))
POV = os.environ.get('MM_CAMERA', 'Toni_Wandert11')
JAY, LENA, YUKI, LUCHS, KIKI = 'jay_beatz2', 'Lena_Herbst05', 'Yuki_Tor10', 'NebelLuchs7', 'Neonkatze2'
ACTORS = [JAY, LENA, YUKI, LUCHS, KIKI]
O = 1000.0
RUNDE = os.path.join(OUT, 'runde.json')

sys.path.insert(0, TOOLS)
_rc = None


def rc(c):
    global _rc
    if _rc is None:
        from shot import Rcon
        _rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    return re.sub('§.', '', _rc(c))


def at(c):
    return rc(f'execute in {DIM} run {c}')


def say(*lines):
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        for line in lines:
            f.write(line + '\n')


def ev(t, line):
    """Ereignis für regie.cjs zur Spielzeit t (Zeile „Name befehl …“)."""
    name, act = line.split(' ', 1)
    return {'at': t, 'actor': name, 'act': act}


def cmd(t, c):
    return {'at': t, 'cmd': f'execute in {DIM} run {c}'}


def status():
    for line in rc('wolkenkampf status').split('\n'):
        if line.startswith('karte=wolkenalm'):
            return dict(part.split('=', 1) for part in line.split(' ') if '=' in part)
    return None


def islands():
    try:
        return json.load(open(RUNDE))
    except (OSError, ValueError):
        return {}


def isl(name):
    r = islands()[name]
    return r['x'] + 0.5, r['z'] + 0.5, r['floor'] + 1


def outward(name):
    r = islands()[name]
    x, z = r['x'] - O, r['z']
    d = math.hypot(x, z) or 1
    return x / d, z / d


def tough(*names):
    for n in names:
        rc(f'effect give {n} minecraft:resistance infinite 2 true')
        rc(f'effect give {n} minecraft:regeneration infinite 1 true')
        rc(f'effect give {n} minecraft:saturation infinite 0 true')


# ------------------------------------------------------------------ Runde

def start_round():
    if status():
        rc('wolkenkampf stopp wolkenalm')
        for _ in range(40):
            if not status():
                break
            time.sleep(1)
        time.sleep(3)
    rc(f'gamemode adventure {POV}')
    print(rc('wolkenkampf start wolkenalm allein'))
    s = None
    for _ in range(20):
        s = status()
        if s:
            break
        time.sleep(0.5)
    out = {}
    for n in ACTORS + [POV]:
        team = s[n].split(':')[1][1:]
        isl_, x, z, fy, gy = map(int, s['team' + team].split(':'))
        out[n] = {'island': isl_, 'x': x, 'z': z, 'floor': fy, 'gondola': gy}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(RUNDE, 'w'), indent=1)
    print(json.dumps(out))
    time.sleep(6)
    rc('wolkenkampf vorspulen oeffnen wolkenalm')
    time.sleep(12)  # sanft hinunterschweben
    tough(*ACTORS, POV)
    rc('wolkenkampf vorspulen 100 wolkenalm')  # Uhr der Runde zurück: kein Nachschub/Gewitter während des Drehs
    for n in ACTORS:
        rc(f'give {n} minecraft:oak_planks 24')
        rc(f'give {n} minecraft:iron_sword')


# ------------------------------------------------------------------ Einstellungen

def _arrival():
    """Wolkenhafen: fünf Spieler kommen an, grüßen sich, einer rennt und springt; Kamera fährt langsam zurück."""
    starts = {JAY: (0.5, 13.5), LENA: (2.2, 14.6), YUKI: (-1.4, 15.6), KIKI: (1.4, 12.0), LUCHS: (-2.4, 4.6)}
    goals = {JAY: (0.2, 5.4), LENA: (1.6, 6.5), YUKI: (-1.0, 7.0), KIKI: (2.2, 8.6)}
    setup = [f'execute in {DIM} run tp {n} {x} 101 {z} {0 if n == LUCHS else 180} 0' for n, (x, z) in starts.items()]
    events = [ev(0.15, f'{JAY} geh {goals[JAY][0]} 101 {goals[JAY][1]} blick={LUCHS}'),
              ev(0.45, f'{LENA} geh {goals[LENA][0]} 101 {goals[LENA][1]} blick={JAY}'),
              ev(0.05, f'{YUKI} lauf {goals[YUKI][0]} 101 {goals[YUKI][1]} blick={LUCHS}'),
              ev(0.6, f'{KIKI} geh {goals[KIKI][0]} 101 {goals[KIKI][1]} blick=kamera'),
              ev(0.0, f'{LUCHS} blick {JAY}'),
              ev(1.4, f'{YUKI} springe 1'),
              ev(2.6, f'{LUCHS} gruss 3'), ev(3.0, f'{JAY} gruss 2'),
              ev(2.2, f'{LENA} chat hey :)'), ev(3.4, f'{YUKI} chat na, eine Runde?'),
              ev(3.8, f'{LUCHS} blick frei'), ev(4.1, f'{KIKI} springe 1')]
    # von Osten, zwischen Ankerkette (2|2) und Bank (4|8): die Ankommenden kommen von links ins Bild
    cam = [{'p': [6.9, 102.6, 4.6], 'look': [-0.6, 101.8, 7.6], 't': 0},
           {'p': [6.0, 102.3, 5.3], 'look': [-0.4, 101.7, 6.6], 't': 5.2, 'ease': 1}]
    return {'kind': 'kamera', 'setup': setup, 'camera': cam, 'events': events, 'fit': False}


def chest_of(name, side=1):
    """Start-Truhe auf der Insel (wie MapLayout): Blockecke (x, y, z)."""
    r = islands()[name]
    x, z = r['x'] - O, r['z']
    ox, oz = outward(name)
    px, pz = -oz, ox
    return int(O + x + round(ox * 2 + px * side * 3)), r['floor'] + 1, int(z + round(oz * 2 + pz * side * 3))


def _pov():
    """Ich-Sicht: zur Truhe gehen, öffnen, Dinge herausnehmen (Umschalt-Klick), Schwert nehmen, zu den anderen schauen."""
    x, z, fy = isl(POV)
    cx, cy, cz = chest_of(POV, 1)
    ox, oz = outward(POV)
    start = [x - ox * 1.0, fy, z - oz * 1.0]
    yaw0 = math.degrees(math.atan2(-(cx + 0.5 - start[0]), cz + 0.5 - start[2]))
    setup = [f'execute in {DIM} run item replace block {cx} {cy} {cz} container.13 with minecraft:iron_sword',
             f'clear {POV}']
    return {'kind': 'ich', 'setup': setup, 'start': {'p': start, 'yaw': yaw0, 'pitch': 18}, 'duration': 5.6,
            'keys': [{'at': 0.25, 'key': 'w', 'dur': 0.55}],
            'look': [{'at': 0.0, 'target': [cx + 0.5, cy + 0.4, cz + 0.5]},
                     {'at': 3.9, 'target': JAY}],
            'clicks': [{'at': 1.25, 'button': 3, 'opens': True}],
            'chest': {'at': 1.75, 'block': [cx, cy, cz], 'step': 0.32},
            'after_chest': [{'key': 'Escape'}, {'select': 'sword|_axe'}],
            'chat_at': [ev(4.3, f'{YUKI} chat gl hf'), ev(4.9, f'{LENA} chat brücke kommt ^^')]}


def edge_of(name, d):
    """Abstand (Blöcke) vom Inselmittelpunkt bis zum letzten Block in Richtung d (Bodenhöhe)."""
    r = islands()[name]
    edge = 1
    for k in range(1, 12):
        if 'passed' in at(f"execute if block {r['x'] + d[0] * k} {r['floor']} {r['z'] + d[1] * k} minecraft:air").lower():
            break
        edge = k
    return edge


def _bridge():
    """Lena steht an der Kante, dreht sich um, schleicht rückwärts hinaus und setzt Brett für Brett – Kamera seitlich."""
    x, z, fy = isl(LENA)
    ox, oz = outward(LENA)
    d = (int(-math.copysign(1, ox)), 0) if abs(ox) > abs(oz) else (0, int(-math.copysign(1, oz)))
    name = {(1, 0): 'ost', (-1, 0): 'west', (0, 1): 'sued', (0, -1): 'nord'}[d]
    r = islands()[LENA]
    # Bretter früherer Versuche wegräumen (vor dem Messen der Kante)
    at(f"fill {r['x'] + d[0]} {r['floor']} {r['z'] + d[1]} {r['x'] + d[0] * 24} {r['floor']} {r['z'] + d[1] * 24} "
       "minecraft:air replace minecraft:oak_planks")
    edge = edge_of(LENA, d)
    clear = []
    st = [x + d[0] * (edge - 1.6), fy, z + d[1] * (edge - 1.6)]
    yaw = {(1, 0): -90, (-1, 0): 90, (0, 1): 0, (0, -1): 180}[d]
    setup = clear + [f'execute in {DIM} run tp {LENA} {st[0]:.2f} {fy} {st[2]:.2f} {yaw} 10']
    side = int(os.environ.get('MM_DEMO_SEITE', '-1'))  # auf welcher Seite der Brücke die Kamera steht
    sx, sz = -d[1] * side, d[0] * side
    e0 = [x + d[0] * (edge + 0.5), fy, z + d[1] * (edge + 0.5)]  # Kante
    # Kamera vorne seitlich auf der Insel: Lenas Gesicht, dahinter die Brücke über der Leere
    cam = [{'p': [e0[0] + sx * 3.4 - d[0] * 3.2, fy + 2.0, e0[2] + sz * 3.4 - d[1] * 3.2],
            'look': [e0[0] + d[0] * 0.6, fy + 0.5, e0[2] + d[1] * 0.6], 't': 0},
           {'p': [e0[0] + sx * 3.9 - d[0] * 2.0, fy + 1.5, e0[2] + sz * 3.9 - d[1] * 2.0],
            'look': [e0[0] + d[0] * 2.2, fy + 0.1, e0[2] + d[1] * 2.2], 't': 5.4, 'ease': 1}]
    events = [ev(0.25, f'{LENA} bruecke {name} 6 material=planks'), ev(0.0, f'{LENA} blick kamera')]
    return {'kind': 'kamera', 'setup': setup, 'camera': cam, 'events': events, 'fit': False}


def _fight():
    """Jayden gegen Yuki auf Jaydens Insel: seitwärts ausweichen, W-Tap, Sprung-Kritische, Rückstoß."""
    x, z, fy = isl(JAY)
    ox, oz = outward(JAY)
    a = [x - ox * 1.5 + oz * 1.2, fy, z - oz * 1.5 - ox * 1.2]
    b = [x - ox * 1.5 - oz * 1.2, fy, z - oz * 1.5 + ox * 1.2]
    setup = [f'execute in {DIM} run tp {JAY} {a[0]:.2f} {fy} {a[2]:.2f}',
             f'execute in {DIM} run tp {YUKI} {b[0]:.2f} {fy} {b[2]:.2f}']
    c = [(a[0] + b[0]) / 2, fy, (a[2] + b[2]) / 2]
    cam = []
    sign = float(os.environ.get('MM_DEMO_KAMPF', '1'))  # Seite der Kamerafahrt (−1 = gespiegelt)
    for i, (ang, t) in enumerate([(50 * sign, 0), (22 * sign, 3.0), (-4 * sign, 3.0)]):
        r = math.radians(ang)
        px, pz = -oz, ox
        dx, dz = -ox * math.cos(r) + px * math.sin(r), -oz * math.cos(r) + pz * math.sin(r)
        cam.append({'p': [c[0] + dx * 5.6, fy + 2.1 - i * 0.2, c[2] + dz * 5.6], 't': t, **({'ease': 1} if i == 2 else {})})
    events = [ev(0.1, f'{JAY} kaempfe {YUKI} dauer=5.6 krit=0.55 waffe=sword'),
              ev(0.25, f'{YUKI} kaempfe {JAY} dauer=5.6 krit=0.35 waffe=sword')]
    return {'kind': 'kamera', 'setup': setup, 'camera': cam, 'follow': [JAY, YUKI], 'events': events, 'fit': False}


SHOTS = {'01-ankunft': _arrival, '02-ich': _pov, '03-bruecke': _bridge, '04-kampf': _fight}

# Schnitt: Ausschnitt (Start, Länge in s) je Einstellung, Bauchbinde, Endkarte am Schluss
CUT = {'01-ankunft': (0.3, 4.6), '02-ich': (0.5, 5.0), '03-bruecke': (0.2, 4.9), '04-kampf': (0.4, 5.2)}
CARDS = [
    {'file': 'lt-ankunft.png', 'kind': 'lower', 'title': 'Echte Spieler?', 'text': 'Eigene Skins, eigene Namen, echte Physik'},
    {'file': 'lt-ich.png', 'kind': 'lower', 'title': 'Ich-Sicht', 'text': 'Mit Anzeige, eigenem Arm und echten Klicks'},
    {'file': 'lt-bruecke.png', 'kind': 'lower', 'title': 'Brücke bauen', 'text': 'Geduckt an die Kante, Brett für Brett'},
    {'file': 'lt-kampf.png', 'kind': 'lower', 'title': 'Kämpfen', 'text': 'Ausweichen, W-Tap, Sprung-Kritische'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Wolkenkampf“ anklicken'},
]
CARD_OF = {'01-ankunft': 'lt-ankunft.png', '02-ich': 'lt-ich.png', '03-bruecke': 'lt-bruecke.png', '04-kampf': 'lt-kampf.png'}


# ------------------------------------------------------------------ Drehen

def chest_clicks(block, t0, step):
    """Klicks für alle belegten Truhenplätze (Umschalt + Klick) – Bildschirm 1600×900, GUI-Größe 3."""
    slots = []
    for i in range(27):  # einzeln abfragen: lange Antworten kürzt der Server mit „…“
        raw = at(f'data get block {block[0]} {block[1]} {block[2]} Items[{i}]')
        m = re.search(r'Slot:\s*(\d+)b', raw)
        if not m:
            break
        slots.append(int(m.group(1)))
    slots.sort()
    gui = 3
    left, top = (1600 // gui - 176) // 2, (900 // gui - 168) // 2
    out = []
    t = t0
    for s in slots[:6]:
        r, c = divmod(s, 9)
        sx, sy = (left + 8 + c * 18 + 8) * gui, (top + 18 + r * 18 + 8) * gui
        out.append({'at': t, 'mouse': [sx, sy], 'dur': step * 0.6})
        out.append({'at': t + step * 0.7, 'shiftclick': 1})
        t += step
    return out, t


def record(sid):
    os.makedirs(OUT, exist_ok=True)
    spec = SHOTS[sid]()
    kind = spec.pop('kind')
    spec.setdefault('slow', SLOW)
    spec['dim'] = DIM
    if status():  # Uhr der Runde zurück: kein Nachschub, Gewitter oder Nebel mitten im Dreh
        rc('wolkenkampf vorspulen 100 wolkenalm')
        at('weather clear')
        at('time set 6000')
        tough(*ACTORS, POV)
    for c in spec.pop('setup', []):
        rc(c)
    out = os.path.join(OUT, f'{sid}.mp4')
    sf = os.path.join(OUT, f'{sid}.json')
    if kind == 'ich':
        ch = spec.pop('chest', None)
        after = spec.pop('after_chest', [])
        spec['events'] = spec.pop('chat_at', [])
        if ch:
            clicks, t = chest_clicks(ch['block'], ch['at'], ch['step'])
            spec['input'] = clicks + [dict(a, at=t + 0.15 + 0.2 * i) for i, a in enumerate(after)]
        json.dump(spec, open(sf, 'w'), indent=1)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'ich.py'), sf, out], check=True)
    else:
        spec.pop('bridge', None)
        rc(f'gamemode spectator {POV}')
        json.dump(spec, open(sf, 'w'), indent=1)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'shot.py'), sf, out], check=True)
    print(out)


def cut():
    cards = os.path.join(OUT, 'karten.json')
    json.dump(CARDS, open(cards, 'w'), ensure_ascii=False, indent=1)
    subprocess.run(['node', os.path.join(TOOLS, 'cards.cjs'), cards, OUT], check=True)
    ids = [s for s in SHOTS if os.path.exists(os.path.join(OUT, f'{s}.mp4'))]
    fade, inputs, filt, lens = 0.35, [], [], []
    for i, sid in enumerate(ids):
        start, length = CUT[sid]
        last = i == len(ids) - 1
        need = length + (0 if last else fade)
        lens.append(length)
        inputs += ['-ss', f'{start:.2f}', '-t', f'{need:.2f}', '-i', os.path.join(OUT, f'{sid}.mp4')]
        inputs += ['-loop', '1', '-t', f'{need:.2f}', '-i', os.path.join(OUT, CARD_OF[sid])]
        filt.append(f'[{2 * i}:v]scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p,trim=0:{need:.2f},setpts=PTS-STARTPTS[b{i}]')
        filt.append(f'[{2 * i + 1}:v]format=rgba,fade=t=in:st=0.35:d=0.35:alpha=1,fade=t=out:st={length - 0.9:.2f}:d=0.35:alpha=1[c{i}]')
        filt.append(f'[b{i}][c{i}]overlay=0:0:format=auto,format=yuv420p[v{i}]')
    last, off = 'v0', 0.0
    for i in range(1, len(ids)):
        off += lens[i - 1]
        filt.append(f'[{last}][v{i}]xfade=transition=fade:duration={fade}:offset={off:.3f}[x{i}]')
        last = f'x{i}'
    total = sum(lens)
    n = 2 * len(ids)
    inputs += ['-loop', '1', '-t', f'{total:.2f}', '-i', os.path.join(OUT, 'ende.png')]
    filt.append(f'[{n}:v]format=rgba,fade=t=in:st={total - 1.9:.2f}:d=0.45:alpha=1[end]')
    filt.append(f'[{last}][end]overlay=0:0:format=auto,format=yuv420p,fade=t=in:st=0:d=0.4,trim=0:{total:.3f}[out]')
    dst = os.path.join(OUT, 'Darsteller-Demo.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(filt), '-map', '[out]',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst],
                   check=True)
    sheet = os.path.join(OUT, 'kontaktbogen.jpg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', dst, '-vf',
                    "select='not(mod(n\\,22))',scale=480:-1,tile=6x5:padding=4", '-frames:v', '1', sheet], check=True)
    print(dst, f'{total:.1f}s')
    print(sheet)


def main(args):
    if args == ['runde']:
        start_round()
    elif args == ['schnitt']:
        cut()
    else:
        for sid in args or list(SHOTS):
            print('==', sid, flush=True)
            record(sid)


if __name__ == '__main__':
    main(sys.argv[1:])
