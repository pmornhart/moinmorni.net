#!/usr/bin/env python3
"""shot.py (unverändert, aus tools/trailer) für die Welt „party“: Befehle mit Ort laufen dort (execute in …).

  python3 party_shot.py <einstellung.json> <ausgabe.mp4>
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import shot

DIM = os.environ.get('MM_DIM', 'minecraft:party')
_call = shot.Rcon.__call__
POSITIONAL = ('tp', 'summon', 'particle', 'playsound', 'setblock', 'fill', 'clone')


def call(self, cmd):
    if cmd.split(' ', 1)[0] == 'spectate':  # Morni Party belegt /spectate als Alias für /zuschauen
        cmd = 'minecraft:' + cmd
    if cmd.startswith('minecraft:spectate') and '@e' in cmd:
        if True:
            # Läuft der Server schon langsam (Minispiel angehalten), kennt der Client die Kamera erst nach dem nächsten
            # Tick – darum warten und das Zuschauen einmal neu setzen.
            cam = os.environ.get('MM_CAMERA', 'MorniTest')
            time.sleep(1.6)
            _call(self, cmd)
            time.sleep(1.2)
            _call(self, f'execute as {cam} run minecraft:spectate')
            time.sleep(0.3)
    if cmd.split(' ', 1)[0] in POSITIONAL:
        cmd = f'execute in {DIM} run {cmd}'
    return _call(self, cmd)


shot.Rcon.__call__ = call
if __name__ == '__main__':
    shot.main()
