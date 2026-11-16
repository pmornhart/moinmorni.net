"""Trailer: MorniCraft – Überleben mit Freunden: schwebende Spawn-Insel, Start-Elytra, Ränge und Clans, Zuhause,
Gräber, Sitzen, Portale zum Nether und End, mächtiger Enderdrache.

Gedreht auf einem eigenen Test-Server: Paper 26.1.2 + MorniCraft 1.11.0 + ViaVersion/ViaBackwards 5.12.2 (für den
26.3-Client), Port 25750, RCON 25850, view-distance 12, normale Welt. In `plugins/MorniCraft/config.yml`:
`spawn-island: 'on'` und `network: 'off'` (in Anführungszeichen – YAML liest on/off sonst als true/false), für den Dreh
`teleport-delay: 3` und `dragon.attack-seconds: 60` (die Angriffe löst das Drehbuch selbst aus). Dazu das Hilfs-Plugin
„Trailer-Regie“ (`regie als <spieler> <befehl>`, nur im Test-Server, liegt im Cache). MorniCraft baut die Insel selbst
über tiefem Meer (hier Mitte x -467, z 272, Wiese y 169, Füße 170; Welt-Spawn 9 südlich der Mitte).

Kamera = echter Client „McKamera“ (MM_CAMERA, ohne OP), Darsteller Anna Toni Clara Dora Fritz
(`mornicraft/mc-actors.cjs`, Datei per `tail -n0 -F` = MM_ACTORS_FIFO). Vorher per RCON: Ränge `rang Anna owner`,
`rang Clara moderator`, `rang Dora vip`, `rang Toni media`; Clans gründen die Darsteller selbst im Chat
(`/clan create Almrausch ALM`, `/clan farbe gruen`, `/clan invite …`, `/clan accept`; Toni: Seebande SEE, himmelblau).
Zuhause der Kamera (Turm, Teich, Pavillon) per `regie als McKamera sethome …`.

Alles Spielgeschehen macht das Plugin selbst:
- 02 Start-Elytra: Ich-Sicht von hinten (F5) – echter Client läuft über den Steg, springt ab, Doppelsprung in der Luft
  (Leertaste 2×, in Zeitlupe gedrückt), das Plugin legt Flügel an, der Client gleitet mit eigener Physik.
- 03 Ränge + Clans: Rang-Symbol und farbiges Clan-Kürzel über dem Kopf und im Chat (Anzeige an).
- 04 Zuhause: Ich-Sicht – `/homes` (über die Regie als Kamera), Bett anklicken, Wartebalken, Ankunft auf dem Turm.
- 05 Grab: ein Creeper erwischt Toni – das Plugin baut das Grab (Kreuz mit Namensbrett). 06: die Kamera öffnet es.
- 07 Sitzen: Anna und Dora klicken mit leerer Hand auf die Bank im Pavillon und setzen sich.
- 08 `/nether` (Konsole): Tor in der Hecke, Treppenbrücke und die befallene Nebeninsel entstehen Stück für Stück.
- 09 `/end`: Flug die Treppe hinab in die Kuppel mit dem Endportal (vorher gebaut).
- 10/11 Mächtiger Enderdrache: `/mornicraft drache blitze|feuerregen|wut|kristalle` (Konsole).
Videos nur lokal (~/mm-cache/trailer/mornicraft/), nie ins Repo.

  python3 trailers/mornicraft.py [einstellung …]      # drehen (ohne Angabe: alle)
"""
import json, math, os, subprocess, sys, time

STYLE = 'mornicraft'
FILE = 'MoinMorni-Trailer-MorniCraft.mp4'
SLOW = 14
END = 'minecraft:the_end'
MX, MZ = -467, 272     # Mitte der Spawn-Insel
G = 170                # Füße auf der Wiese
CAM = 'McKamera'


def A(x, y, z):
    """Ort relativ zur Inselmitte (x, z), y absolut."""
    return [round(MX + x, 3), y, round(MZ + z, 3)]


CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'MorniCraft',
     'text': 'Überleben mit Freunden – nur mit Einladung'},
    {'file': 'lt-elytra.png', 'kind': 'lower', 'title': 'Start-Elytra', 'text': 'Vom Spawn abspringen – und losgleiten'},
    {'file': 'lt-raenge.png', 'kind': 'lower', 'title': 'Ränge und Clans', 'text': 'Dein Clan-Kürzel steht über deinem Kopf'},
    {'file': 'lt-zuhause.png', 'kind': 'lower', 'title': 'Zuhause', 'text': 'Ein Bett für jedes Zuhause – anklicken und hin'},
    {'file': 'lt-grab.png', 'kind': 'lower', 'title': 'Gräber', 'text': 'Deine Sachen warten an Ort und Stelle'},
    {'file': 'lt-sitzen.png', 'kind': 'lower', 'title': 'Hinsetzen', 'text': 'Rechtsklick auf eine Bank – und Pause'},
    {'file': 'lt-nether.png', 'kind': 'lower', 'title': 'Tor zum Nether', 'text': 'Über die Brücke zur Insel, die der Nether befallen hat'},
    {'file': 'lt-end.png', 'kind': 'lower', 'title': 'Das Endportal', 'text': 'Tief im Inneren der Spawn-Insel'},
    {'file': 'lt-drache.png', 'kind': 'lower', 'title': 'Mächtiger Enderdrache', 'text': 'Blitze, Feuerregen – und er wird wütend'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'Nur mit Einladung – bewirb dich auf moinmorni.net'},
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


# ---------------------------------------------------------------- Menüs (Bildschirm 1600×900, GUI-Maßstab 3):
# Truhe mit 3 Reihen links oben bei 178/66, mit 6 Reihen bei 178/39 – Mitte eines Platzes in Pixeln
def slot3(i):
    return [(194 + 18 * (i % 9)) * 3, (92 + 18 * (i // 9)) * 3]


def slot_rows(rows, i):
    top = (300 - (114 + 18 * rows)) // 2
    return [(194 + 18 * (i % 9)) * 3, (top + 26 + 18 * (i // 9)) * 3]


# Orte
FOUNTAIN_S = A(0.5, G, 8.5)                  # vor dem Brunnen (Süden)
CHERRY = A(13.5, G, -10.5)                   # Kirschhain im Nordosten: hier steht Toni
BENCH_ANNA, BENCH_DORA = A(-16, G, -17), A(-14, G, -17)   # Birkenbank im Pavillon (Nordreihe, Blick nach Süden)
GRAVE = A(13, G, -10)                        # wird nach 05 aus graves.yml gelesen (siehe grave_spot)

SHOTS = [
    # ------------------------------------------------ Anflug: unter den Ballons hindurch auf die Insel zu
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'time': 3000,
     'before': ['rc:nether weg', 'sleep:2'], 'spec': {
        'wait': 16,
        'camera': [{'p': A(66, 165, 104), 'look': A(0, 160, 0), 't': 0},
                   {'p': A(46, 170, 74), 'look': A(0, 165, 0), 't': 3.0},
                   {'p': A(30, 177, 50), 'look': A(0, 171, 2), 't': 2.7},
                   {'p': A(16, 181, 34), 'look': A(-2, 171, 0), 't': 2.6, 'ease': 1}],
        'actors': {'Anna': walk([A(-2, G, 13), A(-9, G, 9), A(-11, G, 2)], 2.2),
                   'Dora': walk([A(-1, G, 14), A(-8, G, 10.5), A(-10, G, 3.5)], 2.2),
                   'Toni': walk([A(9, G, -2), A(10, G, 6), A(4, G, 11)], 2.0),
                   'Fritz': walk([A(1, G, 22), A(1, G, 14)], 1.8)}}},
    # ------------------------------------------------ Start-Elytra: von hinten, über den Südsteg und hinab
    {'id': '02-elytra', 'bars': 4, 'card': 'lt-elytra.png', 'cardAt': 0.6, 'time': 3000,
     'before': ['rc:tp Anna -470 170 260', 'rc:tp Toni -472 170 260', 'rc:tp Dora -468 170 260',
                'rc:tp Fritz -466 170 260', 'rc:tp Clara -464 170 260'], 'pov': {
        'hud': 0, 'f5': 1, 'wait': 6,
        'setup': ['clear McKamera', 'effect give McKamera resistance infinite 4 true',
                  'effect give McKamera water_breathing infinite 0 true', 'effect give McKamera saturation infinite 0 true'],
        'path': [{'p': A(0.5, G, 32.5), 'yaw': 0, 'pitch': 12, 't': 0}],
        'until': 0.0,
        'events': [{'at': 0.15, 'keydown': 'w'}, {'at': 0.2, 'keydown': 'Control_L'},
                   {'at': 2.0, 'keydown': 'space'}, {'at': 2.09, 'keyup': 'space'},
                   {'at': 2.18, 'keydown': 'space'}, {'at': 2.27, 'keyup': 'space'},
                   {'at': 2.3, 'keyup': 'Control_L'},
                   {'at': 2.4, 'rot': [6, 26], 'dur': 1.2},
                   {'at': 4.3, 'rot': [34, 22], 'dur': 3.4}],
        'after': ['effect clear McKamera']}},
    # ------------------------------------------------ Ränge und Clans: Symbole und Kürzel über den Köpfen, Chat
    {'id': '03-raenge', 'bars': 2, 'card': 'lt-raenge.png', 'cardAt': 0.15, 'cardEnd': 1.75, 'hud': True, 'time': 6000,
     'before': ['rc:effect clear McKamera'], 'spec': {
        'camera': [{'p': A(0.5, 171.65, 13.4), 'look': A(0.5, 171.9, 7.8), 't': 0},
                   {'p': A(0.5, 171.6, 12.2), 'look': A(0.5, 171.9, 7.8), 't': 5.4, 'ease': 1}],
        'actors': {'Anna': stand(A(-3.6, G, 7.2), 5.4, look=A(0.0, 171.6, 12.5)),
                   'Dora': stand(A(-1.0, G, 9.0), 5.4, look=A(0.3, 171.6, 12.5)),
                   'Toni': stand(A(2.0, G, 9.0), 5.4, look=A(0.7, 171.6, 12.5)),
                   'Clara': stand(A(4.6, G, 7.2), 5.4, look=A(1.0, 171.6, 12.5)),
                   'Fritz': stand(A(-30, G, 30), 5.4)},
        'events': [{'at': 0.25, 'actor': 'Anna', 'act': 'chat', 'arg': 'Moin! Wer kommt mit zur Alm?'},
                   {'at': 0.3, 'actor': 'Anna', 'act': 'swing'},
                   {'at': 1.5, 'actor': 'Toni', 'act': 'chat', 'arg': 'Ich bring Brezn mit!'},
                   {'at': 2.6, 'actor': 'Clara', 'act': 'chat', 'arg': 'Bin dabei!'},
                   {'at': 2.65, 'actor': 'Clara', 'act': 'swing'}]}},
    # ------------------------------------------------ Ich-Sicht: /homes, Bett „Turm“ anklicken, Balken, Ankunft
    {'id': '04-zuhause', 'bars': 3, 'card': 'lt-zuhause.png', 'cardAt': 0.3, 'time': 6000,
     'before': [f'rc:tp {n} {MX + 12 + i} {G} {MZ - 22}' for i, n in enumerate(('Anna', 'Toni', 'Clara', 'Dora', 'Fritz'))],
     'pov': {
        'path': [{'p': FOUNTAIN_S, 'yaw': 180, 'pitch': 2, 't': 0}],
        'until': 0.0,
        'events': [{'at': 0.15, 'cmd': f'regie als {CAM} homes'},
                   {'at': 0.35, 'mouse': slot3(10), 'dur': 0.5},
                   {'at': 1.35, 'click': 1},
                   {'at': 1.75, 'rot': [58, 6], 'dur': 2.4}],
        'zoom': {'z': 1.6, 'cx': 800, 'cy': 430, 'in': [0.2, 0.5], 'out': [1.4, 1.75]}}},
    # ------------------------------------------------ Grab: ein Creeper erwischt Toni im Kirschhain
    {'id': '05-grab', 'bars': 2, 'card': 'lt-grab.png', 'time': 6000,
     'before': ['rc:kill @e[tag=mmcreeper]', 'rc:effect clear Toni', 'rc:clear Toni',
                'rc:item replace entity Toni armor.head with iron_helmet',
                'rc:item replace entity Toni armor.chest with iron_chestplate',
                'rc:give Toni diamond_sword', 'rc:give Toni golden_apple 3', 'rc:give Toni bread 12',
                'rc:give Toni iron_pickaxe', 'rc:give Toni torch 24', 'rc:give Toni oak_log 32',
                'rc:give Toni cookie 8', 'rc:give Toni compass', 'Toni slot 0', 'rc:kill @e[type=item]',
                'rc:effect give Toni instant_health 1 5 true'], 'spec': {
        'setup': [f'summon creeper {CHERRY[0] + 1.4} {G} {CHERRY[2] - 1.8} '
                  '{Tags:["mmcreeper"],NoAI:1b,Fuse:22,CustomName:"Kriecher",Rotation:[15f,0f]}']
        + [f'tp {n} {MX - 30 - i} {G} {MZ + 18}' for i, n in enumerate(('Anna', 'Clara', 'Dora', 'Fritz'))],
        'camera': [{'p': A(13.1, 172.9, -5.2), 'look': A(13.9, 170.9, -10.9), 't': 0},
                   {'p': A(13.3, 172.5, -6.3), 'look': A(13.8, 170.4, -10.9), 't': 5.4, 'ease': 1}],
        'actors': {'Toni': [{'p': CHERRY, 't': 0, 'yaw': 25}, {'p': CHERRY, 't': 0.8, 'yaw': -30},
                            {'p': CHERRY, 't': 0.5, 'yaw': 0}, {'p': CHERRY, 't': 4.0, 'yaw': 0}]},
        'events': [{'at': 0.5, 'cmd': 'data merge entity @e[tag=mmcreeper,limit=1] {ignited:1b}'},
                   {'at': 1.55, 'cmd': '#release Toni'},
                   {'at': 1.75, 'cmd': 'damage Toni 60 minecraft:generic'}]}},
    # ------------------------------------------------ Ich-Sicht: Grab anklicken – Tonis Sachen liegen darin
    {'id': '06-grab-auf', 'bars': 1, 'time': 6000, 'grave': True, 'before': ['Toni respawn', 'sleep:2'], 'pov': {
        'path': [{'p': GRAVE, 'yaw': 0, 'pitch': 40, 't': 0}],
        'until': 0.0,
        'events': [{'at': 0.12, 'rclick': 1},
                   {'at': 0.95, 'mouse': slot3(0), 'dur': 0.45}],
        'zoom': {'z': 1.45, 'cx': 800, 'cy': 430, 'in': [0.3, 0.7]},
        'close': 1}},
    # ------------------------------------------------ Hinsetzen: Anna und Dora auf der Bank im Pavillon
    {'id': '07-sitzen', 'bars': 2, 'card': 'lt-sitzen.png', 'time': 6000,
     'before': ['rc:clear Anna', 'rc:clear Dora', 'Anna slot 0', 'Dora slot 0'], 'spec': {
        'camera': [{'p': A(-12.0, 173.3, -11.6), 'look': A(-14.9, 170.7, -17.0), 't': 0},
                   {'p': A(-12.6, 173.1, -12.2), 'look': A(-14.9, 170.6, -17.0), 't': 5.4, 'ease': 1}],
        'actors': {'Anna': walk([A(-8.5, G, -15.6), A(-15.5, G, -15.6)], 3.1)
                   + [{'p': A(-15.5, G, -15.6), 't': 0.15, 'look': A(-13.6, 172.2, -11.5), 'hold': 3}],
                   'Dora': walk([A(-6.5, G, -15.6), A(-13.5, G, -15.6)], 3.1)
                   + [{'p': A(-13.5, G, -15.6), 't': 0.15, 'look': A(-12.8, 172.2, -11.5), 'hold': 3}]},
        'events': [{'at': 2.42, 'cmd': '#release Anna'},
                   {'at': 2.45, 'actor': 'Anna', 'act': 'activate', 'arg': ' '.join(map(str, BENCH_ANNA))},
                   {'at': 2.75, 'cmd': '#release Dora'},
                   {'at': 2.78, 'actor': 'Dora', 'act': 'activate', 'arg': ' '.join(map(str, BENCH_DORA))}]}},
    # ------------------------------------------------ /nether: Tor, Treppenbrücke und befallene Insel entstehen
    {'id': '08-nether', 'bars': 2, 'card': 'lt-nether.png', 'cardAt': 0.6, 'cardEnd': 5.4, 'time': 6000,
     'before': ['rc:nether weg', 'sleep:3', 'rc:fill -527 110 238 -503 160 262 air replace minecraft:weeping_vines_plant',
                'rc:fill -527 110 238 -503 160 262 air replace minecraft:weeping_vines']
     + [f'rc:tp {n} {MX - 30 - i} {G} {MZ + 18}' for i, n in enumerate(('Anna', 'Toni', 'Clara', 'Dora', 'Fritz'))],
     'spec': {
        'wait': 8,
        'camera': [{'p': A(-58, 167.5, -3), 'look': A(-37, 163, -20), 't': 0},
                   {'p': A(-55, 166.5, -6), 'look': A(-37, 163, -20.5), 't': 5.4, 'ease': 1}],
        'events': [{'at': 0.35, 'cmd': 'nether'}]}},
    # ------------------------------------------------ … und über die Brücke hinab zum Netherportal
    {'id': '08b-bruecke', 'bars': 2, 'time': 6000, 'spec': {
        'wait': 8,
        'camera': [{'p': A(-25.5, 173.4, -21.8), 'look': A(-46, 160.5, -22.2), 't': 0},
                   {'p': A(-36.5, 166.4, -21.9), 'look': A(-49, 160.2, -22.2), 't': 5.4, 'ease': 1}],
        'actors': {'Anna': walk([A(-29.5, 166.6, -22.7), A(-31, 165.6, -22.7), A(-33, 164.1, -22.7), A(-35, 163.1, -22.7),
                                 A(-37, 161.7, -22.7), A(-39, 160.6, -22.7), A(-41, 159.3, -22.7), A(-43, 158.4, -22.7),
                                 A(-45.6, 158.0, -22.7)], 3.6)
                   + [{'p': A(-45.6, 158.0, -22.7), 't': 0.1, 'look': A(-48, 160.2, -22.0), 'hold': 2}],
                   'Fritz': walk([A(-27.0, 168.0, -21.3), A(-29, 166.8, -21.3), A(-31, 165.6, -21.3), A(-33, 164.1, -21.3),
                                  A(-35, 163.1, -21.3), A(-37, 161.7, -21.3), A(-39, 160.6, -21.3), A(-41, 159.3, -21.3),
                                  A(-43.4, 158.3, -21.3)], 3.6)
                   + [{'p': A(-43.4, 158.3, -21.3), 't': 0.1, 'look': A(-48, 160.2, -22.0), 'hold': 2}]}}},
    # ------------------------------------------------ /end: die Treppe hinab in die Kuppel mit dem Endportal
    {'id': '09-end', 'bars': 2, 'card': 'lt-end.png', 'nv': True, 'time': 6000,
     'before': ['rc:end', 'sleep:6'], 'spec': {
        'camera': [{'p': A(-18.5, 166.6, -6), 'look': A(-6, 157.5, -6), 't': 0},
                   {'p': A(-11.5, 159.8, -6), 'look': A(-2, 156.6, -6), 't': 2.4},
                   {'p': A(-6.0, 158.6, -6), 'look': A(0, 156.4, -6), 't': 2.2, 'ease': 1}]}},
    # ------------------------------------------------ Mächtiger Enderdrache: Blitze auf die Darsteller
    {'id': '10-drache', 'bars': 2, 'card': 'lt-drache.png', 'nv': True, 'hud': True, 'dimtime': True,
     'before': [f'rc:execute in {END} run tp Anna 6.5 65 14.5', f'rc:execute in {END} run tp Toni 9.5 65 12.5',
                f'rc:execute in {END} run tp Clara 3.5 65 16.5', 'rc:effect give @a[name=!McKamera] resistance infinite 4 true',
                'sleep:3'], 'spec': {
        'dim': END, 'wait': 10,
        'camera': [{'p': [16, 69.5, 28], 'look': [6, 67, 14], 't': 0},
                   {'p': [19, 70.5, 30], 'look': [6, 68, 13], 't': 5.4, 'ease': 1}],
        'events': [{'at': 0.4, 'cmd': 'mornicraft drache blitze'}]}},
    # ------------------------------------------------ Wut: lila Leiste, neue Endkristalle, Feuerregen
    {'id': '11-wut', 'bars': 2, 'nv': True, 'hud': True, 'spec': {
        'dim': END, 'wait': 6, 'follow': '@e[type=minecraft:ender_dragon,limit=1]',
        'camera': [{'p': [14, 72, 26], 'look': [0, 80, 0], 't': 0},
                   {'p': [12, 74, 24], 'look': [0, 80, 0], 't': 5.4}],
        'events': [{'at': 0.3, 'cmd': 'mornicraft drache wut'},
                   {'at': 0.9, 'cmd': 'mornicraft drache kristalle'},
                   {'at': 1.8, 'cmd': 'mornicraft drache feuerregen'}]}},
    # ------------------------------------------------ Ende: alle winken auf dem Platz, hinaus über die Insel
    {'id': '12-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'time': 3000,
     'before': [f'rc:execute in minecraft:overworld run tp Anna {MX} {G} {MZ + 8}', 'rc:effect clear McKamera'], 'spec': {
        'camera': [{'p': A(0.5, 172.0, 15.5), 'look': A(0.5, 171.5, 7), 't': 0},
                   {'p': A(0.5, 177, 28), 'look': A(0.5, 172, 4), 't': 3},
                   {'p': A(18, 190, 74), 'look': A(0, 166, 0), 't': 5.4, 'ease': 1}],
        'actors': {'Anna': stand(A(-2.5, G, 9.0), 8.4, look=A(0.5, 171.6, 16)),
                   'Dora': stand(A(-0.5, G, 10.0), 8.4, look=A(0.5, 171.6, 16)),
                   'Toni': stand(A(1.6, G, 9.2), 8.4, look=A(0.5, 171.6, 16)),
                   'Clara': stand(A(3.5, G, 10.2), 8.4, look=A(0.5, 171.6, 16)),
                   'Fritz': stand(A(-4.4, G, 10.4), 8.4, look=A(0.5, 171.6, 16))},
        'events': [{'at': t, 'actor': n, 'act': 'swing'} for n, ts in
                   (('Anna', (0.4, 0.8, 1.2)), ('Toni', (0.5, 0.9, 1.3)), ('Clara', (0.6, 1.0)),
                    ('Dora', (0.45, 0.85)), ('Fritz', (0.7, 1.1))) for t in ts]}},
]

# ---------------------------------------------------------------- Drehen

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
SERVER = os.environ.get('MM_SERVER_DIR', '/home/user/mm-cache/servers/mornicraft-trailer')


def xdo(*args):
    subprocess.run(['xdotool', *args], env=dict(os.environ, DISPLAY=os.environ.get('MM_DISPLAY', ':102')), check=False)


def main(ids):
    sys.path.insert(0, TOOLS)
    import make
    from shot import Rcon
    t = make.load('mornicraft')
    out = os.path.join(make.OUT, 'mornicraft')
    info = make.music_info(out, t.STYLE)
    rc = Rcon(os.environ['MM_RCON'], os.environ['MM_RCON_PASS'])
    fifo = os.environ['MM_ACTORS_FIFO']
    cam = os.environ.get('MM_CAMERA', CAM)
    for s, L in zip(t.SHOTS, make.lengths(t, info)):
        if ids and s['id'] not in ids:
            continue
        need = L + make.FADE + make.MARGIN
        print(f"== {s['id']} ({L:.1f}s)", flush=True)
        if 'time' in s:
            rc(f'execute in minecraft:overworld run time set {s["time"]}')
        rc('execute in minecraft:overworld run weather clear 999999')
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
                if s.get('grave'):
                    spec['path'] = [dict(spec['path'][0], **grave_view())]
                spec.setdefault('slow', SLOW)
                json.dump(spec, open(sf, 'w'), indent=1)
                subprocess.run([sys.executable, os.path.join(HERE, 'mornicraft', 'pov.py'), sf, mp4], check=True)
            else:
                spec = make.fitted(s['spec'], need)
                spec.setdefault('slow', float(os.environ.get('MM_SLOW', SLOW)))
                json.dump(spec, open(sf, 'w'), indent=1)
                if s.get('hud'):
                    xdo('key', 'F1')        # Anzeige an: Namen über den Köpfen, Chat, Leiste des Drachen
                    time.sleep(0.4)
                    xdo('key', 'F3+d')      # Chat leeren
                    time.sleep(0.4)
                try:
                    subprocess.run([sys.executable, os.path.join(HERE, 'mornicraft', 'mc_shot.py'), sf, mp4], check=True)
                finally:
                    if s.get('hud'):
                        xdo('key', 'F1')
        finally:
            if s.get('nv'):
                rc(f'effect clear {cam} night_vision')


def grave_view(owner='Toni'):
    """Stehplatz vor dem neuesten Grab von `owner` (aus graves.yml): hinter dem Fußende, Blick auf Kopf und Kreuz."""
    import yaml
    data = yaml.safe_load(open(os.path.join(SERVER, 'plugins', 'MorniCraft', 'graves.yml')))
    g = max((v for v in data.values() if v.get('name') == owner), key=lambda v: v['created'])
    spots = [tuple(int(n) for n in k.rsplit('_', 3)[1:]) for k in g['blocks']]
    low = min(y for _, y, _ in spots)
    earth = [(x, z) for x, y, z in spots if y == low]
    cross = next(((x, z) for x, y, z in spots if y == low + 1), None)
    head = min(earth, key=lambda e: math.dist(e, cross)) if cross else earth[0]
    dx, dz = (head[0] - cross[0], head[1] - cross[1]) if cross else (0, 1)
    stand = [head[0] + 0.5 + dx * 2.7, low + 1, head[1] + 0.5 + dz * 2.7]
    aim = [head[0] + 0.5, low + 1.0, head[1] + 0.5]
    yaw = math.degrees(math.atan2(-(aim[0] - stand[0]), aim[2] - stand[2]))
    pitch = math.degrees(math.atan2(stand[1] + 1.62 - aim[1], math.hypot(aim[0] - stand[0], aim[2] - stand[2])))
    print(f'   Grab von {owner}: Kopfende {head}, Kreuz {cross}, Stehplatz {stand}, Blick {yaw:.0f}/{pitch:.0f}')
    return {'p': stand, 'yaw': round(yaw, 1), 'pitch': round(pitch, 1)}


if __name__ == '__main__':
    main(sys.argv[1:])
