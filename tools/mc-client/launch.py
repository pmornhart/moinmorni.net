#!/usr/bin/env python3
"""Startet den echten Minecraft-Java-Client ohne Bildschirm (Xvfb + Mesa) – nur zum Testen und für Bilder.

Lädt die offiziellen Dateien von Mojang in einen lokalen Cache (MM_CACHE, Standard ~/mm-cache/client).
Nichts davon gehört ins Repo oder auf die Webseite.

  python3 launch.py --version 26.3 --name Morni --server 127.0.0.1:25565 [--display :99]
"""
import argparse, hashlib, json, os, platform, struct, subprocess, sys, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor

MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
ASSETS = 'https://resources.download.minecraft.net'


def fetch(url, dest, sha1=None):
    if os.path.exists(dest) and (sha1 is None or sha1_of(dest) == sha1):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.part'
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, 'wb') as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)
    if sha1 and sha1_of(tmp) != sha1:
        os.remove(tmp)
        raise RuntimeError(f'Prüfsumme falsch: {url}')
    os.replace(tmp, dest)
    return dest


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        while chunk := f.read(1 << 16):
            h.update(chunk)
    return h.hexdigest()


def allowed(rules):
    if not rules:
        return True
    ok = False
    for r in rules:
        osr = r.get('os')
        if 'features' in r:
            continue
        if osr is None or osr.get('name') == 'linux':
            ok = r['action'] == 'allow'
    return ok


def prepare(version, cache, with_sounds=False):
    manifest = json.load(urllib.request.urlopen(MANIFEST))
    entry = next(v for v in manifest['versions'] if v['id'] == version)
    meta_path = fetch(entry['url'], f'{cache}/versions/{version}/{version}.json', entry.get('sha1'))
    meta = json.load(open(meta_path))
    client = fetch(meta['downloads']['client']['url'], f'{cache}/versions/{version}/{version}.jar', meta['downloads']['client']['sha1'])
    jobs, classpath = [], []
    for lib in meta['libraries']:
        if not allowed(lib.get('rules')):
            continue
        art = lib.get('downloads', {}).get('artifact')
        if not art:
            continue
        name = lib['name']
        if ':natives-' in name and not name.endswith(':natives-linux'):
            continue
        dest = f"{cache}/libraries/{art['path']}"
        jobs.append((art['url'], dest, art['sha1']))
        classpath.append(dest)
    idx = meta['assetIndex']
    index_path = fetch(idx['url'], f"{cache}/assets/indexes/{idx['id']}.json", idx['sha1'])
    for key, obj in json.load(open(index_path))['objects'].items():
        if not with_sounds and (key.startswith('minecraft/sounds/') or key.startswith('minecraft/music/')):
            continue
        h = obj['hash']
        jobs.append((f'{ASSETS}/{h[:2]}/{h}', f'{cache}/assets/objects/{h[:2]}/{h}', h))
    with ThreadPoolExecutor(16) as pool:
        list(pool.map(lambda j: fetch(*j), jobs))
    classpath.append(client)
    return meta, classpath


# Startwerte für Test-Clients: kein Willkommens-Bildschirm, kein Ton, deutsche Sprache, ruhige Bildrate.
OPTIONS = {
    'onboardAccessibility': 'false', 'skipMultiplayerWarning': 'true', 'joinedFirstServer': 'true',
    'tutorialStep': 'none', 'pauseOnLostFocus': 'false', 'soundCategory_master': '0.0',
    'narrator': '0', 'maxFps': '30', 'guiScale': '3', 'renderDistance': '12', 'simulationDistance': '8',
    'graphicsPreset': '"fancy"', 'hideBundleTutorial': 'true', 'onboardAccessibility': 'false',
}


def apply_options(game_dir, lang, extra):
    path = f'{game_dir}/options.txt'
    lines = open(path).read().splitlines() if os.path.exists(path) else []
    wanted = dict(OPTIONS, lang=lang, **extra)
    seen = set()
    out = []
    for line in lines:
        key = line.split(':', 1)[0]
        if key in wanted:
            out.append(f'{key}:{wanted[key]}')
            seen.add(key)
        else:
            out.append(line)
    out += [f'{k}:{v}' for k, v in wanted.items() if k not in seen]
    open(path, 'w').write('\n'.join(out) + '\n')


def nbt_string(s):
    b = s.encode('utf-8')
    return struct.pack('>H', len(b)) + b


def write_server_list(game_dir, address, packs):
    """servers.dat mit einem Eintrag für `address`: Server-Ressourcenpakete an (True), aus (False) oder fragen (None).

    Quick Play nimmt den vorhandenen Eintrag – so kommt das Paket der Lobby ohne Rückfrage-Fenster."""
    entry = b'\x08' + nbt_string('ip') + nbt_string(address)
    entry += b'\x08' + nbt_string('name') + nbt_string('morni.net')
    if packs is not None:
        entry += b'\x01' + nbt_string('acceptTextures') + (b'\x01' if packs else b'\x00')
    entry += b'\x00'
    servers = b'\x09' + nbt_string('servers') + b'\x0a' + struct.pack('>i', 1) + entry
    open(f'{game_dir}/servers.dat', 'wb').write(b'\x0a' + nbt_string('') + servers + b'\x00')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default='26.3')
    ap.add_argument('--name', default='Morni')
    ap.add_argument('--server', help='host:port zum direkten Beitreten')
    ap.add_argument('--display', default=os.environ.get('DISPLAY', ':99'))
    ap.add_argument('--java', default=os.environ.get('MM_JAVA', 'java'))
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--height', type=int, default=900)
    ap.add_argument('--prepare-only', action='store_true')
    ap.add_argument('--lang', default='de_de')
    ap.add_argument('--memory', default=os.environ.get('MM_CLIENT_XMX', '3G'), help='Arbeitsspeicher für Java, z. B. 2G (wenn der Rechner knapp ist)')
    ap.add_argument('--option', action='append', default=[], help='key:value für options.txt')
    ap.add_argument('--server-packs', choices=['an', 'aus', 'fragen'], default='fragen',
                    help='Ressourcenpakete des Servers annehmen (an), ablehnen (aus) oder fragen')
    a = ap.parse_args()
    cache = os.environ.get('MM_CACHE', os.path.expanduser('~/mm-cache/client'))
    meta, cp = prepare(a.version, cache)
    if a.prepare_only:
        print('bereit:', len(cp), 'Dateien im Klassenpfad')
        return
    game_dir = f'{cache}/instances/{a.version}-{a.name}'
    os.makedirs(game_dir, exist_ok=True)
    apply_options(game_dir, a.lang, dict(o.split(':', 1) for o in a.option))
    player_uuid = str(uuid.UUID(bytes=hashlib.md5(f'OfflinePlayer:{a.name}'.encode()).digest(), version=3))
    args = [a.java, f'-Xmx{a.memory}', f'-Djava.library.path={game_dir}/natives', '-Dorg.lwjgl.util.Debug=false',
            '-cp', ':'.join(cp), meta['mainClass'],
            '--username', a.name, '--version', a.version, '--gameDir', game_dir,
            '--assetsDir', f'{cache}/assets', '--assetIndex', meta['assetIndex']['id'],
            '--uuid', player_uuid.replace('-', ''), '--accessToken', '0', '--userType', 'legacy',
            '--versionType', 'release', '--width', str(a.width), '--height', str(a.height)]
    if a.server:
        write_server_list(game_dir, a.server, {'an': True, 'aus': False, 'fragen': None}[a.server_packs])
        args += ['--quickPlayMultiplayer', a.server]
    env = dict(os.environ, DISPLAY=a.display, LIBGL_ALWAYS_SOFTWARE='1', GALLIUM_DRIVER='llvmpipe')
    os.execvpe(args[0], args, env)


if __name__ == '__main__':
    main()
