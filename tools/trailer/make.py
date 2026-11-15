#!/usr/bin/env python3
"""Trailer bauen: python3 make.py <trailer> <schritt> [einstellung …]

Schritte: music · cards · shot [ids|all] [--neu] · sheet · cut · all
Trailer liegen in trailers/<name>.py (STYLE, CARDS, SHOTS, END_NOTE …). Ergebnis und Zwischenstände in
$MM_TRAILER_OUT/<name>/ (Standard ~/mm-cache/trailer). Die Videos enthalten echte Minecraft-Grafik: nur lokal ansehen
und an Philip schicken – nie ins Repo oder auf die Webseite.
"""
import copy, importlib.util, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('MM_TRAILER_OUT', '/home/user/mm-cache/trailer')
FADE = 0.35
MARGIN = 0.9


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, 'trailers', f'{name}.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


def music_info(d, style):
    return json.load(open(os.path.join(d, f'musik-{style}.json')))


def lengths(t, info):
    total, used, out = info['duration'], 0.0, []
    for s in t.SHOTS:
        L = total - used if s['bars'] == 'rest' else s['bars'] * info['secPerBar']
        out.append(L); used += L
    return out


def spec_duration(spec):
    def path_end(pts):
        return sum(q.get('t', 0) for q in pts[1:]) + sum(q.get('hold', 0) for q in pts)
    ends = [path_end(spec['camera'])] + [path_end(p) for p in spec.get('actors', {}).values()]
    ends += [e['at'] for e in spec.get('events', [])]
    return max(ends)


def fitted(spec, need):
    """Zeiten so strecken, dass die Einstellung genau `need` Sekunden lang ist."""
    s = copy.deepcopy(spec)
    f = need / max(0.1, spec_duration(spec))
    for pts in [s['camera']] + list(s.get('actors', {}).values()):
        for q in pts:
            if 't' in q: q['t'] *= f
            if 'hold' in q: q['hold'] *= f
    for e in s.get('events', []):
        e['at'] *= f
    s.pop('fit', None)
    return s


def main():
    name, step, *rest = sys.argv[1:]
    t = load(name)
    d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
    py = sys.executable
    if step in ('music', 'all'):
        subprocess.run([py, os.path.join(HERE, 'music.py'), t.STYLE, os.path.join(d, f'musik-{t.STYLE}.wav')], check=True)
    if step in ('cards', 'all'):
        cards = os.path.join(d, 'karten.json')
        json.dump(t.CARDS, open(cards, 'w'), ensure_ascii=False, indent=1)
        subprocess.run(['node', os.path.join(HERE, 'cards.cjs'), cards, d], check=True)
    if step in ('shot', 'all'):
        info = music_info(d, t.STYLE)
        ids = [a for a in rest if not a.startswith('--')]
        fresh = '--neu' in rest
        daytime_cmd = os.environ.get('MM_DAYTIME_CMD')  # z. B. "node daytime.cjs pw {}" – stellt die Tageszeit um
        current = None
        for s, L in zip(t.SHOTS, lengths(t, info)):
            if ids and ids != ['all'] and s['id'] not in ids:
                continue
            out = os.path.join(d, f"{s['id']}.mp4")
            if os.path.exists(out) and not fresh and not ids:
                continue
            spec = s['spec']
            spec = fitted(spec, L + FADE + MARGIN) if spec.get('fit', True) else copy.deepcopy(spec)
            spec.setdefault('slow', float(os.environ.get('MM_SLOW', getattr(t, 'SLOW', 10))))
            sf = os.path.join(d, f"{s['id']}.json")
            json.dump(spec, open(sf, 'w'), indent=1)
            want = s.get('daytime', getattr(t, 'DAYTIME', None))
            if daytime_cmd and want and want != current:
                subprocess.run(daytime_cmd.format(want), shell=True, check=True)
                current = want
                import time; time.sleep(4)
            print(f"== {s['id']} ({L:.1f}s)", flush=True)
            subprocess.run([py, os.path.join(HERE, 'shot.py'), sf, out], check=True)
    if step in ('sheet', 'all'):
        rows = []
        for s in t.SHOTS:
            f = os.path.join(d, f"{s['id']}.mp4")
            if not os.path.exists(f):
                continue
            img = os.path.join(d, f"sheet-{s['id']}.jpg")
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f, '-vf',
                            "select='not(mod(n\\,45))',scale=400:-1,tile=6x1:padding=4", '-frames:v', '1', img], check=True)
            rows.append(img)
        if rows:
            subprocess.run(['convert', *rows, '-append', '-quality', '85', os.path.join(d, 'sheet.jpg')], check=True)
            print(os.path.join(d, 'sheet.jpg'))
    if step in ('cut', 'all'):
        plan = {'music': f'musik-{t.STYLE}.wav', 'dir': d,
                'shots': [{k: v for k, v in s.items() if k in ('bars', 'card', 'cardAt', 'cardEnd', 'start', 'transition')}
                          | {'file': f"{s['id']}.mp4"} for s in t.SHOTS]}
        pf = os.path.join(d, 'schnitt.json'); json.dump(plan, open(pf, 'w'), indent=1)
        out = os.path.join(d, t.FILE)
        subprocess.run([py, os.path.join(HERE, 'cut.py'), pf, out], check=True)


if __name__ == '__main__':
    main()
