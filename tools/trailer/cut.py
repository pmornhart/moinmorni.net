#!/usr/bin/env python3
"""Schneidet einen Trailer im Takt der Musik zusammen.

  python3 cut.py <trailer.json> <ausgabe.mp4>

trailer.json:
  {"style": "duels", "music": "musik-duels.wav", "dir": "<Ordner mit Einstellungen und Karten>",
   "shots": [{"file": "s1.mp4", "bars": 4, "start": 0.0, "card": "intro.png"},
             {"file": "s2.mp4", "bars": 2, "card": "lt1.png"}, …,
             {"file": "s9.mp4", "bars": "rest", "card": "ende.png", "cardAt": 0.6}]}
Die Takte aller Einstellungen ergeben zusammen die Länge der Musik („rest“ = bis zum Schluss).
Karten blenden weich ein und aus; die Endkarte bleibt stehen. Zwischen den Einstellungen kurze Überblendungen.
"""
import json, os, subprocess, sys

FADE = 0.35   # Überblendung zwischen Einstellungen
CARD_IN = 0.35
W, H = 1920, 1080


def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
                                          'csv=p=0', f]).decode().strip())


def main():
    plan_file, out = sys.argv[1], sys.argv[2]
    plan = json.load(open(plan_file))
    base = plan.get('dir', os.path.dirname(os.path.abspath(plan_file)))
    music = os.path.join(base, plan['music'])
    info = json.load(open(os.path.splitext(music)[0] + '.json'))
    spb, total = info['secPerBar'], info['duration']
    shots = plan['shots']
    lengths, used = [], 0.0
    for s in shots:
        if s['bars'] == 'rest':
            lengths.append(total - used)
        else:
            lengths.append(s['bars'] * spb)
        used += lengths[-1]
    if abs(used - total) > 0.05:
        sys.exit(f'Takte passen nicht zur Musik: {used:.2f}s statt {total:.2f}s')

    inputs, filters = [], []
    n = len(shots)
    for i, (s, length) in enumerate(zip(shots, lengths)):
        src = os.path.join(base, s['file'])
        have = dur(src) - s.get('start', 0)
        need = length + (FADE if i < n - 1 else 0)
        pad = max(0.0, need - have + 0.05)
        inputs += ['-ss', f"{s.get('start', 0):.3f}", '-i', src]
        v = f'[{2 * i}:v]'
        chain = f'{v}scale={W}:{H}:flags=lanczos,setsar=1,fps=30'
        if pad > 0:
            chain += f',tpad=stop_mode=clone:stop_duration={pad:.3f}'
            print(f'  Hinweis: {s["file"]} ist {pad:.1f}s zu kurz – letztes Bild bleibt stehen')
        chain += f',trim=0:{need:.3f},setpts=PTS-STARTPTS'
        card = s.get('card')
        if card:
            inputs += ['-loop', '1', '-t', f'{need:.3f}', '-i', os.path.join(base, card)]
            c_at = s.get('cardAt', 0.25)
            c_end = s.get('cardEnd', length - 0.35 if s['bars'] != 'rest' else None)
            fade = f'format=rgba,fade=t=in:st={c_at:.2f}:d={CARD_IN}:alpha=1'
            if c_end:
                fade += f',fade=t=out:st={c_end - CARD_IN:.2f}:d={CARD_IN}:alpha=1'
            filters.append(f'[{2 * i + 1}:v]{fade}[c{i}]')
            filters.append(f'{chain}[b{i}]')
            filters.append(f'[b{i}][c{i}]overlay=0:0:format=auto,format=yuv420p[v{i}]')
        else:
            inputs += ['-f', 'lavfi', '-t', '0.1', '-i', 'color=c=black@0:s=16x16']  # Platzhalter, damit die Zählung stimmt
            filters.append(f'{chain},format=yuv420p[v{i}]')
    last, offset = 'v0', 0.0
    for i in range(1, n):
        offset += lengths[i - 1]
        trans = shots[i].get('transition', 'fade')
        filters.append(f'[{last}][v{i}]xfade=transition={trans}:duration={FADE}:offset={offset:.3f}[x{i}]')
        last = f'x{i}'
    filters.append(f'[{last}]fade=t=in:st=0:d=0.6,fade=t=out:st={total - 1.0:.3f}:d=1.0,trim=0:{total:.3f}[vout]')
    mi = 2 * n
    inputs += ['-i', music]
    # wenig Threads: auf einem vollen Rechner beendet sonst der Speicherwächter ffmpeg (viele Eingänge in 1080p)
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-filter_complex_threads', '1', *inputs, '-filter_complex', ';'.join(filters), '-map', '[vout]',
           '-map', f'{mi}:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(cmd, check=True)
    print(out, f'{total:.1f}s')


if __name__ == '__main__':
    main()
