import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Hub } from '../hub/index.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import { readServerFile, removeServerFiles, writeServerFile } from '../motor/files.js';
import { isOurNetwork, NETWORK_NAME } from '../public/status.js';
import { INTERIM_MODE_JARS, INTERIM_NETWORK_JAR, renamedServer } from '../lib/rename.js';
import {
  MODE_JARS,
  MODE_MEMORY_MB,
  MODE_REPOS,
  WARTUNG_MEMORY_MB,
  WARTUNG_SERVER,
  type Mode,
} from '@moinmorni/shared';
import type { ReleaseSource } from './mode-releases.js';
import { proxyFingerprint } from './plugin-parts.js';

/**
 * Das Netzwerk richtet sich selbst ein: Proxy (Velocity mit Bedrock, allen Versionen und Voice-Chat) und Lobby
 * (Paper) werden im Motor angelegt und als Netzwerk verdrahtet; jeder Server bekommt das Netzwerk-Plugin und
 * seine eigene hub.json. Läuft nach der Ersteinrichtung und bei jedem Start – was schon da ist, bleibt.
 */

export const PROXY_MEMBER = 'proxy';
export const LOBBY_MEMBER = 'lobby';
/** Bau-Server fürs Bauteam (Kreativ, flach, WorldEdit) – kein Modus, nur mit dem Recht „Bauen“. */
export const BUILD_MEMBER = 'bau';
/** Wartungs-Lobby: zweite Wahl nach der Lobby (Neustart, Absturz, Wartung) – klein, immer an, schläft nie. */
export const WARTUNG_MEMBER = WARTUNG_SERVER;
const PLUGIN_DIR = 'plugins';
const HUB_FILE = 'plugins/moinmorni/hub.json';
const STAMP_FILE = 'plugins/moinmorni/plugin.sha256';
/**
 * Proxy: Fingerabdruck der Teile des Netzwerk-Plugins, die Velocity lädt (network/plugin-parts.ts). Nur wenn er sich
 * ändert, startet der Proxy wegen einer neuen Jar neu – sonst liegt sie schon da und gilt beim nächsten Neustart.
 */
const PROXY_PARTS_FILE = 'plugins/moinmorni/proxy-parts.sha256';
const PROXY_MEMORY_MB = 1024;
export const LOBBY_MEMORY_MB = 3072;
const PROXY_PORT = 25565;
const LOBBY_PORT = 25566;
export const BUILD_MEMORY_MB = 1536;
const BUILD_PORT = 25567;
const WARTUNG_PORT = 25568;
/** WorldEdit von Modrinth (der Motor lädt es mit Prüfsumme). */
const WORLDEDIT = { source: 'modrinth', projectId: 'worldedit' } as const;
/** Spielmodi: Speicher pro Server, Ports ab hier (dahinter keine Ports nach außen, nur für den Motor). */
/** Standard-Arbeitsspeicher eines Modus-Servers (einzelne Modi brauchen mehr, siehe `MODE_MEMORY_MB`). */
export const MODE_DEFAULT_MEMORY_MB = 1536;
const MODE_PORT_BASE = 25570;
const MODE_STAMP_FILE = 'plugins/moinmorni/mode-release.txt';
/** hub.json eingerückt wie bisher (sonst sähe jede Datei „geändert“ aus und alle Server starteten neu). */
const JSON_INDENT = 2;
/** Falls der Motor gerade keine Versionsliste bekommt (PaperMC nicht erreichbar). */
const FALLBACK_VERSION: Readonly<Record<'paper' | 'velocity', string>> = { paper: '26.3', velocity: '4.3.1' };

interface MotorNetwork {
  readonly id: string;
  readonly name: string;
  readonly proxy: { readonly serverId: string; readonly serverName?: string; readonly state: string };
  readonly members: ReadonlyArray<{
    readonly serverId: string;
    readonly name: string;
    readonly serverName?: string;
    readonly state: string;
  }>;
  readonly defaultMember: string | null;
}

export interface ProvisionResult {
  readonly networkId: string;
  /** Server-ID der Lobby im Motor (für den Bau der Welt). */
  readonly lobbyServerId: string;
  /** Server-ID der Wartungs-Lobby im Motor (baut sich wie die Lobby). */
  readonly wartungServerId: string;
  readonly created: readonly string[];
  /** Neu angelegte Server, die der Motor nicht starten wollte (z. B. Arbeitsspeicher des Rechners voll). */
  readonly notStarted?: readonly string[];
  readonly pluginUpdated: readonly string[];
  /**
   * Laufende Server, die neu starten müssen, damit Neues gilt (Plugin, Hub-Schlüssel, server.properties) – am besten,
   * sobald niemand drauf ist.
   */
  readonly restart: ReadonlyArray<{ readonly serverId: string; readonly member: string }>;
  /** Alle Server des Netzwerks (Proxy und Spielserver). */
  readonly servers: ReadonlyArray<{ readonly serverId: string; readonly member: string }>;
  /** Spielmodi, deren Plugin neu aufgespielt wurde (Stand aus dem Release). */
  readonly modesInstalled: readonly string[];
}

export interface ProvisionOptions {
  /** Add-ons des Proxys (Tests: keine Downloads). */
  readonly proxyAddOns?: Readonly<Record<string, boolean>>;
  /** Add-ons der Lobby (Sprachchat für die Brücke). */
  readonly lobbyAddOns?: Readonly<Record<string, boolean>>;
  /** Feste Versionen statt der neuesten (Tests). */
  readonly versions?: Readonly<Record<'paper' | 'velocity', string>>;
  /** Stellt die server.properties der Lobby ein (vor dem ersten Start); true = geändert. */
  readonly configureLobby?: (serverId: string) => Promise<boolean>;
  /** Stellt den Bau-Server ein (Kreativ, flach, friedlich); true = geändert. */
  readonly configureBuild?: (serverId: string) => Promise<boolean>;
  /** Stellt die Wartungs-Lobby ein (flache Welt, Abenteuer, friedlich, wenig Sichtweite); true = geändert. */
  readonly configureWartung?: (serverId: string) => Promise<boolean>;
  /**
   * Stellt den Server eines Spielmodus ein (Höchstzahl hinter dem Proxy, `player-cap.ts`) – neue vor dem ersten Start,
   * bestehende bei jedem Lauf (danach steht es drin, nichts ändert sich mehr); true = geändert. `member` ist der Name
   * des Servers im Netzwerk (z. B. „angelkoenig“ – der bekommt zusätzlich sein Fisch-Paket).
   */
  readonly configureMode?: (serverId: string, member: string) => Promise<boolean>;
  /** WorldEdit auf den Bau-Server laden (Tests: nein – kein Internet). */
  readonly buildContent?: boolean;
  /** Spielmodi (aus dem Panel); mit `releases` bekommt jeder Modus mit Repo seinen eigenen Server. */
  readonly modes?: () => readonly Mode[];
  /** Woher die Jars der Spielmodi kommen (GitHub-Releases). */
  readonly releases?: ReleaseSource;
  /** Neue Spielmodi bekommen von selbst ihren Server, sobald es ein Release gibt (Panel → Updates). Ohne = ja. */
  readonly addModes?: () => boolean;
  /** Neu angelegte Server vor dem ersten Start vorbereiten (z. B. Einstellungen der Spielmodi). */
  readonly prepare?: (
    servers: ReadonlyArray<{ readonly serverId: string; readonly member: string }>,
  ) => Promise<void>;
}

/** Spielmodi, die ein Repo mit Releases haben und einen eigenen Server bekommen (nicht „bald“). */
export const releaseModes = (modes: readonly Mode[]): Mode[] =>
  modes.filter((m) => m.server && m.state !== 'soon' && MODE_REPOS[m.id]);

const PROXY_ADD_ONS = { geyser: true, via: true, voice: true };
/** Spielserver brauchen Simple Voice Chat, damit die Sprachkanäle über alle Server gehen. */
const BACKEND_ADD_ONS = { voice: true };

export interface NetworkProvisioner {
  /** Alles prüfen und fehlende Teile anlegen. */
  readonly ensure: () => Promise<ProvisionResult>;
}

export function createProvisioner(
  config: Config,
  motor: MotorClient,
  hub: Pick<Hub, 'keyFor'>,
  log: FastifyBaseLogger,
  options: ProvisionOptions = {},
): NetworkProvisioner {
  const latest = async (software: 'paper' | 'velocity'): Promise<string> => {
    if (options.versions) return options.versions[software];
    try {
      const list = await motor.request<Array<{ id: string; stable: boolean }>>(
        'GET',
        `/api/versions/${software}`,
      );
      return list.find((v) => v.stable)?.id ?? FALLBACK_VERSION[software];
    } catch {
      return FALLBACK_VERSION[software];
    }
  };

  const createServer = async (
    name: string,
    software: 'paper' | 'velocity',
    memoryMb: number,
    port: number,
  ) => {
    const body = {
      name,
      edition: 'java',
      software,
      version: await latest(software),
      memoryMb,
      port,
      eula: true,
      autoStart: true,
      startNow: false,
      // Immer online, ohne Spieler aber kaum Arbeitsspeicher (kleiner Start, Java gibt zurück, die Welt pausiert).
      releaseIdleMemory: true,
      addOns:
        software === 'velocity'
          ? (options.proxyAddOns ?? PROXY_ADD_ONS)
          : (options.lobbyAddOns ?? BACKEND_ADD_ONS),
    };
    return motor.request<{ id: string }>('POST', '/api/servers', body);
  };

  const plugin = (): { bytes: Buffer; sha: string } | null => {
    try {
      const bytes = fs.readFileSync(config.pluginFile);
      return { bytes, sha: crypto.createHash('sha256').update(bytes).digest('hex') };
    } catch {
      return null;
    }
  };

  const readFile = (serverId: string, file: string): Promise<string | null> =>
    readServerFile(motor, serverId, file);
  const writeFile = (serverId: string, file: string, content: string): Promise<void> =>
    writeServerFile(motor, serverId, file, content);

  /**
   * Liegt die Jar wirklich im Plugin-Ordner? Den Stempel kann es auch ohne sie geben (z. B. wenn ein Netzwerk-Plugin unter
   * dem Zwischen-Namen sie beim Start gelöscht hat) – dann kommt sie neu.
   */
  const hasPluginJar = async (serverId: string, name: string): Promise<boolean> => {
    try {
      const list = await motor.request<Array<{ readonly name: string }>>(
        'GET',
        `/api/servers/${serverId}/files?path=${PLUGIN_DIR}`,
      );
      return list.some((f) => f.name === name);
    } catch (err) {
      if (err instanceof MotorError) return false;
      throw err;
    }
  };

  /**
   * hub.json und Plugin auf einen Server. `plugin` = Plugin neu, `hub` = Zugang zum Hub geändert (z. B. neuer
   * Schlüssel nach einem Update) – beides wirkt erst nach einem Neustart.
   */
  /**
   * Fingerabdruck der Velocity-Teile der Jar, die gerade auf dem Proxy liegt (gemerkt oder aus der Jar selbst);
   * null = unbekannt (dann lieber neu starten).
   */
  const installedProxyParts = async (serverId: string, jarName: string): Promise<string | null> => {
    const remembered = (await readFile(serverId, PROXY_PARTS_FILE))?.trim();
    if (remembered) return remembered;
    try {
      return proxyFingerprint(await motor.download(serverId, `${PLUGIN_DIR}/${jarName}`));
    } catch {
      return null;
    }
  };

  /**
   * Plugin und Hub-Schlüssel aufspielen. `restart` = der Server muss dafür neu starten. Beim Proxy nur, wenn sich die
   * Teile geändert haben, die Velocity lädt – sonst startete er bei fast jedem Update (Lobby, Paper-Teile) mit allen
   * Spielern neu (Philip: „ganz zuletzt, nur wenn wirklich nötig, der Proxy“). Die Jar wird per Umbenennen ersetzt,
   * der laufende Proxy liest weiter seine alte.
   */
  const equip = async (
    serverId: string,
    member: string,
    kind: 'proxy' | 'backend',
  ): Promise<{ plugin: boolean; hub: boolean; restart: boolean }> => {
    const hubJson = `${JSON.stringify(
      { url: config.hubUrl, server: member, kind, key: hub.keyFor(member, kind) },
      null,
      JSON_INDENT,
    )}\n`;
    const hubChanged = (await readFile(serverId, HUB_FILE)) !== hubJson;
    if (hubChanged) await writeFile(serverId, HUB_FILE, hubJson);
    const jar = plugin();
    if (!jar) {
      log.warn({ file: config.pluginFile }, 'Netzwerk-Plugin fehlt im Image – Server laufen ohne Hub');
      return { plugin: false, hub: hubChanged, restart: hubChanged };
    }
    const jarName = path.basename(config.pluginFile);
    const hasJar = await hasPluginJar(serverId, jarName);
    if ((await readFile(serverId, STAMP_FILE))?.trim() === jar.sha && hasJar)
      return { plugin: false, hub: hubChanged, restart: hubChanged };
    const parts = kind === 'proxy' ? proxyFingerprint(jar.bytes) : null;
    const partsBefore = kind === 'proxy' && hasJar ? await installedProxyParts(serverId, jarName) : null;
    await motor.upload(serverId, PLUGIN_DIR, jarName, jar.bytes);
    // Rückbenennung: die Jar unter dem Zwischen-Namen muss weg, sonst laufen nach dem Neustart zwei Netzwerk-Plugins.
    if (jarName !== INTERIM_NETWORK_JAR)
      await removeServerFiles(motor, serverId, [`${PLUGIN_DIR}/${INTERIM_NETWORK_JAR}`]);
    await writeFile(serverId, STAMP_FILE, `${jar.sha}\n`);
    if (kind !== 'proxy') return { plugin: true, hub: hubChanged, restart: true };
    if (parts) await writeFile(serverId, PROXY_PARTS_FILE, `${parts}\n`);
    const same = parts !== null && parts === partsBefore;
    if (same)
      log.info(
        'Netzwerk-Plugin: für den Proxy nichts Neues – er startet deswegen nicht neu (gilt beim nächsten Mal)',
      );
    return { plugin: true, hub: hubChanged, restart: hubChanged || !same };
  };

  /**
   * Rückbenennung: Server, die noch mit dem Zwischen-Namen vorne im Motor stehen („… Lobby“), heißen wieder
   * „MoinMorni Lobby“ usw.
   */
  const renameServers = async (network: MotorNetwork): Promise<void> => {
    const all = [network.proxy, ...network.members];
    await all.reduce(async (prev, s) => {
      await prev;
      const next = renamedServer(s.serverName ?? '', NETWORK_NAME);
      if (!next) return;
      await motor.request('PATCH', `/api/servers/${s.serverId}`, { name: next });
      log.info({ server: next }, 'Server im Motor umbenannt');
    }, Promise.resolve());
  };

  /** Spielmodi mit Repo, eigenem Server und Release (nicht „bald“). */
  const modeTargets = async (): Promise<
    Array<{ mode: Mode; release: NonNullable<Awaited<ReturnType<ReleaseSource['latest']>>> }>
  > => {
    const releases = options.releases;
    if (!releases || !options.modes) return [];
    const wanted = releaseModes(options.modes());
    const found = await Promise.all(
      wanted.map(async (mode) => ({
        mode,
        release: await releases.latest(MODE_REPOS[mode.id] ?? '', MODE_JARS[mode.id]),
      })),
    );
    return found.flatMap((f) => (f.release ? [{ mode: f.mode, release: f.release }] : []));
  };

  return {
    ensure: async () => {
      const created: string[] = [];
      const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
      const existing = networks.find(isOurNetwork);
      if (existing && existing.name !== NETWORK_NAME) {
        await motor.request('PATCH', `/api/networks/${existing.id}`, { name: NETWORK_NAME });
        log.info('Netzwerk im Motor heißt wieder MoinMorni');
      }
      const network =
        existing ??
        (await (async () => {
          const proxy = await createServer('MoinMorni Proxy', 'velocity', PROXY_MEMORY_MB, PROXY_PORT);
          created.push(PROXY_MEMBER);
          log.info('Netzwerk: Proxy angelegt');
          return motor.request<MotorNetwork>('POST', '/api/networks', {
            name: NETWORK_NAME,
            proxyServerId: proxy.id,
          });
        })());

      if (!network.members.some((m) => m.name === LOBBY_MEMBER)) {
        const lobby = await createServer('MoinMorni Lobby', 'paper', LOBBY_MEMORY_MB, LOBBY_PORT);
        await motor.request('POST', `/api/networks/${network.id}/members`, {
          serverId: lobby.id,
          name: LOBBY_MEMBER,
        });
        created.push(LOBBY_MEMBER);
        log.info('Netzwerk: Lobby angelegt');
      }
      // Wartungs-Lobby: auch bestehende Installationen bekommen sie beim nächsten Start dazu.
      if (!network.members.some((m) => m.name === WARTUNG_MEMBER)) {
        const wartung = await createServer('MoinMorni Wartung', 'paper', WARTUNG_MEMORY_MB, WARTUNG_PORT);
        await motor.request('POST', `/api/networks/${network.id}/members`, {
          serverId: wartung.id,
          name: WARTUNG_MEMBER,
        });
        created.push(WARTUNG_MEMBER);
        log.info('Netzwerk: Wartungs-Lobby angelegt');
      }
      if (!network.members.some((m) => m.name === BUILD_MEMBER)) {
        const bau = await createServer('MoinMorni Bau', 'paper', BUILD_MEMORY_MB, BUILD_PORT);
        await motor.request('POST', `/api/networks/${network.id}/members`, {
          serverId: bau.id,
          name: BUILD_MEMBER,
        });
        created.push(BUILD_MEMBER);
        log.info('Netzwerk: Bau-Server angelegt');
        if (options.buildContent !== false) {
          try {
            await motor.request('POST', `/api/servers/${bau.id}/market/install`, WORLDEDIT);
          } catch (err) {
            log.warn({ err }, 'Bau-Server: WorldEdit ließ sich nicht laden');
          }
        }
      }
      // Spielmodi mit eigenem Repo: Server anlegen, sobald es ein Release gibt.
      const modeReleases = await modeTargets();
      await modeReleases.reduce(async (prev, { mode }, i) => {
        await prev;
        const member = mode.server ?? '';
        if (network.members.some((m) => m.name === member)) return;
        if (options.addModes && !options.addModes()) {
          log.info(
            { mode: mode.id },
            'Neuer Spielmodus hat ein Release – kommt dazu, sobald es im Panel erlaubt ist',
          );
          return;
        }
        const server = await createServer(
          `MoinMorni ${mode.name.de}`,
          'paper',
          MODE_MEMORY_MB[mode.id] ?? MODE_DEFAULT_MEMORY_MB,
          MODE_PORT_BASE + i,
        );
        await motor.request('POST', `/api/networks/${network.id}/members`, {
          serverId: server.id,
          name: member,
        });
        created.push(member);
        log.info({ mode: mode.id }, 'Netzwerk: Server für Spielmodus angelegt');
      }, Promise.resolve());
      const fresh = await motor.request<MotorNetwork>('GET', `/api/networks/${network.id}`);
      await renameServers(fresh);
      if (fresh.defaultMember !== LOBBY_MEMBER)
        await motor.request('PATCH', `/api/networks/${network.id}`, { defaultMember: LOBBY_MEMBER });

      const targets: Array<{ serverId: string; member: string; kind: 'proxy' | 'backend' }> = [
        { serverId: fresh.proxy.serverId, member: PROXY_MEMBER, kind: 'proxy' },
        ...fresh.members.map((m) => ({ serverId: m.serverId, member: m.name, kind: 'backend' as const })),
      ];
      const equipped = await targets.reduce<
        Promise<Array<{ member: string; plugin: boolean; hub: boolean; restart: boolean }>>
      >(
        async (acc, t) => [
          ...(await acc),
          { member: t.member, ...(await equip(t.serverId, t.member, t.kind)) },
        ],
        Promise.resolve([]),
      );
      const updated = equipped.filter((e) => e.plugin).map((e) => e.member);
      const modesInstalled = await modeReleases.reduce<Promise<string[]>>(async (acc, { mode, release }) => {
        const done = await acc;
        const serverId = fresh.members.find((m) => m.name === mode.server)?.serverId;
        if (!serverId) return done;
        const stamp = `${release.repo}@${release.tag}`;
        const [installed = '', installedJar = ''] = ((await readFile(serverId, MODE_STAMP_FILE)) ?? '')
          .split('\n')
          .map((l) => l.trim());
        if (installed === stamp) return done;
        await motor.upload(serverId, PLUGIN_DIR, release.fileName, release.bytes);
        // Heißt die Jar jetzt anders (z. B. nach der Rückbenennung), muss die alte weg – nie zwei Fassungen.
        const stale = [installedJar, INTERIM_MODE_JARS[mode.id] ?? ''].filter(
          (name, i, all) => name && name !== release.fileName && all.indexOf(name) === i,
        );
        if (stale.length)
          await removeServerFiles(
            motor,
            serverId,
            stale.map((name) => `${PLUGIN_DIR}/${name}`),
          );
        await writeFile(serverId, MODE_STAMP_FILE, `${stamp}\n${release.fileName}\n`);
        log.info({ mode: mode.id, tag: release.tag }, 'Spielmodus: Plugin aufgespielt');
        return [...done, mode.server ?? ''];
      }, Promise.resolve([]));

      const lobbyServerId = fresh.members.find((m) => m.name === LOBBY_MEMBER)?.serverId ?? '';
      const lobbyChanged =
        options.configureLobby && lobbyServerId ? await options.configureLobby(lobbyServerId) : false;
      if (lobbyChanged && !created.includes(LOBBY_MEMBER))
        log.info('Lobby: Einstellungen geändert – gelten nach dem nächsten Neustart der Lobby');
      const wartungServerId = fresh.members.find((m) => m.name === WARTUNG_MEMBER)?.serverId ?? '';
      const wartungChanged =
        options.configureWartung && wartungServerId ? await options.configureWartung(wartungServerId) : false;
      const buildServerId = fresh.members.find((m) => m.name === BUILD_MEMBER)?.serverId;
      const buildChanged =
        buildServerId && options.configureBuild ? await options.configureBuild(buildServerId) : false;
      const ownSettings: readonly string[] = [LOBBY_MEMBER, BUILD_MEMBER, WARTUNG_MEMBER];
      const modesChanged = await fresh.members
        .filter((m) => !ownSettings.includes(m.name))
        .reduce<Promise<string[]>>(async (acc, m) => {
          const done = await acc;
          return options.configureMode && (await options.configureMode(m.serverId, m.name))
            ? [...done, m.name]
            : done;
        }, Promise.resolve([]));
      const stale = new Set([
        ...modesChanged,
        ...equipped.filter((e) => e.restart).map((e) => e.member),
        ...modesInstalled,
        ...(lobbyChanged ? [LOBBY_MEMBER] : []),
        ...(buildChanged ? [BUILD_MEMBER] : []),
        ...(wartungChanged ? [WARTUNG_MEMBER] : []),
      ]);
      const restart = targets
        .filter((t) => stale.has(t.member) && !created.includes(t.member))
        .map((t) => ({ serverId: t.serverId, member: t.member }));

      // Neu angelegte Server erst jetzt starten – mit Plugin, Schlüssel und Einstellungen.
      const newcomers = targets.filter((t) => created.includes(t.member));
      if (options.prepare && newcomers.length) {
        try {
          await options.prepare(newcomers.map((t) => ({ serverId: t.serverId, member: t.member })));
        } catch (err) {
          log.warn(
            { err },
            'Netzwerk: neue Server ließen sich nicht ganz vorbereiten – sie starten trotzdem',
          );
        }
      }
      // Nacheinander (Proxy, Lobby, Wartungs-Lobby, Bau, Modi): Lehnt der Motor einen Start ab (z. B. „Arbeitsspeicher
      // des Rechners voll“), bleibt nur dieser Server aus – die Einrichtung läuft weiter (Lobby-Welt, Einstellungen).
      // Vorher brach sie ab und kam erst nach einem Neustart von MoinMorni wieder (Gesamtprobe 17.11.).
      const notStarted = await newcomers.reduce<Promise<string[]>>(async (acc, t) => {
        const missed = await acc;
        try {
          await motor.request('POST', `/api/servers/${t.serverId}/actions/start`);
          return missed;
        } catch (err) {
          log.warn(
            { err, server: t.member },
            'Netzwerk: neuer Server ließ sich nicht starten – bleibt erst einmal aus',
          );
          return [...missed, t.member];
        }
      }, Promise.resolve([]));
      return {
        notStarted,
        networkId: network.id,
        lobbyServerId,
        wartungServerId,
        created,
        pluginUpdated: updated,
        restart,
        servers: targets.map((t) => ({ serverId: t.serverId, member: t.member })),
        modesInstalled,
      };
    },
  };
}
