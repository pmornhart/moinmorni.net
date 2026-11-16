"""Trailer: Morni Party – Brettspiel für 2 bis 8 mit Edelweiß, Talern und zwölf Minispielen.

Gedreht auf dem Test-Server aus dem Repo pmornhart/Morni-Party (`KEEP=1 SKIP_TEST=1 test/run.sh`, Port 25770,
RCON 25870). Die Welt heißt „party“ (eigene Dimension): Befehle mit Ort brauchen `execute in minecraft:party`, und
das Plugin belegt `/spectate` als Alias für /zuschauen – darum laufen die Einstellungen über einen kleinen Aufsatz
für shot.py, der beides erledigt. Die Partie-Einstellungen (ab 06) spielt das Plugin wirklich: eine Regie stellt
vorher per `/mparty` Felder, Würfel und Stand ein, Platzhalter `{cur}` = wer gerade dran ist; die Minispiel-
Einstellungen beginnen, sobald das Minispiel läuft (Darsteller-Wege dann ab ihrem echten Startplatz).
"""
import math

STYLE = 'party'
FILE = 'MoinMorni-Trailer-Party.mp4'
SLOW = 12

CARDS = [
    {'file': 'intro.png', 'kind': 'intro', 'kicker': 'MoinMorni · Spielmodus', 'title': 'Morni Party',
     'text': 'Würfeln, ziehen, Minispiele – der Spieleabend für 2 bis 8'},
    {'file': 'lt-festplatz.png', 'kind': 'lower', 'title': 'Der Festplatz', 'text': 'Mitspielen, Brett wählen – ab zwei geht es los'},
    {'file': 'lt-alm.png', 'kind': 'lower', 'title': 'Almsommer am Morni-Kogel', 'text': 'Den Berg hinauf bis zum Gipfelkreuz'},
    {'file': 'lt-schloss.png', 'kind': 'lower', 'title': 'Schloss Weißenstein', 'text': 'Durchs Torhaus, vorbei an Türmen und Zinnen'},
    {'file': 'lt-stollen.png', 'kind': 'lower', 'title': 'Goldstollen', 'text': 'Tief hinab bis zur Goldkammer'},
    {'file': 'lt-wuerfeln.png', 'kind': 'lower', 'title': 'Würfeln und ziehen', 'text': 'Du selbst bist die Spielfigur'},
    {'file': 'lt-edelweiss.png', 'kind': 'lower', 'title': 'Der Edelweiß-Stand', 'text': 'Taler sammeln, Edelweiß kaufen – wer die meisten hat, gewinnt'},
    {'file': 'lt-felder.png', 'kind': 'lower', 'title': 'Glück, Pech und Duelle', 'text': 'Jede Farbe bringt eine Überraschung'},
    {'file': 'lt-tausch.png', 'kind': 'lower', 'title': 'Gegenstände', 'text': 'Platztausch, Doppelwürfel, Talerklau …'},
    {'file': 'lt-kuh.png', 'kind': 'lower', 'title': 'Nach jeder Runde: Minispiel!', 'text': 'Kuhglocke – wird es grün, schnell läuten'},
    {'file': 'lt-scheibe.png', 'kind': 'lower', 'title': 'Scheibenschießen', 'text': 'Schneebälle aufs Ziel – unterm Riesenrad'},
    {'file': 'lt-broeckel.png', 'kind': 'lower', 'title': 'Bröckelboden', 'text': 'Wo du gehst, bricht das Eis'},
    {'file': 'lt-brezn.png', 'kind': 'lower', 'title': 'Heiße Brezn', 'text': 'Schnell weitergeben, bevor sie platzt'},
    {'file': 'lt-gipfel.png', 'kind': 'lower', 'title': 'Gipfelkönig', 'text': 'Oben bleiben – und die anderen runterschubsen'},
    {'file': 'lt-taler.png', 'kind': 'lower', 'title': 'Zwölf Minispiele', 'text': 'Talerregen, Holzhacker, Rempelei und mehr'},
    {'file': 'lt-sieg.png', 'kind': 'lower', 'title': 'Gipfelrennen oder Edelweiß-Jagd', 'text': 'Wer zuerst oben ist – oder am Ende die meisten Edelweiß hat'},
    {'file': 'ende.png', 'kind': 'end', 'title': 'moinmorni.net', 'text': 'Java & Bedrock · kostenlos',
     'note': 'In der Lobby die Figur „Morni Party“ anklicken'},
]

# ---------------------------------------------------------------- Spielbretter (wie board/BoardLayout.java)

BOARD_SHAPES = {'almsommer': (42, 7, 30, 1.3, True, 0.25 * math.pi, 0), 'schloss': (44, 9, 26, 1.2, True, 1.5 * math.pi, 4),
                'goldstollen': (42, 7, 26, 1.35, False, 0.9 * math.pi, 8)}
BOARD_AT = {'almsommer': (1000, 100, -300), 'schloss': (1000, 100, 0), 'goldstollen': (1000, 100, 300)}
PATTERN = 'TTGTVITPTDVL'


def fields(board):
    """Die 36 Felder: Mitte der Oberseite (da steht die Figur), Art wie in /mparty zustand."""
    outer, inner, h, turns, up, ang, shift = BOARD_SHAPES[board]
    n = 4000
    pts, length = [], [0.0]
    for i in range(n + 1):
        t = i / n
        r = outer - (outer - inner) * t
        a = ang + turns * 2 * math.pi * t
        pts.append((math.cos(a) * r, math.sin(a) * r, h * t if up else h * (1 - t)))
        if i:
            length.append(length[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    out, j = [], 0
    ox, oy, oz = BOARD_AT[board]
    for f in range(36):
        while j < n and length[j] < length[n] * f / 35:
            j += 1
        x, z, y = pts[j]
        kind = 'S' if f == 0 else 'Z' if f == 35 else PATTERN[(f - 1 + shift) % 12]
        out.append([ox + math.floor(x + 0.5) + 0.5, oy + math.floor(y + 0.5) + 1, oz + math.floor(z + 0.5) + 0.5, kind])
    return out


S = fields('schloss')
A = fields('almsommer')


def F(i, dy=0.0, board=S):
    return [board[i][0], board[i][1] + dy, board[i][2]]


# Minispiel-Plätze (Places.mini, Tisch 0): Mitte, y = Boden
MINI = {'broeckelboden': (1300, 100, -140), 'talerregen': (1440, 100, -140), 'pfeilhagel': (1720, 100, -140),
        'heisse-brezn': (1300, 100, 0), 'gipfelkoenig': (1580, 100, 0), 'kuhglocke': (1720, 100, 0),
        'holzhacker': (1440, 100, 140), 'scheibenschiessen': (1720, 100, 140)}


def M(mini, x, y, z):
    c = MINI[mini]
    return [c[0] + x, c[1] + y, c[2] + z]


def walk(points, speed=4.3):
    """Gehweg mit gleichmäßigem Tempo (Blöcke pro Sekunde)."""
    out = [{'p': points[0], 't': 0}]
    for a, b in zip(points, points[1:]):
        out.append({'p': b, 't': math.dist(a, b) / speed})
    return out


SHOTS = [
    # ------------------------------------------------ Intro über Schloss Weißenstein
    {'id': '01-intro', 'bars': 4, 'card': 'intro.png', 'cardAt': 0.5, 'spec': {
        'camera': [{'p': [1064, 146, 66], 'look': [1000, 121, 2], 't': 0},
                   {'p': [1046, 134, 56], 'look': [1001, 121, 3], 't': 5},
                   {'p': [1030, 126, 47], 'look': [1002, 122, 4], 't': 5, 'ease': 1}]}},
    # ------------------------------------------------ Festplatz: die vier melden sich an
    {'id': '02-festplatz', 'bars': 2, 'card': 'lt-festplatz.png', 'spec': {
        'camera': [{'p': [2.5, 104.3, 19.5], 'look': [0, 103, 2], 't': 0},
                   {'p': [2, 104, 12], 'look': [-0.5, 103.3, -2], 't': 6, 'ease': 1}],
        'actors': {'Anna': walk([[-2.5, 101, 12], [-4.5, 101, 3.5]], 2.2),
                   'Bert': walk([[1, 101, 13.5], [2, 101, 5.5]], 2.2),
                   'Clara': walk([[4, 101, 11.5], [6.5, 101, 2.5]], 2.2),
                   'Dora': walk([[-0.5, 101, 15.5], [-1, 101, 7.5]], 2.2)},
        'events': [{'at': 3.6, 'actor': 'Anna', 'act': 'swing'}, {'at': 3.65, 'actor': 'Anna', 'act': 'chat', 'arg': '/mitspielen'},
                   {'at': 3.9, 'actor': 'Clara', 'act': 'swing'}, {'at': 3.95, 'actor': 'Clara', 'act': 'chat', 'arg': '/mitspielen'},
                   {'at': 4.2, 'actor': 'Dora', 'act': 'swing'}, {'at': 4.25, 'actor': 'Dora', 'act': 'chat', 'arg': '/mitspielen'}]}},
    # ------------------------------------------------ Die drei Spielbretter
    {'id': '03-alm', 'bars': 2, 'card': 'lt-alm.png', 'spec': {
        'camera': [{'p': [1056, 126, -250], 'look': [998, 124, -300], 't': 0},
                   {'p': [1036, 136, -264], 'look': [997, 129, -299], 't': 6, 'ease': 1}]}},
    {'id': '04-schloss', 'bars': 2, 'card': 'lt-schloss.png', 'spec': {
        'camera': [{'p': [1022, 119, 47], 'look': [1006, 117, 12], 't': 0},
                   {'p': [1003, 121, 47], 'look': [1000, 119, 9], 't': 6, 'ease': 1}]}},
    {'id': '05-stollen', 'bars': 2, 'card': 'lt-stollen.png', 'spec': {
        'camera': [{'p': [1040, 140, 343], 'look': [1000, 104, 300], 't': 0},
                   {'p': [1024, 129, 331], 'look': [1000, 103, 300], 't': 6, 'ease': 1}]}},
    # ------------------------------------------------ Partie auf Schloss Weißenstein (das Plugin spielt)
    # {cur} würfelt von Feld 24 aus eine 3 (Regie: /mparty feld {cur} 24, wuerfel {cur} 3, Stand weit weg).
    {'id': '06-wuerfeln', 'bars': 2, 'card': 'lt-wuerfeln.png', 'start': 0.85, 'game': {
        'board': 'schloss', 'cur': 24, 'roll': 3, 'stand': 33, 'others': [22, 28, 29]}, 'spec': {
        'fit': False,
        'camera': [{'p': [975.5, 121.6, 18.5], 'look': [981.5, 116.3, 15.5], 't': 0},
                   {'p': [975.3, 121.7, 17.5], 'look': [981.3, 116.4, 14.5], 't': 2.1},
                   {'p': [973.5, 122.8, 5], 'look': [979, 117.8, 2], 't': 1.4, 'ease': 1},
                   {'p': [973.4, 122.9, 4.3], 'look': [979, 117.9, 1.5], 't': 0.6}],
        'events': [{'at': 0.4, 'actor': '{cur}', 'act': 'swing'}, {'at': 0.42, 'actor': '{cur}', 'act': 'use'}]}},
    # Im Schlossgarten: {cur} steht auf 1, der Stand auf 3 – würfelt 3, hält am Stand, kauft (Feuerwerk), zieht weiter.
    {'id': '07-edelweiss', 'bars': 2, 'card': 'lt-edelweiss.png', 'start': 2.2, 'game': {
        'board': 'schloss', 'cur': 1, 'roll': 3, 'stand': 3, 'taler': 46, 'others': [0, 5, 7], 'menuDelay': 6500}, 'spec': {
        'fit': False,
        'camera': [{'p': [1013.5, 108, -48.5], 'look': [1013.5, 102.8, -39.5], 't': 0},
                   {'p': [1013.8, 108.1, -48.3], 'look': [1013.8, 102.9, -39.3], 't': 2.4},
                   {'p': [1015.5, 108.4, -47.5], 'look': [1015.5, 103, -38.5], 't': 2.8, 'ease': 1}],
        'events': [{'at': 0.5, 'actor': '{cur}', 'act': 'swing'}, {'at': 0.52, 'actor': '{cur}', 'act': 'use'}]}},
    # Im Schlossgarten: {cur} von 9 mit einer 2 aufs Glücksfeld 11 – Kamera fährt an den Feldern entlang.
    {'id': '08-felder', 'bars': 2, 'card': 'lt-felder.png', 'start': 0.6, 'game': {
        'board': 'schloss', 'cur': 9, 'roll': 2, 'stand': 33, 'others': [6, 13, 14]}, 'spec': {
        'fit': False,
        'camera': [{'p': [1043.5, 110.5, -12.5], 'look': [1037, 106, -7], 't': 0},
                   {'p': [1043.8, 110.7, -9.5], 'look': [1037.2, 106.2, -4.5], 't': 2.3},
                   {'p': [1044, 111, -6.5], 'look': [1037.4, 106.5, -2], 't': 2.3, 'ease': 1}],
        'events': [{'at': 0.5, 'actor': '{cur}', 'act': 'swing'}, {'at': 0.52, 'actor': '{cur}', 'act': 'use'}]}},
    # Platztausch vor der Burgmauer: {cur} (Feld 18) tauscht mit {other} (Feld 21) – Rucksack, Enderperle, Ziel.
    {'id': '09-tausch', 'bars': 2, 'card': 'lt-tausch.png', 'start': 0.5, 'game': {
        'board': 'schloss', 'cur': 18, 'item': 'tausch', 'target': 21, 'stand': 12, 'others': [21, 20, 23], 'menuDelay': 3500}, 'spec': {
        'fit': False,
        'camera': [{'p': [1004, 118.6, 38.5], 'look': [1003.5, 111.8, 29], 't': 0},
                   {'p': [1003, 118.3, 37.8], 'look': [1003.2, 111.9, 29], 't': 4.6, 'ease': 1}],
        'events': [{'at': 0.4, 'actor': '{cur}', 'act': 'slot', 'arg': '1'}, {'at': 0.5, 'actor': '{cur}', 'act': 'swing'},
                   {'at': 0.52, 'actor': '{cur}', 'act': 'use'}]
        + [{'at': t, 'cmd': f'particle minecraft:{kind} {x} {y} {z} 0.35 0.8 0.35 {speed} {n}'}
           for t in (1.1, 1.25, 1.4, 1.55) for x, y, z in ((1012.5, 112, 29.5), (994.5, 114, 28.5))
           for kind, speed, n in (('end_rod', 0.06, 12), ('witch', 0.5, 25))]}},
    # ------------------------------------------------ Minispiele (beginnen, sobald das Minispiel läuft)
    {'id': '10-kuhglocke', 'bars': 2, 'card': 'lt-kuh.png', 'start': 0.3, 'mini': 'kuhglocke', 'spec': {
        'fit': False,
        'camera': [{'p': M('kuhglocke', 9.5, 4.2, -9.5), 'look': M('kuhglocke', 0.5, 3.5, 6), 't': 0},
                   {'p': M('kuhglocke', 5.5, 3.6, -8.5), 'look': M('kuhglocke', 0, 3.6, 6), 't': 4.6, 'ease': 1}]}},
    {'id': '11-scheibe', 'bars': 2, 'card': 'lt-scheibe.png', 'start': 0.3, 'mini': 'scheibenschiessen', 'spec': {
        'fit': False,
        'camera': [{'p': M('scheibenschiessen', 5, 3.2, 5.5), 'look': M('scheibenschiessen', -1, 2.3, -3.5), 't': 0},
                   {'p': M('scheibenschiessen', 5.2, 3.3, 5.3), 'look': M('scheibenschiessen', -0.5, 2.4, -3.2), 't': 1.6},
                   {'p': M('scheibenschiessen', 6.5, 3.8, 3.5), 'look': M('scheibenschiessen', -3, 4.5, 15), 't': 2.6, 'ease': 1}]}},
    {'id': '12-broeckel', 'bars': 2, 'card': 'lt-broeckel.png', 'start': 0.6, 'mini': 'broeckelboden', 'spec': {
        'fit': False,
        'camera': [{'p': M('broeckelboden', 4, 4.8, -10.5), 'look': M('broeckelboden', 0, 0.5, 0), 't': 0},
                   {'p': M('broeckelboden', -2.5, 4.5, -10), 'look': M('broeckelboden', -1, 0.3, 0.5), 't': 4.6, 'ease': 1}]}},
    {'id': '13-brezn', 'bars': 2, 'card': 'lt-brezn.png', 'start': 0.3, 'mini': 'heisse-brezn', 'spec': {
        'fit': False,
        'camera': [{'p': M('heisse-brezn', 5.5, 4.2, -8.5), 'look': M('heisse-brezn', -0.5, 1.4, 0), 't': 0},
                   {'p': M('heisse-brezn', 2.5, 3.8, -8.5), 'look': M('heisse-brezn', 0, 1.4, 0.5), 't': 4.6, 'ease': 1}]}},
    {'id': '14-gipfel', 'bars': 2, 'card': 'lt-gipfel.png', 'start': 0.8, 'mini': 'gipfelkoenig', 'spec': {
        'fit': False,
        'camera': [{'p': M('gipfelkoenig', 8.5, 8, -7.5), 'look': M('gipfelkoenig', 0.5, 4.8, 0.5), 't': 0},
                   {'p': M('gipfelkoenig', 5, 7.5, -9.5), 'look': M('gipfelkoenig', 0.5, 5.2, 0.5), 't': 4.6, 'ease': 1}]}},
    {'id': '15-taler', 'bars': 2, 'card': 'lt-taler.png', 'start': 0.3, 'mini': 'talerregen', 'spec': {
        'fit': False,
        'camera': [{'p': M('talerregen', 3, 4.2, -9.5), 'look': M('talerregen', 0, 1.2, 0.5), 't': 0},
                   {'p': M('talerregen', -2.5, 4, -9.5), 'look': M('talerregen', -1, 1.2, 1), 't': 4.6, 'ease': 1}]}},
    # ------------------------------------------------ Gipfelrennen auf dem Almsommer: {cur} erreicht das Gipfelkreuz
    # (das Plugin zündet Feuerwerk am Ziel und zur Siegerehrung; dazu ein paar Raketen ums Gipfelkreuz)
    {'id': '16-sieg', 'bars': 2, 'card': 'lt-sieg.png', 'start': 1.9, 'game': {
        'board': 'almsommer', 'cur': 32, 'roll': 3, 'stand': 5, 'others': [29, 30, 27]}, 'spec': {
        'fit': False,
        'camera': [{'p': [1006, 134, -284], 'look': [996, 131, -297], 't': 0},
                   {'p': [1005, 135, -286], 'look': [995, 132.5, -297], 't': 3.0},
                   {'p': [1003, 137, -288], 'look': [994.5, 133, -297], 't': 3.2, 'ease': 1}],
        'events': [{'at': 0.5, 'actor': '{cur}', 'act': 'swing'}, {'at': 0.52, 'actor': '{cur}', 'act': 'use'}]
        + [{'at': t, 'cmd': 'summon firework_rocket %s %s %s {LifeTime:%d,FireworksItem:{id:"minecraft:firework_rocket",count:1,'
                             'components:{"minecraft:fireworks":{explosions:[{shape:"%s",colors:[I;%d,16777215],'
                             'fade_colors:[I;5635925],has_twinkle:true}],flight_duration:1}}}}' % (x, y, z, life, shape, col)}
           for t, x, y, z, life, shape, col in ((3.2, 990.5, 131, -292.5, 13, 'large_ball', 16766720),
                                                (3.5, 1003.5, 131.5, -303.5, 11, 'star', 16747520),
                                                (3.9, 992.5, 132, -302.5, 12, 'large_ball', 5636095),
                                                (4.3, 998.5, 130, -291.5, 10, 'burst', 16766720))]}},
    # ------------------------------------------------ Schluss: zurück auf den Festplatz, weit hinaus
    {'id': '17-ende', 'bars': 'rest', 'card': 'ende.png', 'cardAt': 0.5, 'spec': {
        'camera': [{'p': [0.5, 104, 22], 'look': [0, 108, -8], 't': 0},
                   {'p': [0.5, 112, 34], 'look': [0, 106, -4], 't': 3},
                   {'p': [6, 128, 52], 'look': [0, 104, 0], 't': 5, 'ease': 1}],
        'actors': {'Anna': [{'p': [-3.5, 101, 5.5], 't': 0, 'look': [0.5, 104, 22]}, {'p': [-3.5, 101, 5.5], 't': 8, 'look': [0.5, 112, 34]}],
                   'Bert': [{'p': [2.5, 101, 6.5], 't': 0, 'look': [0.5, 104, 22]}, {'p': [2.5, 101, 6.5], 't': 8, 'look': [0.5, 112, 34]}],
                   'Clara': [{'p': [5.5, 101, 3.5], 't': 0, 'look': [0.5, 104, 22]}, {'p': [5.5, 101, 3.5], 't': 8, 'look': [0.5, 112, 34]}],
                   'Dora': [{'p': [-0.5, 101, 8.5], 't': 0, 'look': [0.5, 104, 22]}, {'p': [-0.5, 101, 8.5], 't': 8, 'look': [0.5, 112, 34]}]},
        'events': [{'at': t, 'actor': n, 'act': 'swing'} for n, t0 in (('Anna', 0.6), ('Bert', 0.9), ('Clara', 1.3), ('Dora', 1.0))
                   for t in (t0, t0 + 0.35, t0 + 0.7)]}},
]
