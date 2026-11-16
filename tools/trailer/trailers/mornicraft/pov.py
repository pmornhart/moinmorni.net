#!/usr/bin/env python3
"""Ich-Sicht für den MorniCraft-Trailer (aus dem MorniSMP-Trailer übernommen, erweitert): Die Kamera ist der echte Client selbst – als Spieler im Abenteuermodus, mit
Anzeige (Leiste, Herzen, Chat) und echten Klicks (xdotool) in die Truhen-Menüs des Plugins. Der Server läuft dabei wie
bei shot.py in Zeitlupe, die Maus bewegt sich entsprechend langsam; danach wird beschleunigt.

  python3 pov.py <einstellung.json> <ausgabe.mp4>

Einstellung (JSON), Zeiten in Video-Sekunden:
  slow, dim        wie bei shot.py
  setup            Befehle vorher (normale Geschwindigkeit)
  path             [{"p":[x,y,z], "yaw":Grad, "pitch":Grad, "t":s, "ease":1, "hold":s}] – nur bis das Menü aufgeht
                   (ein Teleport schließt sonst evtl. das Menü)
  until            ab dieser Zeit wird nicht mehr teleportiert (Standard: Ende des Wegs)
  events           [{"at":s, "rclick":1} | {"at":s, "click":1} | {"at":s, "mouse":[x,y], "dur":s}
                    | {"at":s, "key":"F3+d"} | {"at":s, "text":"/gs sichern", "dur":s} | {"at":s, "cmd":"…"}]
  zoom             {"z":1.4, "cx":800, "cy":455, "in":[a,b], "out":[c,d]} – sanft heranzoomen (Bildschirm-Pixel 1600×900)
  duration         Länge in Video-Sekunden
  close            am Ende ist noch ein Menü offen → mit Escape schließen
  cursor           Mauszeiger mit aufnehmen (Standard 1; für Ich-Sicht ohne Menü 0 – sonst malt x11grab Kreuze ins Bild)
  after            Befehle danach
  hud              Anzeige zeigen (Standard 1); 0 = ohne Leiste/Chat (z. B. Flug von hinten)
  f5               1 = von hinten (dritte Person) – danach zurück in die Ich-Sicht
  gamemode         Spielmodus der Kamera während der Einstellung (Standard adventure)
  Zusätzliche Ereignisse: {"at":s, "keydown":"w"} · {"at":s, "keyup":"w"} (Taste halten/loslassen; in Zeitlupe genug
  Zeit, damit der Client jeden Druck sieht – z. B. Doppelsprung) · {"at":s, "rot":[yaw, pitch], "dur":s} (Blick per
  /rotate weich drehen, Bewegung bleibt erhalten – z. B. beim Gleiten)
Umgebung wie shot.py: MM_RCON, MM_RCON_PASS, MM_CAMERA, MM_DISPLAY.
"""
import json, math, os, subprocess, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from shot import Rcon, Path  # noqa: E402

TICK = 0.05


def xdo(display, *args):
    subprocess.run(['xdotool', *args], env=dict(os.environ, DISPLAY=display), check=False)


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def main():
    spec_file, out = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_file))
    slow = float(spec.get('slow', 12))
    rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    cam = os.environ.get('MM_CAMERA', 'McKamera')
    display = os.environ.get('MM_DISPLAY', ':102')
    dim = spec.get('dim')
    at = (lambda c: f'execute in {dim} run {c}') if dim else (lambda c: c)

    for c in spec.get('setup', []):
        rc(c)
    path = spec['path']
    p0 = path[0]
    rc('kill @e[tag=mmcam]')
    rc('minecraft:spectate')
    rc(f'gamemode {spec.get("gamemode", "adventure")} {cam}')
    rc(at(f'tp {cam} {p0["p"][0]} {p0["p"][1]} {p0["p"][2]} {p0.get("yaw", 0)} {p0.get("pitch", 0)}'))
    time.sleep(float(spec.get('wait', 4)))
    hud = spec.get('hud', 1)
    if hud:
        xdo(display, 'key', 'F1')    # Anzeige an (sonst aus)
        time.sleep(0.4)
    xdo(display, 'key', 'F3+d')      # Chat leeren
    time.sleep(0.6)
    if spec.get('f5'):
        xdo(display, 'key', 'F5')    # von hinten
        time.sleep(0.6)
    rc(f'tick rate {20 / slow:g}')
    time.sleep(1.0)

    route = Path(path, False)
    yaw = Path([{**q, 'p': [q.get('yaw', 0), q.get('pitch', 0), 0]} for q in path], False)
    until = spec.get('until', route.end)
    events = []
    for e in spec.get('events', []):
        if 'text' in e:  # Buchstabe für Buchstabe tippen (Chat), gleichmäßig über „dur“ Sekunden verteilt
            n = len(e['text'])
            events += [{'at': e['at'] + i * e.get('dur', 1.0) / n, 'char': c} for i, c in enumerate(e['text'])]
        else:
            events.append(e)
    events.sort(key=lambda e: e['at'])
    duration = spec['duration']

    raw = out + '.raw.mp4'
    rate = int(os.environ.get('MM_CAPTURE_FPS', max(6, round(96 / slow))))
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', str(int(spec.get('cursor', 1))), '-video_size',
                           '1600x900', '-framerate', str(rate), '-i', display, '-c:v', 'libx264', '-preset', 'ultrafast',
                           '-crf', '12', '-pix_fmt', 'yuv420p', raw], stdin=subprocess.PIPE)
    time.sleep(0.3)
    t0 = time.time()
    moves = []  # laufende Mausbewegungen: (start, ende, von, nach)
    turns = []  # laufende Drehungen: (start, ende, von, nach)
    view = [p0.get('yaw', 0), p0.get('pitch', 0)]
    mouse = [800, 450]
    k, ei = 0, 0
    while True:
        t = k * TICK
        if t > duration:
            break
        if t <= until:
            p = route.pos(t)
            yp = yaw.pos(t)
            rc(at(f'tp {cam} {p[0]:.3f} {p[1]:.3f} {p[2]:.3f} {yp[0]:.2f} {yp[1]:.2f}'))
        while ei < len(events) and events[ei]['at'] <= t:
            e = events[ei]; ei += 1
            if 'cmd' in e:
                rc(e['cmd'])
            elif 'rclick' in e:
                xdo(display, 'click', '3')
            elif 'click' in e:
                xdo(display, 'click', '1')
            elif 'key' in e:
                xdo(display, 'key', e['key'])
            elif 'keydown' in e:
                xdo(display, 'keydown', e['keydown'])
            elif 'keyup' in e:
                xdo(display, 'keyup', e['keyup'])
            elif 'rot' in e:
                turns.append((e['at'], e['at'] + e.get('dur', 0.5), list(view), e['rot']))
                view = list(e['rot'])
            elif 'char' in e:
                xdo(display, 'type', '--delay', '0', e['char'])
            elif 'mouse' in e:
                moves.append((e['at'], e['at'] + e.get('dur', 0.5), list(mouse), e['mouse']))
                mouse = list(e['mouse'])
        for a, b, frm, to in turns:
            if a <= t <= b + TICK:
                u = smooth((t - a) / max(1e-6, b - a))
                rc(f'rotate {cam} {frm[0] + (to[0] - frm[0]) * u:.2f} {frm[1] + (to[1] - frm[1]) * u:.2f}')
        k += 1
        # bis zum nächsten Tick die Maus in kleinen Schritten führen (echte Zeit)
        end = t0 + k * TICK * slow
        while True:
            now = time.time()
            if now >= end:
                break
            tv = (now - t0) / slow
            for a, b, frm, to in moves:
                if a <= tv <= b + TICK:
                    u = smooth((tv - a) / max(1e-6, b - a))
                    xdo(display, 'mousemove', str(round(frm[0] + (to[0] - frm[0]) * u)),
                        str(round(frm[1] + (to[1] - frm[1]) * u)))
            time.sleep(min(0.12, max(0.0, end - time.time())))
    ff.stdin.write(b'q'); ff.stdin.flush(); ff.wait()
    for e in spec.get('events', []):  # keine Taste bleibt gedrückt
        if 'keydown' in e:
            xdo(display, 'keyup', e['keydown'])
    rc('tick rate 20')
    time.sleep(0.5)
    if spec.get('close'):            # Menü noch offen? (sonst würde Escape das Pause-Menü öffnen)
        xdo(display, 'key', 'Escape')
        time.sleep(0.3)
    if spec.get('f5'):
        xdo(display, 'key', 'F5')    # dritte Person von vorn …
        time.sleep(0.3)
        xdo(display, 'key', 'F5')    # … und zurück in die Ich-Sicht
        time.sleep(0.3)
    if hud:
        xdo(display, 'key', 'F1')    # Anzeige wieder aus
    rc(f'gamemode spectator {cam}')
    for c in spec.get('after', []):
        rc(c)
    vf = f'setpts=PTS/{slow},fps=30'
    z = spec.get('zoom')
    if z:
        a, b = z.get('in', [0, 0.01])
        c, d = z.get('out', [999, 1000])
        zz = (f"1+{z['z'] - 1}*(st(0,clip((in/30-{a})/{b - a},0,1))*ld(0)*(3-2*ld(0))"
              f"-st(1,clip((in/30-{c})/{d - c},0,1))*ld(1)*(3-2*ld(1)))")
        cx, cy = z.get('cx', 800) * 2, z.get('cy', 450) * 2
        vf += (f",scale=3200:1800:flags=lanczos,zoompan=z='{zz}':d=1:s=1600x900:fps=30"
               f":x='max(0,min(iw-iw/({zz}),{cx}-iw/({zz})/2))':y='max(0,min(ih-ih/({zz}),{cy}-ih/({zz})/2))'")
        # (Zoom-Ausdruck ausgeschrieben statt der Variablen „zoom“ – die hinkt in x/y einen Schritt hinterher)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-vf', vf, '-r', '30', '-c:v', 'libx264',
                    '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out], check=True)
    os.remove(raw)
    print(out, f'{duration:.1f}s')


if __name__ == '__main__':
    main()
