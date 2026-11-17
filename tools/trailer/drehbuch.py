"""Gemeinsame Regie für die Drehbücher ab Adlerflug (Adlerflug, Versteckerl, Wintersport, Angelkönig).

Ein Drehbuch (trailers/<name>.py) legt wie gewohnt STYLE, FILE, CARDS und SHOTS an. Eine Einstellung hat zusätzlich
  'kind'  'kamera' (Kamerafahrt mit shot.py, Standard) oder 'ich' (Ich-Sicht mit ich.py, Anzeige an)
  'prep'  Funktion, die vorher läuft (Vorspulen, Darsteller hinstellen …)
  'spec'  Einstellung wie bei shot.py/ich.py – oder eine Funktion, die sie erst kurz vor der Aufnahme baut
Die Länge kommt aus den Takten der Musik (wie in make.py): Kamerafahrten werden gestreckt, die Ich-Sicht bekommt
genau die nötige Dauer. Aufgenommen wird mit `python3 trailers/<name>.py <einstellung …>`, Schnitt und Bildübersicht
wie immer mit make.py (cards, music, sheet, cut).

Umgebung wie bei shot.py: MM_RCON, MM_RCON_PASS, MM_CAMERA, MM_DISPLAY, MM_ACTORS_FIFO.
Videos zeigen echte Minecraft-Grafik: nur lokal (~/mm-cache/trailer/<name>/).
"""
import copy, json, math, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make  # noqa: E402

_rc = None


def rc(cmd):
    """RCON-Befehl, Antwort ohne Farbcodes."""
    global _rc
    if _rc is None:
        from shot import Rcon
        _rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    try:
        return re.sub('§.', '', _rc(cmd))
    except OSError:
        _rc = None
        return rc(cmd)


def at(dim, cmd):
    return rc(f'execute in {dim} run {cmd}' if dim else cmd)


def say(*lines):
    """Befehle an die Darsteller (actors/regie.cjs)."""
    with open(os.environ['MM_ACTORS_FIFO'], 'a') as f:
        for line in lines:
            f.write(line + '\n')


def nums(text):
    return [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?(?:E-?\d+)?', text)]


def pos(name):
    v = nums(rc(f'data get entity {name} Pos'))
    return v[-3:] if len(v) >= 3 else None


def pause_menu_open(display=None):
    """Liegt das Spielmenü (Escape) über dem Bild? Erkennt die graue Taste „Zurück zum Spiel“ (1600×900, GUI 3)."""
    display = display or os.environ.get('MM_DISPLAY', ':98')
    try:
        raw = subprocess.run(['import', '-window', 'root', '-crop', '1x1+600+262', '-depth', '8', 'rgb:-'],
                             env=dict(os.environ, DISPLAY=display), capture_output=True, timeout=20).stdout
        raw2 = subprocess.run(['import', '-window', 'root', '-crop', '1x1+1000+262', '-depth', '8', 'rgb:-'],
                              env=dict(os.environ, DISPLAY=display), capture_output=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    gray = lambda b: len(b) >= 3 and 100 <= b[0] <= 125 and b[0] == b[1] == b[2]
    return gray(raw) and gray(raw2)


def close_pause_menu(display=None):
    """Spielmenü schließen, falls es offen ist (z. B. nach einem überzähligen Escape)."""
    display = display or os.environ.get('MM_DISPLAY', ':98')
    if pause_menu_open(display):
        subprocess.run(['xdotool', 'key', 'Escape'], env=dict(os.environ, DISPLAY=display))
        time.sleep(1.5)
        return True
    return False


def until(cond, t=20, step=0.3, what=''):
    end = time.time() + t
    while time.time() < end:
        v = cond()
        if v:
            return v
        time.sleep(step)
    raise SystemExit(f'Zeit abgelaufen: {what}')


def slow_when_near(name, point, dist, slow, timeout=60):
    """In normaler Geschwindigkeit laufen lassen, bis `name` höchstens `dist` Blöcke von `point` entfernt ist –
    dann sofort Zeitlupe (tick rate 20/slow). So beginnt eine Einstellung mitten in einem Flug oder einer Fahrt."""
    rc('tick rate 20')
    end = time.time() + timeout
    best = None
    while time.time() < end:
        p = pos(name)
        if p:
            d = math.dist(p, point)
            best = d if best is None else min(best, d)
            if d <= dist:
                rc(f'tick rate {20 / slow:g}')
                return d
        time.sleep(0.02)
    rc(f'tick rate {20 / slow:g}')
    raise SystemExit(f'{name} kam nicht nah genug an {point} (am nächsten {best})')


def lengths(t):
    info = make.music_info(os.path.join(make.OUT, t.NAME), t.STYLE)
    return dict(zip([s['id'] for s in t.SHOTS], make.lengths(t, info)))


def record(t, sid):
    """Eine Einstellung vorbereiten und aufnehmen (Länge aus den Takten der Musik)."""
    s = next(x for x in t.SHOTS if x['id'] == sid)
    need = lengths(t)[sid] + make.FADE + make.MARGIN + s.get('start', 0)
    spec = s['spec']() if callable(s['spec']) else copy.deepcopy(s['spec'])
    kind = s.get('kind', 'kamera')
    dim = getattr(t, 'DIM', None)
    if kind == 'kamera':  # Kamera schon vorher hinstellen: der Client lädt die Gegend, während vorbereitet wird
        cam = os.environ.get('MM_CAMERA', 'MorniTest')
        p0, l0 = spec['camera'][0]['p'], spec['camera'][0].get('look', spec['camera'][0]['p'])
        dx, dy, dz = l0[0] - p0[0], l0[1] - p0[1], l0[2] - p0[2]
        yaw, pitch = math.degrees(math.atan2(-dx, dz)), -math.degrees(math.atan2(dy, math.hypot(dx, dz) or 1e-6))
        if hasattr(t, 'before_camera'):  # z. B. den Aufnahme-Client aus einem Flug oder einer Runde nehmen
            t.before_camera()
        rc('minecraft:spectate')
        rc(f'gamemode spectator {cam}')
        at(dim, f'tp {cam} {p0[0]} {p0[1]} {p0[2]} {yaw:.1f} {pitch:.1f}')
        time.sleep(float(s.get('preload', 8)))
    if s.get('prep'):
        s['prep']()
    spec.setdefault('slow', float(os.environ.get('MM_SLOW', getattr(t, 'SLOW', 20))))
    if dim:
        spec.setdefault('dim', dim)
    d = os.path.join(make.OUT, t.NAME)
    os.makedirs(d, exist_ok=True)
    out = os.path.join(d, f'{sid}.mp4')
    sf = os.path.join(d, f'{sid}.json')
    if kind == 'ich':
        spec.setdefault('duration', need)
        tool = 'ich.py'
    else:
        if spec.get('fit', True):
            spec = make.fitted(spec, need)
        spec.pop('fit', None)
        tool = 'shot.py'
    json.dump(spec, open(sf, 'w'), indent=1)
    print(f'== {sid} ({kind}, {need:.1f}s)', flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, tool), sf, out], check=True)
    if s.get('after'):
        s['after']()
    return out


def main(t, args):
    """Aufruf aus einem Drehbuch: python3 trailers/<name>.py [einstellung …] (ohne Angabe: alle)."""
    ids = args or [s['id'] for s in t.SHOTS]
    for sid in ids:
        record(t, sid)
