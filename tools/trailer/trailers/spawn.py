"""Trailer: Spawn / Lobby – das Alpendorf mit Dorfmarkt, Biergarten, Häusern, Parkour und Schloss."""
import json, os

STYLE = 'spawn'
FILE = 'MoinMorni-Trailer-Spawn.mp4'
G = 65  # Füße auf dem Dorfplatz
DAYTIME = 'day'
SLOW = 12

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'Willkommen in', 'title': 'MoinMorni',
     'text': 'Ein Alpendorf voller Spielmodi – für Java und Bedrock'},
    {'file': 'lt-ankunft.png', 'kind': 'lower', 'title': 'Ankunft im Dorf', 'text': 'Mitten auf dem Dorfmarkt am Maibaum'},
    {'file': 'lt-markt.png', 'kind': 'lower', 'title': 'Figur anklicken', 'text': '… und schon bist du im Spielmodus'},
    {'file': 'lt-leute.png', 'kind': 'lower', 'title': 'Das Dorf lebt', 'text': 'Leute in Tracht laufen herum und schauen dich an'},
    {'file': 'lt-biergarten.png', 'kind': 'lower', 'title': 'Biergarten', 'text': 'Mit Wirt, Gästen und Steinkrügen'},
    {'file': 'lt-haeuser.png', 'kind': 'lower', 'title': 'Häuser zum Reingehen', 'text': 'Wirtshaus, Bäckerei, Schmiede – alles eingerichtet'},
    {'file': 'lt-gasse.png', 'kind': 'lower', 'title': 'Handwerkergasse', 'text': 'Vorgärten, Brunnen und rauchende Kamine'},
    {'file': 'lt-launchpad.png', 'kind': 'lower', 'title': 'Launchpads', 'text': 'Mit Schwung die Schlosstreppe hinauf'},
    {'file': 'lt-parkour.png', 'kind': 'lower', 'title': 'Parkour', 'text': 'Die Spirale nach oben – mit Bestenliste'},
    {'file': 'lt-schloss.png', 'kind': 'lower', 'title': 'Das Schloss', 'text': 'Ehrenhof mit Prunkbrunnen'},
    {'file': 'lt-festsaal.png', 'kind': 'lower', 'title': 'Festsaal', 'text': 'Rotunde, Thron und Galerie'},
    {'file': 'lt-nacht.png', 'kind': 'lower', 'title': 'Tag und Nacht wie in echt', 'text': 'Die Lobby-Uhr folgt der Sonne über Bayern'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'Komm vorbei – wir sehen uns im Dorf!'},
]

# Brunnen im Ehrenhof (aus dem Marker mm_brunnen_mitte der echten Lobby)
FX, FY, FZ = (lambda d: (d['x'], d['y'], d['z']))(json.load(open(os.path.join(os.path.dirname(__file__), 'spawn-orte.json'))))


def walk(points, speed=4.3):
    """Gehweg mit gleichmäßigem Tempo (Blöcke pro Sekunde)."""
    out = [{'p': points[0], 't': 0}]
    for a, b in zip(points, points[1:]):
        d = sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5
        out.append({'p': b, 't': d / speed})
    return out


def jumps(blocks, per=0.55, lift=1.2):
    """Sprünge von Block zu Block (Bogen über die Mitte)."""
    out = [{'p': [blocks[0][0] + .5, blocks[0][1] + 1, blocks[0][2] + .5], 't': 0, 'hold': .3}]
    for a, b in zip(blocks, blocks[1:]):
        mid = [(a[0] + b[0]) / 2 + .5, max(a[1], b[1]) + 1 + lift, (a[2] + b[2]) / 2 + .5]
        out.append({'p': mid, 't': per / 2})
        out.append({'p': [b[0] + .5, b[1] + 1, b[2] + .5], 't': per / 2, 'hold': .12})
    return out


PARKOUR = json.load(open(os.path.join(os.path.dirname(__file__), 'spawn-parkour.json')))['blocks']
PK = [[b['x'], b['y'], b['z']] for b in PARKOUR]

SHOTS = [
    {'id': '01-luft', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': {
        'camera': [{'p': [36, 106, 28], 'look': [0, 84, -80], 't': 0},
                   {'p': [14, 97, 32], 'look': [0, 86, -92], 't': 10}]}},
    {'id': '02-ankunft', 'bars': 2, 'card': 'lt-ankunft.png', 'spec': {
        'camera': [{'p': [0.5, 67.4, 36], 'look': [0, 74, -40], 't': 0},
                   {'p': [0.5, 67.6, 22], 'look': [0, 78, -70], 't': 6}],
        'actors': {'Anna': walk([[-1.6, G, 31], [-2.2, G, 12]], 3.6),
                   'Bert': walk([[2.6, G, 33], [3.2, G, 15]], 3.4)}}},
    {'id': '03-markt', 'bars': 2, 'card': 'lt-markt.png', 'spec': {
        'camera': [{'p': [1.5, 67.2, -1], 'look': [8, 66.2, -14], 't': 0},
                   {'p': [11.5, 67.4, -3], 'look': [8, 66.2, -14], 't': 6, 'ease': 1}],
        'actors': {'Anna': walk([[-1.5, G, -6.5], [7.5, G, -10]], 2.4) + [{'p': [7.5, G, -10], 't': 0.1, 'look': [8, 66.6, -14], 'hold': 2.2}]},
        'events': [{'at': 5.2, 'actor': 'Anna', 'act': 'swing'}, {'at': 5.6, 'actor': 'Anna', 'act': 'swing'}]}},
    {'id': '04-leute', 'bars': 2, 'card': 'lt-leute.png', 'spec': {
        'camera': [{'p': [-8.5, 66.5, 6], 'look': [2, 65.8, 4], 't': 0},
                   {'p': [-7.5, 66.5, -3], 'look': [3, 65.8, 0], 't': 6}],
        'actors': {'Bert': walk([[6, G, 9], [-2, G, -6]], 2.4)}}},
    {'id': '05-biergarten', 'bars': 2, 'card': 'lt-biergarten.png', 'spec': {
        'camera': [{'p': [29, 68.4, -13], 'look': [40, 65.4, -2], 't': 0},
                   {'p': [38, 67.6, -11.5], 'look': [42, 65.4, 2], 't': 6}]}},
    {'id': '06-wirtshaus', 'bars': 2, 'card': 'lt-haeuser.png', 'spec': {
        'camera': [{'p': [74, 66, 6.5], 'look': [79, 65.4, -3], 't': 0},
                   {'p': [77, 66, 4], 'look': [78, 65.4, -4], 't': 3},
                   {'p': [79, 66, 2], 'look': [84, 66.2, 3.5], 't': 3, 'ease': 1}]}},
    {'id': '07-gasse', 'bars': 2, 'card': 'lt-gasse.png', 'spec': {
        'camera': [{'p': [-50, 68, 7], 'look': [-104, 66, 7], 't': 0},
                   {'p': [-63, 67.6, 7], 'look': [-110, 66, 7], 't': 6}],
        'actors': {'Anna': walk([[-56, G, 5], [-70, G, 5.5]], 3.0)}}},
    {'id': '08-launchpad', 'bars': 2, 'card': 'lt-launchpad.png', 'spec': {
        'track': 'Bert',
        'camera': [{'p': [18, 67.2, -15], 't': 0}, {'p': [17.5, 67.6, -19], 't': 1.1},
                   {'p': [15, 73, -28], 't': 1.0}, {'p': [11, 78, -36], 't': 0.8},
                   {'p': [8.5, 79, -41], 't': 0.8, 'ease': 1, 'hold': 1.5}],
        'actors': {'Bert': [{'p': [14.5, G, -20], 't': 0}, {'p': [14.5, G, -25.5], 't': 1.1},
                            {'p': [10.5, 73.5, -35], 't': 1.0}, {'p': [6.5, 77.5, -43], 't': 0.8},
                            {'p': [3.5, 76, -50], 't': 0.8, 'hold': 1.5}]},
        'events': [{'at': 1.1, 'cmd': 'playsound minecraft:entity.firework_rocket.launch master @a 14 65 -26 2'},
                   {'at': 1.1, 'cmd': 'particle minecraft:cloud 14.5 65.3 -25.5 0.4 0.1 0.4 0.05 30'}]}},
    {'id': '09-parkour', 'bars': 2, 'card': 'lt-parkour.png', 'spec': {
        'track': 'Anna',
        'camera': [{'p': [-56, 67.5, -26], 't': 0}, {'p': [-59, 68.5, -26.5], 't': 3},
                   {'p': [-62, 70, -27.5], 't': 3}],
        'actors': {'Anna': jumps(PK[:11])}}},
    {'id': '10-schloss', 'bars': 4, 'card': 'lt-schloss.png', 'spec': {
        'camera': [{'p': [FX + 0.5, FY + 4, FZ + 16], 'look': [FX + 0.5, FY + 2, FZ], 't': 0},
                   {'p': [FX + 6, FY + 3.2, FZ + 8], 'look': [FX + 0.5, FY + 2.5, FZ + 0.5], 't': 5},
                   {'p': [FX + 8, FY + 3, FZ - 1], 'look': [FX + 0.5, FY + 3, FZ + 0.5], 't': 5, 'ease': 1}]}},
    {'id': '11-festsaal', 'bars': 2, 'card': 'lt-festsaal.png', 'spec': {
        'camera': [{'p': [0.5, 94.6, -128.5], 'look': [0.5, 96, -141], 't': 0},
                   {'p': [3.5, 94.4, -132.5], 'look': [0.5, 104, -137.5], 't': 6, 'ease': 1}]}},
    {'id': '12-nacht', 'bars': 2, 'card': 'lt-nacht.png', 'daytime': 'night', 'spec': {
        'camera': [{'p': [17, 99, -88], 'look': [0, 99, -130], 't': 0},
                   {'p': [6, 101, -86], 'look': [0, 101, -132], 't': 6}]}},
    {'id': '13-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'daytime': 'evening', 'spec': {
        'camera': [{'p': [0.5, 69, 24], 'look': [0, 74, -40], 't': 0},
                   {'p': [0.5, 77, 34], 'look': [0, 78, -60], 't': 3},
                   {'p': [12, 97, 48], 'look': [0, 86, -90], 't': 6, 'ease': 1}]}},
]
