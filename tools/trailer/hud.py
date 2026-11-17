#!/usr/bin/env python3
"""Anzeige (Schnellleiste, Herzen, Chat) des echten Clients sicher an- oder ausschalten.

F1 schaltet nur um. Darum wird der Zustand je Client-Prozess gemerkt (frisch gestartet = Anzeige an) und, wo eine
Schnellleiste zu sehen ist, am Bild nachgeprüft (graue Rahmen und Felder unten in der Mitte). Wer zwischendurch von
Hand F1 drückt, setzt den Merker mit „python3 hud.py :113 an|aus --merken“ wieder richtig.

  python3 hud.py :113 an|aus
"""
import os, subprocess, sys, time
from io import BytesIO
from PIL import Image


def grey_fraction(display, gui=3, size=(1600, 900)):
    w, h = 182 * gui, 22 * gui
    x, y = (size[0] - w) // 2, size[1] - h
    png = subprocess.run(['import', '-window', 'root', '-crop', f'{w}x{h}+{x}+{y}', 'png:-'],
                         env=dict(os.environ, DISPLAY=display), capture_output=True, check=True).stdout
    im = Image.open(BytesIO(png)).convert('RGB')
    px = im.load()
    n = grey = 0
    for j in range(0, im.height, 2):
        for i in range(0, im.width, 2):
            r, g, b = px[i, j]
            n += 1
            if abs(r - g) < 8 and abs(g - b) < 8 and 40 < r < 200:
                grey += 1
    return grey / max(1, n)


def red_fraction(display, gui=3, size=(1600, 900)):
    """Anteil kräftig roter Bildpunkte dort, wo die Herzen stehen (links über der Schnellleiste). Herzen gibt es im
    Überleben/Abenteuer – sie zeigen zuverlässiger als die grauen Felder, ob die Anzeige an ist (grauer Fels oder
    Schnee im Hintergrund täuschen die Schnellleisten-Prüfung)."""
    w, h = 81 * gui, 9 * gui
    x, y = (size[0] - 182 * gui) // 2, size[1] - 39 * gui
    png = subprocess.run(['import', '-window', 'root', '-crop', f'{w}x{h}+{x}+{y}', 'png:-'],
                         env=dict(os.environ, DISPLAY=display), capture_output=True, check=True).stdout
    im = Image.open(BytesIO(png)).convert('RGB')
    px = im.load()
    n = red = 0
    for j in range(0, im.height, 2):
        for i in range(0, im.width, 2):
            r, g, b = px[i, j]
            n += 1
            if r > 170 and g < 90 and b < 90:
                red += 1
    return red / max(1, n)


def bar_fraction(display, gui=3, size=(1600, 900)):
    """Anteil dunkler Bildpunkte in der schmalen Leiste über der Schnellleiste (Ortungsleiste) – die zeigt der Client
    auch als Zuschauer, wenn die Anzeige an ist."""
    w, h = 170 * gui, 3 * gui
    x, y = (size[0] - w) // 2, size[1] - 27 * gui
    png = subprocess.run(['import', '-window', 'root', '-crop', f'{w}x{h}+{x}+{y}', 'png:-'],
                         env=dict(os.environ, DISPLAY=display), capture_output=True, check=True).stdout
    im = Image.open(BytesIO(png)).convert('L')
    px = list(im.getdata())
    return sum(1 for v in px if v < 45) / max(1, len(px))


def client_alive(display):
    """Läuft der echte Client auf dieser Anzeige noch? (Ist er weg, bleibt der virtuelle Bildschirm schwarz.)"""
    env = dict(os.environ, DISPLAY=display)
    png = subprocess.run(['import', '-window', 'root', '-resize', '160x90', 'png:-'], env=env, capture_output=True).stdout
    lo, hi = Image.open(BytesIO(png)).convert('L').getextrema()
    return hi > 8


def require_client(display):
    if not client_alive(display):
        sys.exit(f'Der echte Client auf {display} läuft nicht (abgestürzt oder vom Speicherwächter beendet?) – '
                 'neu starten (tools/mc-client/launch.py) und die Einstellung wiederholen.')


def client_pid(display):
    """Prozess des echten Clients auf dieser Anzeige (Java mit DISPLAY=<display>)."""
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read()
            if b'net.minecraft.client.main.Main' not in cmd:
                continue
            if f'DISPLAY={display}'.encode() in open(f'/proc/{pid}/environ', 'rb').read().split(b'\0'):
                return int(pid)
        except OSError:
            pass
    return None


STATE = os.environ.get('MM_HUD_STATE', '/home/user/mm-cache/trailer/.hud-{}.json')


def set_hud(display, on, gui=3):
    """Anzeige an (on=True) oder aus. Der Zustand wird je Client-Prozess gemerkt (ein frisch gestarteter Client zeigt
    sie an); ist eine Schnellleiste zu sehen (Überleben/Abenteuer), wird zusätzlich am Bild geprüft."""
    import json
    path = STATE.format(display.strip(':'))
    pid = client_pid(display)
    try:
        st = json.load(open(path))
    except (OSError, ValueError):
        st = {}
    shown = st.get('shown', True) if st.get('pid') == pid else True
    if shown != on:
        before, red_before, bar_before = grey_fraction(display, gui), red_fraction(display, gui), bar_fraction(display, gui)
        subprocess.run(['xdotool', 'key', 'F1'], env=dict(os.environ, DISPLAY=display), check=False)
        time.sleep(1.2)
        after, red_after, bar_after = grey_fraction(display, gui), red_fraction(display, gui), bar_fraction(display, gui)
        if max(red_before, red_after) > 0.05:  # Herzen auf einem der Bilder: daran entscheiden
            wrong = (red_after > 0.05) != on
        elif abs(bar_before - bar_after) > 0.4:  # Ortungsleiste (auch als Zuschauer): da, wo sie dunkel ist, ist die Anzeige an
            wrong = (bar_after > bar_before) != on
        else:
            wrong = max(before, after) > 0.2 and (after > before + 0.1) != on
        if wrong:  # Bild widerspricht: noch einmal umschalten
            subprocess.run(['xdotool', 'key', 'F1'], env=dict(os.environ, DISPLAY=display), check=False)
            time.sleep(0.5)
    json.dump({'pid': pid, 'shown': on}, open(path, 'w'))
    return on


if __name__ == '__main__':
    want = sys.argv[2] in ('an', 'on', '1')
    if '--merken' in sys.argv:
        import json
        json.dump({'pid': client_pid(sys.argv[1]), 'shown': want}, open(STATE.format(sys.argv[1].strip(':')), 'w'))
    print(set_hud(sys.argv[1], want))
