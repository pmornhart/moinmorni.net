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
import { MODE_JARS, MODE_MEMORY_MB, MODE_REPOS, type Mode } from '@moinmorni/shared';
import type { ReleaseSource } from './mode-releases.js';

/**
 * Das Netzwerk richtet sich selbst ein: Proxy (Velocity mit Bedrock, allen Versionen und Voice-Chat) und Lobby
 * (Paper) werden im Motor angelegt und als Netzwerk verdrahtet; jeder Server bekommt das Netzwerk-Plugin und
 * seine eigene hub.json. Läuft nach der Ersteinrichtung und bei jedem Start – was schon da ist, bleibt.
 */

export const PROXY_MEMBER = 'proxy';
export const LOBBY_MEMBER = 'lobby';
/** Bau-Server fürs Bauteam (Kreativ, flach, WorldEdit) – kein Modus, nur mit dem Recht „Bauen“. */
export const BUILD_MEMBER = 'bau';
const PLUGIN_DIR = 'plugins';
const HUB_FILE = 'plugins/moinmorni/hub.json';
const STAMP_FILE = 'plugins/moinmorni/plugin.sha256';
const PROXY_MEMORY_MB = 1024;
export const LOBBY_MEMORY_MB = 3072;
const PROXY_PORT = 25565;
const LOBBY_PORT = 25566;
export const BUILD_MEMORY_MB = 1536;
const BUILD_PORT = 25567;
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
  readonly created: readonly string[];
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
  const equip = async (
    serverId: string,
    member: string,
    kind: 'proxy' | 'backend',
  ): Promise<{ plugin: boolean; hub: boolean }> => {
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
      return { plugin: false, hub: hubChanged };
    }
    const jarName = path.basename(config.pluginFile);
    if ((await readFile(serverId, STAMP_FILE))?.trim() === jar.sha && (await hasPluginJar(serverId, jarName)))
      return { plugin: false, hub: hubChanged };
    await motor.upload(serverId, PLUGIN_DIR, jarName, jar.bytes);
    // Rückbenennung: die Jar unter dem Zwischen-Namen muss weg, sonst laufen nach dem Neustart zwei Netzwerk-Plugins.
    if (jarName !== INTERIM_NETWORK_JAR)
      await removeServerFiles(motor, serverId, [`${PLUGIN_DIR}/${INTERIM_NETWORK_JAR}`]);
    await writeFile(serverId, STAMP_FILE, `${jar.sha}\n`);
    return { plugin: true, hub: hubChanged };
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
        Promise<Array<{ member: string; plugin: boolean; hub: boolean }>>
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
      const buildServerId = fresh.members.find((m) => m.name === BUILD_MEMBER)?.serverId;
      const buildChanged =
        buildServerId && options.configureBuild ? await options.configureBuild(buildServerId) : false;
      const stale = new Set([
        ...equipped.filter((e) => e.plugin || e.hub).map((e) => e.member),
        ...modesInstalled,
        ...(lobbyChanged ? [LOBBY_MEMBER] : []),
        ...(buildChanged ? [BUILD_MEMBER] : []),
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
      await Promise.all(
        targets
          .filter((t) => created.includes(t.member))
          .map((t) => motor.request('POST', `/api/servers/${t.serverId}/actions/start`)),
      );
      return {
        networkId: network.id,
        lobbyServerId,
        created,
        pluginUpdated: updated,
        restart,
        servers: targets.map((t) => ({ serverId: t.serverId, member: t.member })),
        modesInstalled,
      };
    },
  };
}
