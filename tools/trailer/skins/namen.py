#!/usr/bin/env python3
"""Namen der Darsteller → Skin. Prüft, dass jeder Name über seine Offline-UUID genau auf „seine“ Figur fällt, und
schreibt ../actors/actors.json.

Minecraft (Client 26.3, net.minecraft.client.resources.DefaultPlayerSkin) wählt für Spieler ohne Skin-Daten den
Standard-Skin aus der UUID: DEFAULT_SKINS[Math.floorMod(uuid.hashCode(), 18)] – Reihenfolge slim alex, ari, efe, kai,
makena, noor, steve, sunny, zuri, danach wide in derselben Reihenfolge. Offline-UUID = UUID.nameUUIDFromBytes(
"OfflinePlayer:" + Name) (MD5, Version 3). Der Name ist groß/klein-genau.

  python3 namen.py              # prüfen + actors.json schreiben
  python3 namen.py <Name> …     # nur anzeigen, welchen Skin ein Name bekäme
"""
import hashlib, json, os, sys, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
TEXTURES = ('alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri')

# Frei erfundene Namen (keine bekannten Personen oder Streamer), je Figur einer.
NAMEN = {
    'resi': 'ResiBlume19', 'sepp': 'Seppl19', 'jayden': 'jay_beatz2', 'lena': 'Lena_Herbst05', 'mia': 'mia_lofi06',
    'amara': 'AmaraSun08', 'kiki': 'Neonkatze2', 'yasmin': 'Yasi_Lila7', 'lotte': 'lotte_rennt12', 'jule': 'Pistenjule',
    'ella': 'EllaSommer7', 'hanni': 'HanniHof', 'yuki': 'Yuki_Tor10', 'toni': 'Toni_Wandert11', 'kuno': 'RitterKuno11',
    'luchs': 'NebelLuchs7', 'matze': 'Matzeee24', 'ewald': 'Ewald77',
}


def offline_uuid(name):
    return uuid.UUID(bytes=hashlib.md5(('OfflinePlayer:' + name).encode()).digest(), version=3)


def java_hash(u):
    msb, lsb = u.int >> 64, u.int & ((1 << 64) - 1)
    hilo = msb ^ lsb
    h = ((hilo >> 32) ^ hilo) & 0xffffffff
    return h - (1 << 32) if h >= 1 << 31 else h


def skin_of(name):
    i = java_hash(offline_uuid(name)) % 18  # Python-% = floorMod
    return ('slim' if i < 9 else 'wide'), TEXTURES[i % 9]


def main():
    if len(sys.argv) > 1:
        for n in sys.argv[1:]:
            print(n, '/'.join(skin_of(n)), offline_uuid(n))
        return
    figs = {f['id']: f for f in json.load(open(os.path.join(HERE, 'figuren.json')))}
    out, seen = [], set()
    for fid, name in NAMEN.items():
        f = figs[fid]
        model, tex = skin_of(name)
        assert (model, tex) == (f['model'], f['texture']), f'{name} bekäme {model}/{tex}, Figur {fid} ist {f["model"]}/{f["texture"]}'
        assert 3 <= len(name) <= 16 and name.replace('_', 'a').isalnum(), name
        assert (model, tex) not in seen, f'Skin doppelt: {model}/{tex}'
        seen.add((model, tex))
        out.append({'name': name, 'skin': f'{model}/{tex}', 'modell': model, 'figur': fid,
                    'uuid': str(offline_uuid(name)), 'beschreibung': f['beschreibung']})
    assert len(seen) == 18
    data = {'hinweis': 'Erfundene Spielernamen für Trailer-Darsteller. Jeder trägt im Aufnahme-Client (Ressourcenpaket '
                       'tools/trailer/skins) einen eigenen Skin; Name und Skin gehören fest zusammen (Offline-UUID).',
            'darsteller': out}
    path = os.path.join(HERE, '..', 'actors', 'actors.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    print(os.path.normpath(path), len(out), 'Darsteller')


if __name__ == '__main__':
    main()
