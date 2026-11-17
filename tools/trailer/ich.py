#!/usr/bin/env python3
"""Ich-Sicht wie echtes Gameplay: Der echte Client ist der Spieler – mit Schnellleiste, Herzen, Fadenkreuz und eigenem
Arm (mit dem eigenen Skin aus dem Darsteller-Paket). Gesteuert wird er mit echten Eingaben (xdotool): Tasten halten,
Maus bewegen, klicken, tippen. Der Server läuft dabei in Zeitlupe (/tick rate); der Client läuft in derselben Zeitlupe
(seine Physik, Arm- und Gegenstands-Animationen folgen dem Takt des Servers). Nur die Eingaben kommen in echter Zeit –
darum werden sie hier um die Zeitlupe gestreckt: eine Taste, die 2 Spielsekunden gehalten wird, hält diese Datei bei
SLOW 12 für 24 echte Sekunden; die Maus dreht entsprechend langsam. Danach wird das Video beschleunigt.

  python3 ich.py <einstellung.json> <ausgabe.mp4>

Einstellung (JSON), alle Zeiten in Spielsekunden:
  slow, dim, setup, after, fifo-Ereignisse wie bei shot.py („events“ mit actor/act oder cmd)
             In „setup“ wartet „#sleep 2.5“ so viele echte Sekunden (z. B. einen Flug erst anlaufen lassen, dann
             die Zeitlupe einschalten).
  start      {"p":[x,y,z], "yaw":Grad, "pitch":Grad} – Spieler vorher dorthin (Teleport, danach nicht mehr)
  gamemode   survival (Standard) | adventure
  duration   Länge
  keys       [{"at":s, "key":"w", "dur":s}]            Taste halten (w a s d space shift ctrl 1-9 e q f …)
  look       [{"at":s, "yaw":Grad, "pitch":Grad}       Blick (absolut, Minecraft-Grad: yaw 0 = Süden)
              {"at":s, "target":[x,y,z] | "Name"}]     … oder auf einen Punkt/Spieler (Spieler wird verfolgt)
  clicks     [{"at":s, "button":1|3, "dur":s}]         1 = links (schlagen/abbauen), 3 = rechts (benutzen); dur = halten
  chat       [{"at":s, "text":"gg", "dur":s}]          T drücken, Buchstabe für Buchstabe tippen, Enter
  input      [{"at":s, "mouse":[x,y], "dur":s}         Mauszeiger in einem Menü (Bildschirm-Pixel 1600×900) hinbewegen
              {"at":s, "shiftclick":1} | {"at":s, "key":"Escape"} | {"at":s, "select":"sword"}]
             select = Gegenstand (Textfilter) in der Schnellleiste suchen und per Nummerntaste wählen
  Blickführung ruht, solange ein Menü offen ist (ab dem Rechtsklick „opens“:true bis Escape).
  hud        true (Standard) – Anzeige an; false = F1
  aim        Federhärte der Blickführung (Standard 60; höher = zackiger)
Umgebung: MM_RCON, MM_RCON_PASS, MM_CAMERA (Spielername des echten Clients), MM_DISPLAY, MM_ACTORS_FIFO (optional),
MM_MOUSE_PX_PER_DEG (Standard 6,667 = Mausempfindlichkeit 100 %/„0.5“ in options.txt).
"""
import json, math, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shot import Rcon  # noqa: E402

TICK = 0.05
KEYS = {'shift': 'Shift_L', 'ctrl': 'Control_L', 'space': 'space', 'esc': 'Escape', 'enter': 'Return', 'tab': 'Tab'}


def xdo(display, *args):
    subprocess.run(['xdotool', *args], env=dict(os.environ, DISPLAY=display), check=False)


def wrap(a):
    return (a + 180) % 360 - 180


def angles_to(p, q):
    dx, dy, dz = q[0] - p[0], q[1] - p[1], q[2] - p[2]
    return math.degrees(math.atan2(-dx, dz)), -math.degrees(math.atan2(dy, math.hypot(dx, dz)))


def nums(text):
    return [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?(?:E-?\d+)?', text)]


def main():
    spec_file, out = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_file))
    slow = float(spec.get('slow', 12))
    rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    me = os.environ.get('MM_CAMERA', 'Kamera')
    display = os.environ.get('MM_DISPLAY', ':113')
    fifo = os.environ.get('MM_ACTORS_FIFO')
    act_out = open(fifo, 'a', buffering=1) if fifo else None
    dim = spec.get('dim')
    at = (lambda c: f'execute in {dim} run {c}') if dim else (lambda c: c)
    ppd = float(os.environ.get('MM_MOUSE_PX_PER_DEG', 1 / 0.15))

    def where(name):
        v = nums(rc(f'data get entity {name} Pos'))
        return v[-3:] if len(v) >= 3 else None

    def rot():
        v = nums(rc(f'data get entity {me} Rotation'))
        return (v[-2], v[-1]) if len(v) >= 2 else (0.0, 0.0)

    for c in spec.get('setup', []):
        if c.startswith('#sleep '):
            time.sleep(float(c.split()[1]))
        else:
            rc(c)
    rc('minecraft:spectate')
    rc('kill @e[tag=mmcam]')
    rc(f"gamemode {spec.get('gamemode', 'survival')} {me}")
    st = spec.get('start')
    if st:
        p = st['p']
        rc(at(f"tp {me} {p[0]} {p[1]} {p[2]} {st.get('yaw', 0)} {st.get('pitch', 0)}"))
    time.sleep(float(spec.get('wait', 3)))
    from hud import set_hud, require_client
    require_client(display)
    set_hud(display, bool(spec.get('hud', True)))  # Anzeige an (für Kamerafahrten ist sie aus)
    if spec.get('clear_chat', True):
        xdo(display, 'key', 'F3+d')  # Chat leeren
    time.sleep(0.5)
    rc(f'tick rate {20 / slow:g}')
    time.sleep(1.0)

    yaw, pitch = rot()
    vy = vp = 0.0
    stiff = float(spec.get('aim', 60))
    looks = sorted(spec.get('look', []), key=lambda e: e['at'])
    timeline = []
    for e in spec.get('keys', []):
        k = KEYS.get(e['key'], e['key'])
        timeline += [(e['at'], 'keydown', k), (e['at'] + e.get('dur', 0.1), 'keyup', k)]
    for e in spec.get('clicks', []):
        b = str(e.get('button', 1))
        if e.get('dur'):
            timeline += [(e['at'], 'mousedown', b), (e['at'] + e['dur'], 'mouseup', b)]
        else:
            timeline.append((e['at'], 'click', b))
    for e in spec.get('chat', []):
        text = e['text']
        timeline.append((e['at'], 'key', 't'))
        step = e.get('dur', 0.6) / max(1, len(text))
        for i, ch in enumerate(text):
            timeline.append((e['at'] + 0.05 + i * step, 'type', ch))
        timeline.append((e['at'] + 0.1 + e.get('dur', 0.6), 'key', 'Return'))
    for e in spec.get('events', []):
        timeline.append((e['at'], 'event', e))
    gui_from = [e['at'] for e in spec.get('clicks', []) if e.get('opens')]
    for e in spec.get('input', []):
        if 'mouse' in e:
            timeline.append((e['at'], 'abs', (e['mouse'], e.get('dur', 0.3))))
        elif 'shiftclick' in e:
            timeline.append((e['at'], 'shiftclick', str(e['shiftclick'])))
        elif 'select' in e:
            timeline.append((e['at'], 'select', e['select']))
        elif 'key' in e:
            timeline.append((e['at'], 'key', KEYS.get(e['key'], e['key'])))
            if e['key'] in ('Escape', 'esc', 'e'):
                gui_from.append(-e['at'])
    timeline.sort(key=lambda t: t[0])
    marks = sorted(gui_from, key=abs)

    def menu_open(t):
        state = False
        for m in marks:
            if abs(m) <= t:
                state = m > 0
        return state

    def select(names):
        found = []
        for slot in range(9):  # einzeln abfragen: lange Antworten kürzt der Server mit „…“
            m = re.search(r'id:\s*"([^"]+)"', rc(f'data get entity {me} Inventory[{{Slot:{slot}b}}]'))
            if m:
                found.append((slot, m.group(1)))
        for name in names.split('|'):  # Alternativen: „sword|axe“
            for slot, ident in found:
                if slot <= 8 and name in ident:
                    xdo(display, 'key', str(slot + 1))
                    return
    abs_moves = []
    mouse_at = [800, 450]
    duration = float(spec['duration'])

    raw = out + '.raw.mp4'
    rate = int(os.environ.get('MM_CAPTURE_FPS', max(6, round(96 / slow))))
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size',
                           spec.get('size', '1600x900'), '-framerate', str(rate), '-i', display, '-c:v', 'libx264',
                           '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', raw], stdin=subprocess.PIPE)
    import atexit  # bricht die Aufnahme mit einem Fehler ab, soll ffmpeg nicht weiterlaufen
    atexit.register(lambda: ff.poll() is None and ff.kill())
    time.sleep(0.3)
    t0 = time.time()
    k, ti = 0, 0
    target_cache = {}
    while True:
        t = k * TICK
        if t > duration:
            break
        # gewünschter Blick zu dieser Zeit
        want = None
        cur = [e for e in looks if e['at'] <= t]
        if cur:
            e = cur[-1]
            if 'target' in e:
                tg = e['target']
                if isinstance(tg, str):
                    if k % 2 == 0 or tg not in target_cache:
                        pos = where(tg)
                        if pos:
                            target_cache[tg] = [pos[0], pos[1] + e.get('height', 1.3), pos[2]]
                    tg = target_cache.get(tg)
                if tg:
                    mypos = where(me)
                    if mypos:
                        want = angles_to([mypos[0], mypos[1] + 1.62, mypos[2]], tg)
            else:
                want = (e.get('yaw', yaw), e.get('pitch', pitch))
        in_menu = menu_open(t)
        if k % 20 == 0 and not in_menu:  # gelegentlich mit dem Server abgleichen (Rundungen der Maus)
            yaw, pitch = rot()
        if in_menu:
            want = None
            vy = vp = 0.0
        dy = dp = 0.0
        if want:
            c = 2 * math.sqrt(stiff)
            vy += (stiff * wrap(want[0] - yaw) - c * vy) * TICK
            vp += (stiff * (want[1] - pitch) - c * vp) * TICK
            jit = 0.25 * math.sin(t * 2.3) + 0.15 * math.sin(t * 5.1 + 1.0)
            dy, dp = vy * TICK + jit * TICK, vp * TICK
        # Ereignisse
        while ti < len(timeline) and timeline[ti][0] <= t:
            _, kind, arg = timeline[ti]
            ti += 1
            if kind == 'event':
                if 'cmd' in arg:
                    rc(arg['cmd'])
                elif act_out:
                    act_out.write(f"{arg['actor']} {arg['act']} {arg.get('arg', '')}\n")
            elif kind == 'type':
                xdo(display, 'type', '--delay', '0', arg)
            elif kind == 'abs':
                (tx, ty), dur = arg
                abs_moves.append((t, t + dur, list(mouse_at), [tx, ty]))
                mouse_at[:] = [tx, ty]
            elif kind == 'shiftclick':
                xdo(display, 'keydown', 'Shift_L', 'click', arg, 'keyup', 'Shift_L')
            elif kind == 'select':
                select(arg)
            else:
                xdo(display, kind, arg)
        # Maus über die echte Dauer dieses Ticks verteilen
        end = t0 + (k + 1) * TICK * slow
        px, py = dy * ppd, dp * ppd
        steps = max(1, int(min(8, (end - time.time()) / 0.08)))
        done_x = done_y = 0
        for s in range(1, steps + 1):
            tx, ty = round(px * s / steps), round(py * s / steps)
            if (tx != done_x or ty != done_y) and not in_menu:
                xdo(display, 'mousemove_relative', '--', str(tx - done_x), str(ty - done_y))
                done_x, done_y = tx, ty
            tv = t + (s / steps) * TICK
            for a_, b_, frm, to in abs_moves:  # Mauszeiger im Menü weich führen
                if a_ <= tv <= b_ + TICK:
                    u = max(0.0, min(1.0, (tv - a_) / max(1e-6, b_ - a_)))
                    u = u * u * (3 - 2 * u)
                    xdo(display, 'mousemove', str(round(frm[0] + (to[0] - frm[0]) * u)),
                        str(round(frm[1] + (to[1] - frm[1]) * u)))
            wait = t0 + k * TICK * slow + (s / steps) * TICK * slow - time.time()
            if wait > 0:
                time.sleep(wait)
        yaw = wrap(yaw + done_x / ppd)
        pitch = max(-90, min(90, pitch + done_y / ppd))
        k += 1
    ff.stdin.write(b'q'); ff.stdin.flush(); ff.wait()
    for _, kind, arg in timeline:  # nichts hängen lassen
        if kind == 'keydown':
            xdo(display, 'keyup', arg)
        elif kind == 'mousedown':
            xdo(display, 'mouseup', arg)
    rc('tick rate 20')
    set_hud(display, False)  # Anzeige wieder aus
    for c in spec.get('after', []):
        rc(c)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-vf', f'setpts=PTS/{slow},fps=30', '-r', '30',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out], check=True)
    os.remove(raw)
    print(out, f'{duration:.1f}s')


if __name__ == '__main__':
    main()
