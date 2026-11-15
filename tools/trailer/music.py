#!/usr/bin/env python3
"""Eigene Trailer-Musik: das MoinMorni-Thema in verschiedenen Arrangements je Modus.

Komponiert als MIDI (mido) und gerendert mit FluidSynth + FluidR3_GM (MIT-Lizenz). Alles selbst geschrieben –
keine fremden Melodien.

  python3 music.py <stil> <ausgabe.wav> [--takte-json takte.json]

Stile: spawn duels gipfelsturm bollwerk burgverlies party mirni mornicraft
Schreibt neben der WAV-Datei eine JSON mit den Zeitpunkten der Takte (für den Schnitt im Takt).
"""
import json, os, random, subprocess, sys, tempfile
import mido

SF2 = os.environ.get('MM_SF2', '/usr/share/sounds/sf2/FluidR3_GM.sf2')
TPB = 480  # Ticks pro Viertel
DRUMS = 9

# Das MoinMorni-Thema (C-Dur, 4/4). Jede Note: (Tonhöhe, Dauer in Vierteln), None = Pause.
N = {'B3': 59, 'C4': 60, 'D4': 62, 'E4': 64, 'F4': 65, 'G4': 67, 'A4': 69, 'B4': 71,
     'C5': 72, 'D5': 74, 'E5': 76, 'F5': 77, 'G5': 79}
A_PART = [
    [('G4', 1), ('E4', .5), ('F4', .5), ('G4', 1), ('C5', 1)],
    [('B4', 1), ('A4', .5), ('G4', .5), ('A4', 2)],
    [('F4', 1), ('D4', .5), ('E4', .5), ('F4', 1), ('A4', 1)],
    [('G4', 3), (None, 1)],
    [('G4', 1), ('E4', .5), ('F4', .5), ('G4', 1), ('C5', 1)],
    [('D5', 1), ('C5', .5), ('B4', .5), ('A4', 1), ('F4', 1)],
    [('E4', 1), ('G4', 1), ('D4', 1), ('B3', 1)],
    [('C4', 3), (None, 1)],
]
B_PART = [
    [('E5', 1.5), ('D5', .5), ('C5', 1), ('A4', 1)],
    [('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 1)],
    [('F4', 1), ('A4', 1), ('C5', 1), ('F5', 1)],
    [('E5', 2), ('D5', 2)],
    [('E5', 1.5), ('D5', .5), ('C5', 1), ('A4', 1)],
    [('G4', 1), ('C5', 1), ('E5', 1), ('G5', 1)],
    [('F5', 1), ('E5', .5), ('D5', .5), ('C5', 1), ('B4', 1)],
    [('C5', 3), (None, 1)],
]
# Akkorde je Takt (zwei Einträge = halber Takt je Akkord).
A_CHORDS = [['C'], ['Am'], ['F'], ['G'], ['C'], ['Dm'], ['C', 'G7'], ['C']]
B_CHORDS = [['Am'], ['C'], ['F'], ['G'], ['Am'], ['C'], ['F', 'G7'], ['C']]
CHORD = {'C': [0, 4, 7], 'Am': [9, 12, 16], 'F': [5, 9, 12], 'G': [7, 11, 14], 'G7': [7, 11, 14, 17],
         'Dm': [2, 5, 9], 'Cm': [0, 3, 7], 'Ab': [8, 12, 15], 'Fm': [5, 8, 12], 'Bb': [10, 14, 17]}
MINOR_CHORD = {'C': 'Cm', 'Am': 'Ab', 'F': 'Fm', 'G': 'G', 'G7': 'G7', 'Dm': 'Fm'}

STYLES = {
    # tempo, Tonart (Halbtöne über C), Moll?, Ablauf, Instrumente (GM-Programm), Begleitung, Schlagzeug
    'spawn':       dict(tempo=116, key=5, minor=False, form='IAB A E', lead=21, lead2=9, bass=58, comp=21, pad=48,
                        groove='oompah', drums='polka', vel=92),
    'duels':       dict(tempo=138, key=-3, minor=True, form='IAB AE', lead=60, lead2=56, bass=43, comp=48, pad=48,
                        groove='ostinato', drums='epic', vel=100),
    'gipfelsturm': dict(tempo=152, key=2, minor=False, form='IAB AE', lead=72, lead2=73, bass=33, comp=45, pad=48,
                        groove='drive', drums='rock', vel=98),
    'bollwerk':    dict(tempo=112, key=-2, minor=True, form='IAB AE', lead=56, lead2=60, bass=58, comp=48, pad=48,
                        groove='march', drums='march', vel=100),
    'burgverlies': dict(tempo=92, key=-4, minor=True, form='IABE', lead=69, lead2=42, bass=43, comp=6, pad=52,
                        groove='dark', drums='dark', vel=86),
    'party':       dict(tempo=164, key=7, minor=False, form='IAB ABE', lead=13, lead2=21, bass=58, comp=21, pad=48,
                        groove='oompah', drums='party', vel=100),
    'mirni':       dict(tempo=104, key=0, minor=False, form='IAB E', lead=73, lead2=46, bass=32, comp=25, pad=48,
                        groove='pick', drums='soft', vel=88),
    'mornicraft':  dict(tempo=124, key=-5, minor=False, form='IAB AE', lead=60, lead2=48, bass=43, comp=46, pad=48,
                        groove='harp', drums='epic', vel=96),
}


def minorize(note, chord):
    """C-Dur → c-Moll; über G/G7 bleibt das H (harmonisches Moll)."""
    pc = note % 12
    if pc == 4 or pc == 9:
        return note - 1
    if pc == 11 and chord not in ('G', 'G7'):
        return note - 1
    return note


class Song:
    def __init__(self, style):
        self.s = STYLES[style]
        self.rng = random.Random(style)
        self.ev = []  # (tick, kanal, msg)
        self.bar_ticks = 4 * TPB

    def note(self, ch, tick, pitch, dur, vel):
        jitter = self.rng.randint(-6, 6) if ch != DRUMS else self.rng.randint(-3, 3)
        t = max(0, int(tick + jitter))
        v = max(1, min(127, int(vel + self.rng.randint(-7, 7))))
        self.ev.append((t, 1, mido.Message('note_on', channel=ch, note=pitch, velocity=v)))
        self.ev.append((t + max(10, int(dur * TPB * 0.92)), 0, mido.Message('note_off', channel=ch, note=pitch, velocity=0)))

    def chord_at(self, chords, beat):
        c = chords[0] if len(chords) == 1 or beat < 2 else chords[1]
        return MINOR_CHORD.get(c, c) if self.s['minor'] else c

    def melody(self, bars, chords, start_bar, ch, octave=0, vel=None, harmony=False):
        vel = vel or self.s['vel']
        for i, bar in enumerate(bars):
            beat = 0.0
            for name, d in bar:
                if name:
                    p = N[name] + octave
                    c = self.chord_at(chords[i], beat)
                    if self.s['minor']:
                        p = minorize(p, chords[i][0] if beat < 2 or len(chords[i]) == 1 else chords[i][1])
                    tick = (start_bar + i) * self.bar_ticks + beat * TPB
                    accent = 8 if beat in (0, 2) else 0
                    self.note(ch, tick, p + self.s['key'], d, vel + accent)
                    if harmony:  # Terz/Sext darunter aus dem Akkord
                        tones = sorted({(r % 12) for r in CHORD[c]})
                        below = max((q for q in range(p - 9, p - 2) if q % 12 in tones), default=None)
                        if below:
                            self.note(ch, tick, below + self.s['key'], d, vel - 18)
                beat += d

    def accompany(self, chords, start_bar, nbars, groove, intensity=1.0):
        s, k = self.s, self.s['key']
        for i in range(nbars):
            base = (start_bar + i) * self.bar_ticks
            for beat in range(4):
                c = self.chord_at(chords[i % len(chords)], beat)
                tones = [48 + t for t in CHORD[c]]
                root = 36 + CHORD[c][0] % 12
                t = base + beat * TPB
                v = int(78 * intensity)
                if groove == 'oompah':
                    if beat in (0, 2):
                        self.note(1, t, root + k + (7 if beat == 2 else 0) - (12 if root + 7 > 47 and beat == 2 else 0), .9, v + 10)
                    else:
                        for q in tones: self.note(2, t, q + 12 + k, .45, v - 8)
                elif groove == 'ostinato':
                    for e in range(2):
                        self.note(2, t + e * TPB // 2, tones[e % len(tones)] + 12 + k, .45, v - 6)
                    if beat in (0, 2): self.note(1, t, root + k, 1.8, v + 8)
                elif groove == 'drive':
                    for e in range(2):
                        self.note(1, t + e * TPB // 2, root + k + (12 if e else 0), .45, v)
                    if beat % 2 == 1:
                        for q in tones: self.note(2, t, q + 12 + k, .3, v - 10)
                elif groove == 'march':
                    if beat in (0, 2): self.note(1, t, root + k, .9, v + 10)
                    for q in tones: self.note(2, t, q + k, .6, v - 12)
                elif groove == 'dark':
                    if beat == 0:
                        self.note(1, t, root + k - 12, 4, v)
                        for q in tones: self.note(3, t, q + k, 4, v - 25)
                    self.note(2, t, tones[beat % len(tones)] + 12 + k, .9, v - 20)
                elif groove == 'pick':
                    if beat in (0, 2): self.note(1, t, root + k, 1.8, v)
                    for e in range(2):
                        q = tones[(beat * 2 + e) % len(tones)] + 12
                        self.note(2, t + e * TPB // 2, q + k, .9, v - 10)
                elif groove == 'harp':
                    if beat == 0:
                        self.note(1, t, root + k, 4, v)
                        for q in tones: self.note(3, t, q + k, 4, v - 28)
                    for e in range(2):
                        q = tones[(beat * 2 + e) % len(tones)] + 24
                        self.note(2, t + e * TPB // 2, q + k, .5, v - 14)

    def drums(self, start_bar, nbars, kind, fill_last=True, intensity=1.0):
        for i in range(nbars):
            base = (start_bar + i) * self.bar_ticks
            last = fill_last and i == nbars - 1
            v = int(90 * intensity)
            def hit(n, beat, vel=v): self.note(DRUMS, base + beat * TPB, n, .2, vel)
            if kind == 'polka':
                for b in (0, 2): hit(36, b)
                for b in (1, 3): hit(38, b, v - 25)
                for b in range(4): hit(42, b + .5, v - 40)
            elif kind == 'epic':
                for b in (0, 1.5, 2.5): hit(36, b, v + 5)
                hit(38, 1, v - 5); hit(38, 3, v - 5)
                for b in range(8): hit(42, b / 2, v - 45)
            elif kind == 'rock':
                for b in (0, 2.5): hit(36, b)
                for b in (1, 3): hit(38, b)
                for b in range(8): hit(42, b / 2, v - 35)
            elif kind == 'march':
                hit(36, 0, v); hit(36, 2, v)
                for b in (1, 1.75, 3, 3.25, 3.5, 3.75): hit(38, b, v - 30)
            elif kind == 'dark':
                hit(36, 0, v - 10)
                if i % 2 == 1: hit(47, 2.5, v - 25)
            elif kind == 'party':
                for b in (0, 2): hit(36, b)
                for b in (1, 3): hit(39, b, v - 15)
                for b in range(8): hit(54, b / 2, v - 40)
            elif kind == 'soft':
                hit(36, 0, v - 30); hit(37, 2, v - 40)
                for b in range(4): hit(42, b + .5, v - 55)
            if last and kind not in ('dark', 'soft'):
                for b in (2, 2.5, 3, 3.25, 3.5, 3.75): hit(45 if b < 3 else 38, b, v - 10)

    def build(self):
        s = self.s
        # Kanäle: 0 Melodie, 1 Bass, 2 Begleitung, 3 Fläche, 4 zweite Stimme
        programs = {0: s['lead'], 1: s['bass'], 2: s['comp'], 3: s['pad'], 4: s['lead2']}
        bar = 0
        marks = []
        form = s['form'].replace(' ', '')
        nA = form.count('A')
        seen_a = 0
        for part in form:
            if part == 'I':
                marks.append(('intro', bar))
                self.accompany(A_CHORDS[:2] + A_CHORDS[:2], bar, 4, s['groove'], .8)
                self.drums(bar + 2, 2, s['drums'], intensity=.8)
                bar += 4
            elif part in 'AB':
                marks.append((part, bar))
                bars, chords = (A_PART, A_CHORDS) if part == 'A' else (B_PART, B_CHORDS)
                big = part == 'A' and seen_a > 0 or part == 'B'
                self.melody(bars, chords, bar, 0, octave=12 if s['lead'] in (72, 73, 13, 9) else 0, harmony=big)
                if big:
                    self.melody(bars, chords, bar, 4, octave=12 if s['lead2'] in (9, 13, 72, 73) else -12, vel=s['vel'] - 20)
                self.accompany(chords, bar, 8, s['groove'], 1.0 if big else .85)
                self.drums(bar, 8, s['drums'], intensity=1.0 if big else .85)
                for i in range(0, 8, 4):  # Fläche
                    c = self.chord_at(chords[i], 0)
                    for q in CHORD[c]: self.note(3, (bar + i) * self.bar_ticks, 60 + q + s['key'], 15.5, 48)
                bar += 8
                if part == 'A': seen_a += 1
            elif part == 'E':
                marks.append(('ende', bar))
                c = 'Cm' if s['minor'] else 'C'
                t = bar * self.bar_ticks
                for q in CHORD[c]:
                    for chn, base in ((2, 60), (3, 60), (0, 72)):
                        self.note(chn, t, base + q + s['key'], 7, 96)
                self.note(1, t, 36 + s['key'], 7, 104)
                self.note(DRUMS, t, 49, 1, 110)
                self.note(DRUMS, t, 36, 1, 110)
                bar += 2
        return programs, marks, bar

    def write(self, wav):
        programs, marks, bars = self.build()
        mid = mido.MidiFile(ticks_per_beat=TPB)
        tr = mido.MidiTrack(); mid.tracks.append(tr)
        tr.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(self.s['tempo']), time=0))
        for ch, prog in programs.items():
            tr.append(mido.Message('program_change', channel=ch, program=prog, time=0))
            tr.append(mido.Message('control_change', channel=ch, control=91, value=60, time=0))
        tr.append(mido.Message('control_change', channel=3, control=7, value=70, time=0))
        now = 0
        for tick, _, msg in sorted(self.ev, key=lambda e: (e[0], e[1])):
            tr.append(msg.copy(time=tick - now)); now = tick
        with tempfile.TemporaryDirectory() as d:
            midf = os.path.join(d, 'song.mid'); mid.save(midf)
            raw = os.path.join(d, 'raw.wav')
            subprocess.run(['fluidsynth', '-ni', '-g', '0.6', '-r', '48000', '-F', raw, SF2, midf], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            sec_per_bar = 4 * 60 / self.s['tempo']
            total = bars * sec_per_bar + 2.5
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-t', f'{total:.2f}',
                            '-af', f'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={total - 2.5:.2f}:d=2.5',
                            '-ar', '48000', wav], check=True)
        info = {'tempo': self.s['tempo'], 'secPerBar': sec_per_bar, 'bars': bars, 'duration': total,
                'parts': [{'part': p, 'bar': b, 'time': b * sec_per_bar} for p, b in marks]}
        json.dump(info, open(os.path.splitext(wav)[0] + '.json', 'w'), indent=1)
        return info


if __name__ == '__main__':
    style, out = sys.argv[1], sys.argv[2]
    info = Song(style).write(out)
    print(out, f"{info['duration']:.1f}s", info['parts'])
