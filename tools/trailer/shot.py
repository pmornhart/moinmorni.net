#!/usr/bin/env python3
"""Eine Trailer-Einstellung aufnehmen: Kamerafahrt, Darsteller, Ereignisse – alles in Zeitlupe, danach beschleunigt.

  python3 shot.py <einstellung.json> <ausgabe.mp4>

Umgebung: MM_RCON (host:port), MM_RCON_PASS, MM_CAMERA (Spielername des echten Clients), MM_DISPLAY (z. B. :98),
MM_ACTORS_FIFO (optional: Datei, über die actors.cjs bzw. actors/regie.cjs Handlungen bekommt; dorthin geht auch
alle 4 Ticks der Ort der Kamera als „* kamera x y z“ – Darsteller können dann zur Kamera schauen),
MM_HUD_CHECK=0 (Anzeige nicht prüfen; sonst wird sie vorher sicher ausgeschaltet, siehe hud.py).

Einstellung (JSON):
  slow      Zeitlupe (Server läuft 20/slow Ticks pro Sekunde), Standard 6
  setup     Befehle vorher in normaler Geschwindigkeit („#sleep 2.5“ wartet so viele echte Sekunden)
  camera    [{"p":[x,y,z], "look":[x,y,z], "t": Sekunden ab dem vorigen Punkt, "ease":1, "hold": s}]
  track     Name eines Darstellers: die Kamera schaut immer auf ihn ("look" kann dann fehlen)
  follow    Name oder Liste von Spielern (z. B. physikalische Darsteller aus actors/regie.cjs): die Kamera schaut
            auf ihre Mitte (Brusthöhe), weich nachgeführt – Ort der Spieler kommt per RCON („look“ kann fehlen)
  actors    {"Anna": [{"p":[x,y,z], "t": s, "look":[x,y,z] oder "yaw": Grad, "pitch": Grad, "hold": s}]}
  events    [{"at": s, "cmd": "..."} oder {"at": s, "actor": "Anna", "act": "swing"}]
  chase     {"who": Name, "back": 7, "side": 2.5, "up": 1.2, "ease": 0.35} – Verfolgerkamera: hinter einem schnellen
            Spieler (z. B. einem Flieger) her, seitlich versetzt, schaut auf ihn; Ort per RCON jeden Tick, Richtung aus
            seiner Bewegung. „camera“ gibt dann nur den Anfang (erster Punkt) und die Dauer vor.
  tpd       Gleitdauer der Kamera in Ticks (Standard 1; bei „chase“ 3 – so lange gleitet der Client auch Spieler)
  after     Befehle danach
  dim       Dimension der Welt, z. B. "minecraft:duels" (optional; sonst die Hauptwelt). RCON läuft in der Hauptwelt –
            ohne "dim" landen Kamera und Darsteller dort.
Zeiten sind Spielzeit (so wie es im fertigen Video aussieht).
"""
import json, math, os, socket, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mc-client'))
import rcon as R

TICK = 0.05


class Rcon:
    def __init__(self, addr, pw):
        host, port = addr.rsplit(':', 1)
        self.s = socket.create_connection((host, int(port)), timeout=20)
        self.s.sendall(R.packet(1, 3, pw)); R.read(self.s)
        self.i = 2

    def __call__(self, cmd):
        self.i += 1
        self.s.sendall(R.packet(self.i, 2, cmd))
        return R.read(self.s)[1]


def cr(p0, p1, p2, p3, t):
    return [0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
            for a, b, c, d in zip(p0, p1, p2, p3)]


def angles(p, l):
    dx, dy, dz = l[0] - p[0], l[1] - p[1], l[2] - p[2]
    return math.degrees(math.atan2(-dx, dz)), -math.degrees(math.atan2(dy, math.hypot(dx, dz)))


class Path:
    """Weg aus Stützpunkten; spline=True für die Kamera (weich), sonst gerade Stücke (Darsteller)."""

    def __init__(self, pts, spline):
        self.pts, self.spline = pts, spline
        self.times, t = [], 0.0
        for i, q in enumerate(pts):
            if i: t += q.get('t', 0)
            self.times.append(t)
            t += q.get('hold', 0)
        self.end = t

    def at(self, t):
        pts, times = self.pts, self.times
        if t <= times[0] or len(pts) == 1:
            return 0, 0.0
        for i in range(1, len(pts)):
            start = times[i - 1] + pts[i - 1].get('hold', 0)
            if t < times[i - 1] + pts[i - 1].get('hold', 0):
                return i - 1, 0.0
            if t < times[i]:
                u = (t - start) / max(1e-6, times[i] - start)
                if pts[i].get('ease'): u = u * u * (3 - 2 * u)
                return i - 1, u
        return len(pts) - 2, 1.0

    def pos(self, t, key='p'):
        seg, u = self.at(t)
        P = [q[key] for q in self.pts]
        if len(P) == 1:
            return P[0]
        if not self.spline:
            a, b = P[seg], P[seg + 1]
            return [x + (y - x) * u for x, y in zip(a, b)]
        Q = [P[0]] + P + [P[-1]]
        return cr(Q[seg], Q[seg + 1], Q[seg + 2], Q[seg + 3], u)


def main():
    spec_file, out = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_file))
    slow = float(spec.get('slow', 6))
    rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    cam_player = os.environ.get('MM_CAMERA', 'MorniTest')
    display = os.environ.get('MM_DISPLAY', ':98')
    fifo = os.environ.get('MM_ACTORS_FIFO')
    act_out = open(fifo, 'a', buffering=1) if fifo else None

    dim = spec.get('dim')

    def at(c):  # Befehl mit Ortsangabe in der richtigen Welt
        return f'execute in {dim} run {c}' if dim else c

    for c in spec.get('setup', []):
        if c.startswith('#sleep '):
            time.sleep(float(c.split()[1]))
        else:
            rc(c)
    cam = Path(spec['camera'], True)
    actors = {n: Path(p, False) for n, p in spec.get('actors', {}).items()}
    last_yaw = {}
    for n, path in actors.items():
        q = path.pts[0]
        rc(f'gamemode adventure {n}')
        rc(at(f'tp {n} {q["p"][0]} {q["p"][1]} {q["p"][2]} {q.get("yaw", 0)} {q.get("pitch", 0)}'))
    events = sorted(spec.get('events', []), key=lambda e: e['at'])
    duration = max([cam.end] + [p.end for p in actors.values()] + [e['at'] for e in events]) + spec.get('tail', 0.5)

    p0 = spec['camera'][0]['p']
    follow = spec.get('follow')
    if isinstance(follow, str):
        follow = [follow]

    def follow_point():
        pts = []
        for n in follow or []:
            v = [float(x) for x in __import__('re').findall(r'-?\d+(?:\.\d+)?(?:E-?\d+)?', rc(f'data get entity {n} Pos'))]
            if len(v) >= 3:
                pts.append(v[-3:])
        if not pts:
            return None
        return [sum(p[i] for p in pts) / len(pts) + (1.2 if i == 1 else 0) for i in range(3)]
    follow_aim = follow_point() if follow else None
    if follow_aim:
        for c in spec['camera']:
            c.setdefault('look', follow_aim)
    if spec.get('track') in actors:
        q = actors[spec['track']].pts[0]['p']
        for c in spec['camera']:
            c.setdefault('look', [q[0], q[1] + 1.2, q[2]])
    yaw0, pitch0 = angles(p0, spec['camera'][0]['look'])
    from hud import set_hud, require_client
    require_client(display)
    if os.environ.get('MM_HUD_CHECK', '1') != '0':
        set_hud(display, bool(spec.get('hud', False)))
    rc('kill @e[tag=mmcam]')
    rc(f'gamemode spectator {cam_player}')
    rc(at(f'tp {cam_player} {p0[0]} {p0[1]} {p0[2]} {yaw0:.2f} {pitch0:.2f}'))
    time.sleep(1.5)
    chase = spec.get('chase')
    if chase:
        for c in spec['camera']:
            c.setdefault('look', spec['camera'][0]['look'])
        cam = Path(spec['camera'], True)
    tpd = int(spec.get('tpd', 3 if chase else 1))
    rc(at(f'summon item_display {p0[0]} {p0[1]} {p0[2]} {{Tags:["mmcam"],teleport_duration:{tpd},Rotation:[{yaw0:.2f}f,{pitch0:.2f}f]}}'))
    time.sleep(0.5)
    # Mit Namensraum: Spielmodi (Duels, Party) haben ein eigenes /spectate, das sonst den Befehl abfängt.
    rc(f'minecraft:spectate @e[tag=mmcam,limit=1] {cam_player}')
    time.sleep(float(spec.get('wait', 4)))
    rc(f'tick rate {20 / slow:g}')
    time.sleep(1.0)

    raw = out + '.raw.mp4'
    # Aufnahme-Bildrate: nach dem Beschleunigen ergibt das rate × slow Bilder pro Sekunde – 8 × 12 = 96 reicht für 30.
    # Mehr kostet nur Rechenzeit, die dem Client fehlt.
    rate = int(os.environ.get('MM_CAPTURE_FPS', max(6, round(96 / slow))))
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-video_size',
                           spec.get('size', '1600x900'), '-framerate', str(rate), '-i', display, '-c:v', 'libx264',
                           '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', raw], stdin=subprocess.PIPE)
    import atexit  # bricht die Aufnahme mit einem Fehler ab, soll ffmpeg nicht weiterlaufen
    atexit.register(lambda: ff.poll() is None and ff.kill())
    time.sleep(0.3)
    t0 = time.time()
    k, ei = 0, 0
    track_aim = None
    ch_cam, ch_dir, ch_prev = list(p0), None, None
    while True:
        t = k * TICK
        if t > duration:
            break
        pos = cam.pos(t)
        if chase:  # Verfolgerkamera: Ort des Spielers, Richtung aus seiner Bewegung, weich nachgeführt
            v = [float(x) for x in __import__('re').findall(r'-?\d+(?:\.\d+)?(?:E-?\d+)?', rc(at(f"data get entity {chase['who']} Pos")))]
            if len(v) >= 3:
                w = v[-3:]
                if ch_prev:
                    d = [a - b for a, b in zip(w, ch_prev)]
                    if math.hypot(*d) > 0.05:
                        n_ = math.hypot(*d)
                        d = [x / n_ for x in d]
                        ch_dir = d if ch_dir is None else [a + (b - a) * 0.25 for a, b in zip(ch_dir, d)]
                ch_prev = w
                if ch_dir:
                    hl = math.hypot(ch_dir[0], ch_dir[2]) or 1
                    sx, sz = -ch_dir[2] / hl, ch_dir[0] / hl
                    want = [w[0] - ch_dir[0] * chase.get('back', 7) + sx * chase.get('side', 2.5),
                            w[1] - ch_dir[1] * chase.get('back', 7) + chase.get('up', 1.2),
                            w[2] - ch_dir[2] * chase.get('back', 7) + sz * chase.get('side', 2.5)]
                    ch_cam = [a + (b - a) * chase.get('ease', 0.35) for a, b in zip(ch_cam, want)]
                    look = [w[0] + ch_dir[0] * 2, w[1] + 1.0 + ch_dir[1] * 2, w[2] + ch_dir[2] * 2]
                    track_aim = look if track_aim is None else [a + (b - a) * 0.5 for a, b in zip(track_aim, look)]
            pos = ch_cam
            look = track_aim or cam.pos(t, 'look')
        elif spec.get('track') in actors:  # Kamera schaut auf einen Darsteller (Brusthöhe), sanft nachgeführt
            ap = actors[spec['track']].pos(t)
            aim = [ap[0], ap[1] + 1.2, ap[2]]
            prev = track_aim or aim
            track_aim = [a + (b - a) * 0.35 for a, b in zip(prev, aim)]
            look = track_aim
        elif follow:
            if k % 2 == 0:
                fp = follow_point()
                if fp:
                    follow_aim = [a + (b - a) * 0.3 for a, b in zip(follow_aim or fp, fp)]
            look = follow_aim
        else:
            look = cam.pos(t, 'look')
        yaw, pitch = angles(pos, look)
        rc(at(f'tp @e[tag=mmcam] {pos[0]:.3f} {pos[1]:.3f} {pos[2]:.3f} {yaw:.2f} {pitch:.2f}'))
        if act_out and k % 4 == 0:
            act_out.write(f'* kamera {pos[0]:.2f} {pos[1]:.2f} {pos[2]:.2f}\n')
        for n, path in actors.items():
            p = path.pos(t)
            seg, _ = path.at(t)
            q = path.pts[min(seg + 1, len(path.pts) - 1)]
            if 'look' in q:
                ay, ap = angles([p[0], p[1] + 1.62, p[2]], q['look'])
            elif 'yaw' in q:
                ay, ap = q['yaw'], q.get('pitch', 0)
            else:
                nxt = path.pos(t + 0.25)
                if math.hypot(nxt[0] - p[0], nxt[2] - p[2]) > 0.01:
                    ay, ap = angles(p, [nxt[0], p[1], nxt[2]])[0], 0
                else:
                    ay, ap = last_yaw.get(n, (0, 0))
            last_yaw[n] = (ay, ap)
            rc(at(f'tp {n} {p[0]:.3f} {p[1]:.3f} {p[2]:.3f} {ay:.1f} {ap:.1f}'))
        while ei < len(events) and events[ei]['at'] <= t:
            e = events[ei]; ei += 1
            if 'cmd' in e:
                rc(e['cmd'])
            elif act_out:
                act_out.write(f"{e['actor']} {e['act']} {e.get('arg', '')}\n")
        k += 1
        wait = t0 + k * TICK * slow - time.time()
        if wait > 0:
            time.sleep(wait)
    ff.stdin.write(b'q'); ff.stdin.flush(); ff.wait()
    rc('tick rate 20')
    rc('minecraft:spectate')
    rc('kill @e[tag=mmcam]')
    for c in spec.get('after', []):
        rc(c)
    # Beschleunigen: Zeitlupe herausrechnen, 30 Bilder pro Sekunde
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-vf', f'setpts=PTS/{slow},fps=30', '-r', '30',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out], check=True)
    os.remove(raw)
    print(out, f'{duration:.1f}s')


if __name__ == '__main__':
    main()
