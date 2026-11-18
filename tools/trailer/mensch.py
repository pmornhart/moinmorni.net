"""Bausteine „wie echte Menschen“ für die Drehbücher (über drehbuch.py als D.mensch erreichbar).

Jede Funktion liefert Ereignisse für shot.py/ich.py ({"at": Spielsekunden, "actor"/"act"} bzw. "keys"/"look") und die
Zeit, zu der der Darsteller fertig ist. Zufall immer aus einem festen Startwert (`Zufall(seed)`): dieselbe Einstellung
sieht bei jeder Wiederholung gleich aus, verschiedene Darsteller aber verschieden.

Was „menschlich“ hier heißt:
- laufen: nie schnurgerade – kleine Umwege, mal sprinten, mal kurz stehen bleiben und umschauen, ab und zu springen
- Gruppen: einer führt, die anderen folgen mit Abstand und schauen einander an
- Chat: Zeilen mit Tipp-Pause je nach Länge, Kleinschreibung, Füllwörter wie echte Spieler
- Fehler: daneben springen, zu kurz, „nochmal“, kurz ducken vor Ärger
- Ich-Sicht: W gedrückt mit Sprint-Stößen, Blick wackelt leicht, Sprung über Kanten
"""
import math, random


class Zufall(random.Random):
    def __init__(self, seed):
        super().__init__(f'mm-{seed}')


def ev(t, actor, what):
    return {'at': round(t, 2), 'actor': actor, 'act': what}


# ------------------------------------------------------------------ Laufen

def laufen(actor, punkte, t0=0.1, y=None, seed=None, tempo=4.3, sprint=0.3, umweg=1.2, pausen=0.25, springen=0.15,
           blick=None):
    """Über mehrere Punkte (x, z) bzw. (x, y, z) gehen – wie ein Mensch.

    tempo   Blöcke pro Spielsekunde beim Gehen (Sprint ×1,3)
    sprint  Anteil der Stücke, die gerannt werden
    umweg   größter seitlicher Versatz eines Zwischenpunkts in Blöcken
    pausen  Anteil der Stücke, nach denen er kurz stehen bleibt und umschaut
    springen Anteil der Stücke mit einem Sprung unterwegs (Übermut, keine Stufe nötig)
    blick   am Ende hinschauen (Name, „kamera“ oder „x,y,z“)
    """
    r = Zufall(seed or actor)
    out, t = [], t0
    pts = [p if len(p) == 3 else (p[0], y, p[1]) for p in punkte]
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        dx, dz = b[0] - a[0], b[2] - a[2]
        d = math.hypot(dx, dz) or 1
        nx, nz = -dz / d, dx / d
        # Zwischenpunkt neben der geraden Linie (nur bei längeren Stücken)
        hops = [b]
        if d > 6 and umweg > 0:
            k = r.uniform(0.35, 0.65)
            s = r.uniform(-umweg, umweg)
            hops = [(a[0] + dx * k + nx * s, b[1], a[2] + dz * k + nz * s), b]
        prev = a
        for h in hops:
            run = r.random() < sprint
            last = h is b and i == len(pts) - 1
            extra = f' blick={blick}' if last and blick else ''
            out.append(ev(t, actor, f'{"lauf" if run else "geh"} {h[0]:.1f} {h[1]} {h[2]:.1f}{extra}'))
            dist = math.hypot(h[0] - prev[0], h[2] - prev[2])
            dur = dist / (tempo * (1.3 if run else 1)) + 0.4
            if r.random() < springen and dist > 3:
                out.append(ev(t + dur * r.uniform(0.3, 0.7), actor, 'springe 1'))
            t += dur
            prev = h
        if i < len(pts) - 1 and r.random() < pausen:
            out += umschauen(actor, t, seed=r.random())
            t += 1.2
    return out, t


def umschauen(actor, t, ziele=('frei',), seed=None):
    """Kurz stehen und umherschauen (Kopf wandert weich – das macht der Darsteller selbst im Leerlauf)."""
    r = Zufall(seed or actor)
    out = [ev(t, actor, f'blick {r.choice(list(ziele))}')]
    out.append(ev(t + r.uniform(0.6, 1.1), actor, 'blick frei'))
    return out


def gruppe(fuehrer, andere, punkte, t0=0.1, y=None, abstand=2.2, seed=None, plaudern=()):
    """Eine Gruppe läuft zusammen: einer geht voran (menschlich), die anderen folgen mit leicht verschiedenem Abstand
    und schauen sich zwischendurch an. `plaudern` = Chat-Zeilen [(name, text), …], die unterwegs fallen."""
    r = Zufall(seed or fuehrer)
    out, t_end = laufen(fuehrer, punkte, t0, y=y, seed=r.random(), sprint=0.1, pausen=0.15)
    for i, n in enumerate(andere):
        out.append(ev(t0 + 0.3 + 0.35 * i, n, f'folge {fuehrer} {abstand + 0.6 * i + r.uniform(-0.3, 0.3):.1f}'))
        out.append(ev(t0 + r.uniform(1.5, 3.5), n, f'blick {r.choice([fuehrer] + list(andere))}'))
        out.append(ev(t0 + r.uniform(4, 6), n, 'blick frei'))
    out += chat(plaudern, t0 + 1.0, seed=r.random())
    return out, t_end + 0.8


# ------------------------------------------------------------------ Chat

FUELLER = ['', '', ' xD', ' :D', ' haha', ' lol', '!!', ' :)']


def chat(zeilen, t0=0.5, seed=None, tippen=0.07):
    """Chat-Zeilen [(name, text), …] mit Tipp-Pause nach Länge; ab und zu ein Füllwort dahinter."""
    r = Zufall(seed or 'chat')
    out, t = [], t0
    for name, text in zeilen:
        t += 0.4 + len(text) * tippen * r.uniform(0.7, 1.3)
        if r.random() < 0.3 and not text.endswith(('?', '!')):
            text += r.choice(FUELLER)
        out.append(ev(t, name, f'chat {text}'))
    return out


def gruss(actor, t, chat_text=None):
    """Ducken als Gruß (zweimal), dazu optional ein „hey“."""
    out = [ev(t, actor, 'gruss 2')]
    if chat_text:
        out.append(ev(t + 0.6, actor, f'chat {chat_text}'))
    return out


# ------------------------------------------------------------------ Kleine Fehler

def verfehlen(actor, t, ziel, zurueck, y=None, seed=None, aerger=('nein', 'ups', 'argh', 'nochmal')):
    """Auf einen Punkt zu rennen und springen, aber zu kurz – kurzer Ärger im Chat, zurück und nochmal.
    ziel/zurueck: (x, z) bzw. (x, y, z)."""
    r = Zufall(seed or actor)
    zx, zy, zz = ziel if len(ziel) == 3 else (ziel[0], y, ziel[1])
    bx, by, bz = zurueck if len(zurueck) == 3 else (zurueck[0], y, zurueck[1])
    out = [ev(t, actor, f'renne {zx:.1f} {zz:.1f} 0.7 springe'),
           ev(t + 1.6, actor, 'schleiche an'), ev(t + 1.9, actor, 'schleiche aus'),
           ev(t + 2.0, actor, f'chat {r.choice(aerger)}'),
           ev(t + 2.6, actor, f'geh {bx:.1f} {by} {bz:.1f}'),
           ev(t + 4.6, actor, f'renne {zx:.1f} {zz:.1f} 1.1 springe')]
    return out, t + 6.0


# ------------------------------------------------------------------ Ich-Sicht (ich.py)

def ich_laufen(t0, dauer, seed='ich', sprint=0.5, springen=0.2):
    """Tasten für die Ich-Sicht: W die ganze Zeit, dazwischen Sprint-Stöße (Strg) und Sprünge; dazu leichte
    Blick-Wackler (relativ, über 'look' mit 'dyaw' – ich.py nimmt sie als Abweichung zum letzten Ziel)."""
    r = Zufall(seed)
    keys = [{'at': t0, 'key': 'w', 'dur': dauer}]
    t = t0 + r.uniform(0.3, 0.8)
    while t < t0 + dauer - 0.5:
        if r.random() < sprint:
            keys.append({'at': round(t, 2), 'key': 'ctrl', 'dur': round(r.uniform(0.8, 2.0), 2)})
        if r.random() < springen:
            keys.append({'at': round(t + 0.4, 2), 'key': 'space', 'dur': 0.15})
        t += r.uniform(1.0, 2.2)
    return keys


def merge(*teile):
    """Ereignis-Listen (oder (liste, ende)-Paare) zusammenlegen."""
    out = []
    for x in teile:
        out += x[0] if isinstance(x, tuple) else x
    return sorted(out, key=lambda e: e['at'])
