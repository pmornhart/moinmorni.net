#!/usr/bin/env python3
"""shot.py (unverändert, aus tools/trailer) mit drei Zusätzen für den MorniSMP-Trailer:

  {"at": s, "cmd": "#release Anna"}   ab hier bewegt die Einstellung Anna nicht mehr (z. B. weil das Plugin sie gerade
                                      durchs Reisetor teleportiert oder sie gestorben ist)
  {"at": s, "cmd": "#key F1"}         Taste im echten Client (xdotool auf MM_DISPLAY)
  "follow": "@e[type=minecraft:ender_dragon,limit=1]"   die Kamera schaut (sanft nachgeführt) auf dieses Wesen

  python3 smp_shot.py <einstellung.json> <ausgabe.mp4>
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import shot

_call = shot.Rcon.__call__
RELEASED = set()
TP = re.compile(r'^(?:execute in \S+ run )?tp (\S+) ')


def call(self, cmd):
    if cmd.startswith('#release '):
        RELEASED.add(cmd.split()[1])
        return ''
    if cmd.startswith('#key '):
        subprocess.run(['xdotool', 'key', cmd.split()[1]], env=dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':102')))
        return ''
    m = TP.match(cmd)
    if m and m.group(1) in RELEASED:
        return ''
    return _call(self, cmd)


shot.Rcon.__call__ = call

_pos = shot.Path.pos
FOLLOW = {}


def pos(self, t, key='p'):
    if key != 'look' or not FOLLOW:
        return _pos(self, t, key)
    out = _call(FOLLOW['rc'], f"execute in {FOLLOW['dim']} run data get entity {FOLLOW['sel']} Pos")
    v = [float(x) for x in re.findall(r'(-?[\d.]+)d', out)[:3]]
    if len(v) == 3:
        prev = FOLLOW.get('aim') or v
        FOLLOW['aim'] = [a + (b - a) * 0.3 for a, b in zip(prev, v)]
    return FOLLOW.get('aim') or _pos(self, t, key)


shot.Path.pos = pos
if __name__ == '__main__':
    spec = json.load(open(sys.argv[1]))
    if spec.get('follow'):
        FOLLOW.update(sel=spec['follow'], dim=spec.get('dim', 'minecraft:overworld'),
                      rc=shot.Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS']))
    shot.main()
