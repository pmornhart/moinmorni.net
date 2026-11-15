import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Hub } from '../hub/index.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import { NETWORK_NAME } from '../public/status.js';

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
const LOBBY_MEMORY_MB = 4096;
const PROXY_PORT = 25565;
const LOBBY_PORT = 25566;
const BUILD_MEMORY_MB = 3072;
const BUILD_PORT = 25567;
/** WorldEdit von Modrinth (der Motor lädt es mit Prüfsumme). */
const WORLDEDIT = { source: 'modrinth', projectId: 'worldedit' } as const;
/** Falls der Motor gerade keine Versionsliste bekommt (PaperMC nicht erreichbar). */
const FALLBACK_VERSION: Readonly<Record<'paper' | 'velocity', string>> = { paper: '26.3', velocity: '4.3.1' };

interface MotorNetwork {
  readonly id: string;
  readonly name: string;
  readonly proxy: { readonly serverId: string; readonly state: string };
  readonly members: ReadonlyArray<{
    readonly serverId: string;
    readonly name: string;
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
}

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

  const readFile = async (serverId: string, file: string): Promise<string | null> => {
    try {
      const r = await motor.request<{ content: string }>(
        'GET',
        `/api/servers/${serverId}/files/content?path=${encodeURIComponent(file)}`,
      );
      return r.content;
    } catch (err) {
      if (err instanceof MotorError) return null;
      throw err;
    }
  };
  const writeFile = (serverId: string, file: string, content: string): Promise<void> =>
    motor.request('PUT', `/api/servers/${serverId}/files/content`, { path: file, content });

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
      2,
    )}\n`;
    const hubChanged = (await readFile(serverId, HUB_FILE)) !== hubJson;
    if (hubChanged) await writeFile(serverId, HUB_FILE, hubJson);
    const jar = plugin();
    if (!jar) {
      log.warn({ file: config.pluginFile }, 'Netzwerk-Plugin fehlt im Image – Server laufen ohne Hub');
      return { plugin: false, hub: hubChanged };
    }
    if ((await readFile(serverId, STAMP_FILE))?.trim() === jar.sha) return { plugin: false, hub: hubChanged };
    await motor.upload(serverId, PLUGIN_DIR, path.basename(config.pluginFile), jar.bytes);
    await writeFile(serverId, STAMP_FILE, `${jar.sha}\n`);
    return { plugin: true, hub: hubChanged };
  };

  return {
    ensure: async () => {
      const created: string[] = [];
      const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
      const existing = networks.find((n) => n.name === NETWORK_NAME);
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
      const fresh = await motor.request<MotorNetwork>('GET', `/api/networks/${network.id}`);
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
        ...(lobbyChanged ? [LOBBY_MEMBER] : []),
        ...(buildChanged ? [BUILD_MEMBER] : []),
      ]);
      const restart = targets
        .filter((t) => stale.has(t.member) && !created.includes(t.member))
        .map((t) => ({ serverId: t.serverId, member: t.member }));

      // Neu angelegte Server erst jetzt starten – mit Plugin, Schlüssel und Einstellungen.
      await Promise.all(
        targets
          .filter((t) => created.includes(t.member))
          .map((t) => motor.request('POST', `/api/servers/${t.serverId}/actions/start`)),
      );
      return { networkId: network.id, lobbyServerId, created, pluginUpdated: updated, restart };
    },
  };
}
