"""Trailer: MorniSMP – Überleben mit freiem Markt: schwebende Marktstadt, Läden, Auktionshaus, Reisetore, Wildnis.

Gedreht auf einem eigenen Test-Server mit Morni-SMP (Paper 26.1.2 + ViaVersion/ViaBackwards für den 26.3-Client,
Netzwerk-Ersatz aus `test/fake-network`, Port 25740, RCON 25840, view-distance 12; `KEEP=1 SKIP_TEST=1 FRESH=1
test/run.sh` einmal, danach von Hand mit höherer Sichtweite gestartet). Die Stadt steht in der Spawn-Welt
`minecraft:smp_spawn` (Boden y 90, Füße 91). Kamera = echter Client „SmpKamera“ (MM_CAMERA, ohne OP – sonst stehen
Konsolen-Meldungen im Chat), Darsteller Anna Toni Clara Dora Fritz (fünf verschiedene Standard-Skins) (`mornismp/smp-actors.cjs`, Datei per
`tail -n0 -F` = MM_ACTORS_FIFO).

Alles Spielgeschehen macht das Plugin selbst:
- Markt: `mornismp/markt.cjs` richtet ihn über die echten Abläufe ein – Test-Spieler mieten Stände über das
  Standschild, eröffnen Ladenkisten mit „[Laden]“-Schild (Preis im Menü eingetippt) und stellen 30 Angebote ins
  Auktionshaus. Nur Kisten, Fässer und Schilder stellt die Konsole hin.
- 02: Dora kauft wirklich Brot an Annas Ladenkiste. 03: Ich-Sicht (`mornismp/pov.py`): die Kamera ist selbst Spieler,
  klickt den Tresen an, das Auktionshaus geht auf, sie kauft 16 Diamanten (echte Klicks per xdotool, Anzeige an).
  04: Fritz verkauft Weizen an die Stadt. 05: Dora mietet Stand 11 über das Schild (Schild wechselt auf „Dora“).
  07: Anna geht durchs Reisetor – ein echter Schritt (Bewegungspaket) ins Tor, das Plugin schickt sie in die Oberwelt.
  08: Ich-Sicht – die Kamera tippt `/gs sichern` in den Chat, das Plugin zeigt ihr den grünen Rand. 11: Clara setzt Kopfgeld auf Anna, Toni besiegt sie (echte Schläge), 12: Anna wacht in
  der Marktstadt wieder auf.
Videos nur lokal (~/mm-cache/trailer/mornismp/), nie ins Repo.

  python3 trailers/mornismp.py [einstellung …]      # drehen (ohne Angabe: alle)
"""
import json, math, os, subprocess, sys, time

STYLE = 'mirni'
FILE = 'MorniNet-Trailer-MorniSMP.mp4'
SLOW = 12
TOWN = 'minecraft:smp_spawn'
OW = 'minecraft:overworld'
G = 91          # Füße auf dem Stadtboden
MEADOW = 104    # Füße auf der Almwiese (Oberwelt, Chunk -6/-4)
FIGHT = 103     # Füße am Kampfplatz (Oberwelt)

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'morni.net · Spielmodus', 'title': 'MorniSMP',
     'text': 'Überleben mit freiem Markt – handeln, bauen, entdecken'},
    {'file': 'lt-markt.png', 'kind': 'lower', 'title': 'Die Marktstadt', 'text': 'Sie schwebt in ihrer eigenen Welt – hier wird gehandelt'},
    {'file': 'lt-auktion.png', 'kind': 'lower', 'title': 'Auktionshaus', 'text': 'Bezahlt wird mit Talern – nur Spielgeld, nichts zu kaufen'},
    {'file': 'lt-ankauf.png', 'kind': 'lower', 'title': 'Ankauf', 'text': 'Die Stadt kauft deine Ernte'},
    {'file': 'lt-stand.png', 'kind': 'lower', 'title': 'Eigener Marktstand', 'text': 'Schild anklicken – und los geht’s'},
    {'file': 'lt-tore.png', 'kind': 'lower', 'title': 'Drei Reisetore', 'text': 'Oberwelt, Nether und End'},
    {'file': 'lt-reise.png', 'kind': 'lower', 'title': 'Einfach hindurchgehen', 'text': '… und du landest an einem sicheren Platz'},
    {'file': 'lt-gs.png', 'kind': 'lower', 'title': 'Grundstück sichern', 'text': 'Dein Land – niemand baut dir hinein'},
    {'file': 'lt-nether.png', 'kind': 'lower', 'title': 'Nether und End', 'text': 'Ganz so, wie du sie kennst'},
    {'file': 'lt-kopfgeld.png', 'kind': 'lower', 'title': 'Kopfgeld', 'text': 'Wer den Gesuchten besiegt, kassiert'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'morni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „MorniSMP“ anklicken'},
]


def walk(points, speed=4.3, look=None):
    """Gehweg mit gleichmäßigem Tempo (Blöcke pro Sekunde)."""
    out = [{'p': points[0], 't': 0}]
    for a, b in zip(points, points[1:]):
        out.append({'p': b, 't': math.dist(a, b) / speed})
    if look:
        for q in out:
            q['look'] = look
    return out


def stand(p, t, look=None, yaw=None):
    q = {'p': p, 't': 0}
    q2 = {'p': p, 't': t}
    if look:
        q['look'] = q2['look'] = look
    if yaw is not None:
        q['yaw'] = q2['yaw'] = yaw
    return [q, q2]


# ---------------------------------------------------------------- Rand eines Grundstücks (wie /gs grenzen)
GREEN = 'minecraft:dust{color:[0.169,0.714,0.451],scale:1.6}'


def border(at, cx, cz, y, dim=OW):
    """Grüne Staub-Punkte an den Rändern des Chunks cx/cz in Höhe y+0,3 und y+1,5 – wie ClaimCommand.edge (dort alle
    2 Blöcke und Größe 1,2; hier jeder Block und 1,6, damit man den Rand auch aus der Entfernung sieht)."""
    x0, z0 = cx * 16, cz * 16
    ev = []
    for i in range(0, 17):
        for dy in (0.3, 1.5):
            for x, z in ((x0 + i, z0), (x0 + i, z0 + 16), (x0, z0 + i), (x0 + 16, z0 + i)):
                ev.append({'at': at, 'cmd': f'execute in {dim} run particle {GREEN} {x} {y + dy} {z} 0 0 0 0 1 force @a'})
    return ev


# ---------------------------------------------------------------- Ich-Sicht im Auktionshaus (Bildschirm 1600×900,
# GUI-Maßstab 3: großes Menü 6 Reihen links oben bei 178/39, Nachfrage 3 Reihen bei 178/66 – Platz-Mitte in Pixeln)
def slot6(i):
    return [(194 + 18 * (i % 9)) * 3, (65 + 18 * (i // 9)) * 3]


def slot3(i):
    return [(194 + 18 * (i % 9)) * 3, (92 + 18 * (i // 9)) * 3]


DIAMONDS = 27   # 16 Diamanten für 240 ₮ von Sepp (Sortierung „günstigste zuerst“; Platz vorher im Menü nachsehen)

SHOTS = [
    # ------------------------------------------------ Anflug: unter der schwebenden Insel hindurch, über die Mauer
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': {
        'dim': TOWN,
        'camera': [{'p': [30, 62, 120], 'look': [0, 80, 0], 't': 0},
                   {'p': [24, 84, 88], 'look': [0, 88, 0], 't': 3.6},
                   {'p': [16, 104, 60], 'look': [0, 92, 0], 't': 3.4},
                   {'p': [10, 111, 36], 'look': [0, 92, -4], 't': 3.5, 'ease': 1}]}},
    # ------------------------------------------------ Markt: Dora kauft Brot an Annas Stand (2), Toni hinter Stand 3
    {'id': '02-markt', 'bars': 2, 'card': 'lt-markt.png',
     'before': ['rc:clear Dora', 'rc:clear Anna', 'rc:clear Toni', 'Dora slot 0'], 'spec': {
        'dim': TOWN,
        'camera': [{'p': [-0.6, 93.7, -8.6], 'look': [-6.6, 92.2, -14.0], 't': 0},
                   {'p': [-2.4, 93.3, -10.4], 'look': [-7.0, 92.0, -14.2], 't': 5.9, 'ease': 1}],
        'actors': {'Anna': stand([-5.6, G, -14.6], 5.9, look=[-6.6, 92.5, -12.2]),
                   'Toni': stand([7.0, G, -14.6], 5.9, look=[7.5, 92.4, -12.0]),
                   'Dora': walk([[-10.6, G, -10.2], [-6.5, G, -12.4]], 2.8)
                   + [{'p': [-6.5, G, -12.4], 't': 0.1, 'look': [-6.6, 91.6, -13.5], 'hold': 1.4}]
                   + walk([[-6.5, G, -12.4], [-4.2, G, -12.9], [-2.6, G, -17.0]], 2.4)[1:],
                   'Clara': stand([-11.4, G, -12.3], 5.9, look=[-11.5, 91.6, -13.6]),
                   'Fritz': walk([[-1.0, G, -24.0], [0.0, G, -16.0], [3.5, G, -12.6]], 2.4)},
        'events': [{'at': 1.85, 'actor': 'Dora', 'act': 'activate', 'arg': '-7 91 -14'},
                   {'at': 1.9, 'actor': 'Anna', 'act': 'swing'},
                   {'at': 2.3, 'actor': 'Dora', 'act': 'click', 'arg': '13'},
                   {'at': 2.45, 'actor': 'Anna', 'act': 'swing'},
                   {'at': 2.75, 'actor': 'Dora', 'act': 'close'},
                   {'at': 3.3, 'actor': 'Clara', 'act': 'swing'}]}},
    # ------------------------------------------------ Ich-Sicht: Tresen anklicken, 16 Diamanten kaufen
    {'id': '03-auktion', 'bars': 2, 'card': 'lt-auktion.png', 'cardAt': 0.3, 'cardEnd': 3.25, 'pov': {
        'dim': TOWN,
        'setup': ['clear SmpKamera', 'smpadmin geld setzen SmpKamera 3100'],
        'path': [{'p': [-10.5, G, -23.6], 'yaw': 178, 'pitch': 6, 't': 0},
                 {'p': [-10.5, G, -24.6], 'yaw': 180, 'pitch': 12, 't': 0.9, 'ease': 1}],
        'until': 0.95,
        'events': [{'at': 1.0, 'rclick': 1},
                   {'at': 1.3, 'mouse': slot6(DIAMONDS), 'dur': 0.8},
                   {'at': 2.35, 'click': 1},
                   {'at': 2.65, 'mouse': slot3(11), 'dur': 0.4},
                   {'at': 3.35, 'click': 1}],
        'zoom': {'z': 1.35, 'cx': 800, 'cy': 440, 'in': [1.15, 1.7], 'out': [3.4, 3.9]}}},
    # ------------------------------------------------ Ankauf: Fritz verkauft Weizen über den Tresen der Markthalle
    {'id': '04-ankauf', 'bars': 1, 'card': 'lt-ankauf.png', 'start': 0.5,
     'before': ['rc:clear Fritz', 'rc:give Fritz wheat 32', 'Fritz slot 0'], 'spec': {
        'dim': TOWN,
        'camera': [{'p': [23.2, 93.4, -4.6], 'look': [25.0, 91.9, -12.5], 't': 0},
                   {'p': [23.3, 93.2, -5.5], 'look': [25.0, 91.9, -12.5], 't': 3.6}],
        'actors': {'Fritz': walk([[19.0, G, -6.8], [22.7, G, -6.9], [22.7, G, -8.6]], 3.6)
                   + [{'p': [22.6, G, -8.6], 't': 0.1, 'look': [24.5, 91.5, -8.5], 'hold': 1.2}]
                   + [{'p': [22.6, G, -8.6], 't': 0.5, 'look': [22.6, 93.0, -5.0], 'hold': 0.6}]},
        'events': [{'at': 1.4, 'actor': 'Fritz', 'act': 'activate', 'arg': '24 91 -9'},
                   {'at': 1.75, 'actor': 'Fritz', 'act': 'click', 'arg': '81 shift'},
                   {'at': 2.1, 'actor': 'Fritz', 'act': 'click', 'arg': '49'},
                   {'at': 2.4, 'actor': 'Fritz', 'act': 'close'}]}},
    # ------------------------------------------------ Marktstand mieten: Schild von Stand 11 anklicken
    {'id': '05-stand', 'bars': 1, 'card': 'lt-stand.png',
     'before': ['rc:smpadmin stand frei 12', 'rc:smpadmin stand frei 11'], 'spec': {
        'dim': TOWN,
        'camera': [{'p': [6.5, 93.75, 10.7], 'look': [7.5, 93.2, 13.5], 't': 0},
                   {'p': [6.75, 93.7, 11.2], 'look': [7.5, 93.2, 13.5], 't': 3.6}],
        'actors': {'Dora': stand([8.85, G, 12.0], 3.6, look=[7.5, 93.5, 13.5])},
        'events': [{'at': 0.7, 'actor': 'Dora', 'act': 'activate', 'arg': '7 93 13'},
                   {'at': 1.2, 'actor': 'Dora', 'act': 'click', 'arg': '13'}]}},
    # ------------------------------------------------ Die Reisetore: Nether-Tor mit Funken
    {'id': '06-tore', 'bars': 2, 'card': 'lt-tore.png', 'spec': {
        'dim': TOWN,
        'camera': [{'p': [0.9, 93.2, -27.5], 'look': [0.5, 94.6, -46], 't': 0},
                   {'p': [0.6, 93.7, -36.0], 'look': [0.5, 95.0, -46], 't': 5.9, 'ease': 1}],
        'actors': {'Clara': walk([[-1.3, G, -31.0], [-0.6, G, -41.2]], 2.2)
                   + [{'p': [-0.6, G, -41.2], 't': 0.1, 'look': [0.5, 96.5, -46], 'hold': 1.2}]}}},
    # ------------------------------------------------ Anna geht durchs Westtor (Oberwelt) – das Plugin schickt sie los
    {'id': '07-reise', 'bars': 2, 'card': 'lt-reise.png', 'spec': {
        'dim': TOWN,
        'camera': [{'p': [-27.5, 93.2, 3.8], 'look': [-38, 92, 0.5], 't': 0},
                   {'p': [-33.5, 93.0, 2.6], 'look': [-46, 93, 0.5], 't': 3.4},
                   {'p': [-35.0, 93.1, 2.2], 'look': [-46, 93.4, 0.5], 't': 2.5, 'ease': 1}],
        'actors': {'Anna': walk([[-31.0, G, 1.6], [-40.0, G, 0.6], [-44.55, G, 0.5]], 3.0)
                   + [{'p': [-44.55, G, 0.5], 't': 1.35}]},
        # Der Schritt ins Tor kommt erst nach dem Schnitt (bei 4,97 s): das Plugin stellt Reisende für einen Moment
        # zurück vors Tor, bis der Platz gefunden ist – das soll im Trailer nicht als Zucken zu sehen sein.
        'events': [{'at': 5.0, 'cmd': '#release Anna'},
                   {'at': 5.02, 'actor': 'Anna', 'act': 'step', 'arg': '-45.4 91 0.5'}]}},
    # ------------------------------------------------ Oberwelt: Almwiese, /gs sichern, grüner Rand
    {'id': '08-grundstueck', 'bars': 2, 'card': 'lt-gs.png',
     'before': ['Anna chat /gs aufgeben', 'rc:regie als SmpKamera gs aufgeben', 'sleep:1'], 'pov': {
        # Ich-Sicht: die Kamera tippt selbst „/gs sichern“ – das Plugin sichert den Chunk und zeigt dem Spieler den
        # grünen Rand (ClaimCommand.show, 10 s lang)
        'dim': OW, 'wait': 14, 'cursor': 0,
        'setup': [f'execute in {OW} run tp Anna -70.0 {FIGHT} -48.7'],
        'path': [{'p': [-88.5, MEADOW - 1, -61.3], 'yaw': 102, 'pitch': 14, 't': 0},
                 {'p': [-88.5, MEADOW - 1, -61.3], 'yaw': 104, 'pitch': 15, 't': 1.8},
                 {'p': [-88.5, MEADOW - 1, -61.3], 'yaw': 158, 'pitch': 18, 't': 4.1, 'ease': 1}],
        'events': [{'at': 0.3, 'key': 't'},
                   {'at': 0.45, 'text': '/gs sichern', 'dur': 1.0},
                   {'at': 1.6, 'key': 'Return'}]}},
    # ------------------------------------------------ Nether: Karmesinwald
    {'id': '09-nether', 'bars': 1, 'card': 'lt-nether.png', 'nv': True, 'spec': {
        'dim': 'minecraft:the_nether', 'wait': 16,
        'camera': [{'p': [-189.0, 53.6, 579.5], 'look': [-172, 50.5, 598], 't': 0},
                   {'p': [-186.0, 53.2, 583.2], 'look': [-171, 50.0, 598], 't': 3.6}]}},
    # ------------------------------------------------ End: von der Mitte aus dem Drachen nachschauen (Säulen, Kristalle)
    {'id': '10-end', 'bars': 1, 'nv': True, 'start': 0.35, 'grade': 'eq=gamma=1.12:saturation=1.1', 'spec': {
        'dim': 'minecraft:the_end', 'wait': 16, 'follow': '@e[type=minecraft:ender_dragon,limit=1]',
        'camera': [{'p': [14.0, 74.0, 16.0], 'look': [30, 80, 30], 't': 0},
                   {'p': [12.0, 76.0, 17.5], 'look': [30, 80, 30], 't': 3.6}]}},
    # ------------------------------------------------ Kopfgeld: Clara setzt 150 ₮ auf Anna, Toni holt es sich
    {'id': '11-kampf', 'bars': 2, 'card': 'lt-kopfgeld.png',
     'before': ['Anna respawn', 'sleep:3', 'rc:clear Anna', 'rc:clear Toni', 'rc:give Toni diamond_sword', 'rc:give Anna iron_sword',
                'rc:effect give Anna instant_health 1 5 true', 'rc:effect clear Toni', 'Anna slot 0', 'Toni slot 0',
                'rc:smpadmin geld geben Clara 500', 'Clara chat /kopfgeld Anna 150'], 'spec': {
        'dim': OW, 'wait': 10,
        'camera': [{'p': [-65.0, 105.0, -44.6], 'look': [-69, 104.3, -49], 't': 0},
                   {'p': [-66.6, 104.7, -44.4], 'look': [-69.4, 104.0, -49], 't': 5.9}],
        'actors': {'Anna': [{'p': [-70.0, FIGHT, -48.7], 't': 0, 'yaw': -60},
                            {'p': [-70.0, FIGHT, -48.7], 't': 1.2, 'yaw': -100},
                            {'p': [-69.8, FIGHT, -48.8], 't': 0.5, 'look': [-67.6, 104.6, -49.3]},
                            {'p': [-70.3, FIGHT, -48.7], 't': 1.0, 'look': [-67.6, 104.6, -49.3]},
                            {'p': [-70.6, FIGHT, -48.6], 't': 0.6, 'look': [-67.6, 104.6, -49.3]},
                            {'p': [-70.6, FIGHT, -48.6], 't': 2.6}],
                   'Toni': walk([[-61.5, FIGHT, -51.5], [-67.6, FIGHT, -49.3]], 4.6, look=None)
                   + [{'p': [-67.6, FIGHT, -49.3], 't': 0.1, 'look': [-70.2, 104.4, -48.7], 'hold': 2.2},
                      {'p': [-67.8, FIGHT, -49.2], 't': 1.6, 'look': [-70.6, 103.4, -48.6]}]},
        'events': [{'at': 1.75, 'actor': 'Toni', 'act': 'attack', 'arg': 'Anna'},
                   {'at': 2.15, 'actor': 'Anna', 'act': 'attack', 'arg': 'Toni'},
                   {'at': 2.45, 'actor': 'Toni', 'act': 'attack', 'arg': 'Anna'},
                   {'at': 3.1, 'actor': 'Toni', 'act': 'attack', 'arg': 'Anna'},
                   {'at': 3.75, 'actor': 'Toni', 'act': 'attack', 'arg': 'Anna'},
                   {'at': 3.12, 'cmd': '#release Anna'},
                   {'at': 4.2, 'actor': 'Toni', 'act': 'swing'}]}},
    # ------------------------------------------------ Zurück in der Marktstadt, hinaus über die Insel
    {'id': '12-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5,
     'before': ['Anna respawn', 'sleep:3'], 'spec': {
        'dim': TOWN,
        'camera': [{'p': [0.5, 93.0, 15.5], 'look': [0.5, 94, 0.5], 't': 0},
                   {'p': [0.5, 101, 30], 'look': [0.5, 95, 0], 't': 3},
                   {'p': [14, 122, 78], 'look': [0, 88, 0], 't': 5.4, 'ease': 1}],
        'actors': {'Anna': stand([0.5, G, 10.0], 8.4, look=[0.5, 93.5, 16]),
                   'Dora': stand([-6.2, G, -12.4], 8.4, yaw=180),
                   'Clara': stand([7.6, G, -12.2], 8.4, yaw=180),
                   'Toni': stand([7.0, G, -14.6], 8.4, yaw=0),
                   'Fritz': walk([[-4.5, G, 8.5], [-9.5, G, 1.5], [-9.5, G, -6.5]], 2.0)},
        'events': [{'at': 0.5, 'actor': 'Anna', 'act': 'swing'}, {'at': 0.9, 'actor': 'Anna', 'act': 'swing'},
                   {'at': 1.3, 'actor': 'Anna', 'act': 'swing'}]}},
]

# ---------------------------------------------------------------- Drehen

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)


def main(ids):
    sys.path.insert(0, TOOLS)
    import make
    from shot import Rcon
    t = make.load('mornismp')
    out = os.path.join(make.OUT, 'mornismp')
    info = make.music_info(out, t.STYLE)
    rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    fifo = os.environ['MM_ACTORS_FIFO']
    cam = os.environ.get('MM_CAMERA', 'SmpKamera')
    for s, L in zip(t.SHOTS, make.lengths(t, info)):
        if ids and s['id'] not in ids:
            continue
        need = L + make.FADE + make.MARGIN
        print(f"== {s['id']} ({L:.1f}s)", flush=True)
        for b in s.get('before', []):
            if b.startswith('rc:'):
                print('  ', b[3:], '→', rc(b[3:]).strip()[:80])
            elif b.startswith('sleep:'):
                time.sleep(float(b[6:]))
            else:
                with open(fifo, 'a') as f:
                    f.write(b + '\n')
                time.sleep(0.4)
        time.sleep(1.0)
        if s.get('nv'):
            rc(f'effect give {cam} night_vision infinite 0 true')
        mp4 = os.path.join(out, f"{s['id']}.mp4")
        sf = os.path.join(out, f"{s['id']}.json")
        try:
            if 'pov' in s:
                spec = dict(s['pov'], duration=need)
                spec.setdefault('slow', SLOW)
                json.dump(spec, open(sf, 'w'), indent=1)
                subprocess.run([sys.executable, os.path.join(HERE, 'mornismp', 'pov.py'), sf, mp4], check=True)
            else:
                spec = make.fitted(s['spec'], need)
                spec.setdefault('slow', float(os.environ.get('MM_SLOW', SLOW)))
                json.dump(spec, open(sf, 'w'), indent=1)
                subprocess.run([sys.executable, os.path.join(HERE, 'mornismp', 'smp_shot.py'), sf, mp4], check=True)
        finally:
            if s.get('nv'):
                rc(f'effect clear {cam} night_vision')
        if s.get('grade'):  # etwas aufhellen (das End ist sehr dunkel)
            tmp = mp4 + '.tmp.mp4'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp4, '-vf', s['grade'], '-c:v', 'libx264',
                            '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', tmp], check=True)
            os.replace(tmp, mp4)


if __name__ == '__main__':
    main(sys.argv[1:])
