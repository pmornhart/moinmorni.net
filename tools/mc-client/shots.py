#!/usr/bin/env python3
"""Bilder wie im echten Minecraft: setzt einen verbundenen echten Client (launch.py) per RCON an Aussichtspunkte
und macht Screenshots vom virtuellen Bildschirm.

  python3 shots.py --rcon 127.0.0.1:25702 --password-file .rcon-pass --player MorniTest --out bilder/ \
      --shot "ankunft 0 70 0 180 5" --shot "von-oben 0 160 0 0 70" [--hud] [--wait 15]

Ein --shot ist "name x y z yaw pitch". Ohne --hud wird die Leiste (F1) ausgeblendet.
"""
import argparse, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from rcon import run as rcon  # noqa: E402


def key(display, name):
    env = dict(os.environ, DISPLAY=display)
    wid = subprocess.run(['xdotool', 'search', '--name', 'Minecraft'], env=env, capture_output=True, text=True).stdout.split()
    if wid:
        subprocess.run(['xdotool', 'windowactivate', '--sync', wid[0]], env=env, capture_output=True)
    subprocess.run(['xdotool', 'key', name], env=env)


def snap(display, path, width):
    env = dict(os.environ, DISPLAY=display)
    raw = path + '.raw.png'
    subprocess.run(['import', '-window', 'root', raw], env=env, check=True)
    subprocess.run(['convert', raw, '-resize', f'{width}x', '-quality', '90', path], check=True)
    os.remove(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rcon', required=True)
    ap.add_argument('--password-file', required=True)
    ap.add_argument('--player', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--shot', action='append', default=[])
    ap.add_argument('--hud', action='store_true')
    ap.add_argument('--wait', type=float, default=12)
    ap.add_argument('--display', default=':99')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--mode', default='spectator')
    ap.add_argument('--before', action='append', default=[], help='RCON-Befehl vor den Bildern')
    a = ap.parse_args()
    password = open(a.password_file).read().strip()
    os.makedirs(a.out, exist_ok=True)
    rcon(a.rcon, password, [f'gamemode {a.mode} {a.player}'] + a.before)
    hud_hidden = False
    for spec in a.shot:
        name, x, y, z, yaw, pitch = spec.split()
        rcon(a.rcon, password, [f'tp {a.player} {x} {y} {z} {yaw} {pitch}'])
        if not a.hud and not hud_hidden:
            key(a.display, 'F1')
            hud_hidden = True
        time.sleep(a.wait)
        path = os.path.join(a.out, f'{name}.jpg')
        snap(a.display, path, a.width)
        print('Bild:', path)
    if hud_hidden:
        key(a.display, 'F1')


if __name__ == '__main__':
    main()
