import { z } from 'zod';
import { patchProperties } from '../lobby/world.js';
import { badRequest, notFound } from '../lib/errors.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import { BUILD_MEMBER } from '../network/provision.js';
import type { Stores } from '../panel/stores.js';
import { isOurNetwork } from '../public/status.js';

/**
 * Bau-Server fürs Bauteam: Kreativ, flache Welt, friedlich, WorldEdit. Was dort mit WorldEdit gespeichert wird
 * (`//schem save <name>`), lässt sich im Panel per Knopf in einen Modus (oder die Lobby) kopieren – dort lädt man es
 * mit `//schem load <name>` und setzt es mit `//paste` ein.
 */

const PROPERTIES_FILE = 'server.properties';
export const SCHEMATIC_DIR = 'plugins/WorldEdit/schematics';
const HTTP_NOT_FOUND = 404;
// Schematic-Datei: Name mit Buchstaben, Ziffern, _ - und Punkt, Endung .schem oder .schematic – "rathaus.schem"
// passt, "../x.schem" (Pfad) oder "a b.schem" (Leerzeichen) nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-zA-Z0-9_-%5D%5Ba-zA-Z0-9_.-%5D*%5C.(schem%7Cschematic)%24&testString=rathaus.schem
const SCHEMATIC = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(schem|schematic)$/;

const FILE_MAX = 64;
const TARGET_MAX = 32;
export const copySchema = z.object({
  file: z.string().regex(SCHEMATIC).max(FILE_MAX),
  target: z.string().min(1).max(TARGET_MAX),
});

/** Flache Welt wie Minecrafts „Klassisch flach“: Grundgestein, zwei Erde, Gras, Ebene. */
const FLAT_WORLD = {
  biome: 'minecraft:plains',
  layers: [
    { block: 'minecraft:bedrock', height: 1 },
    { block: 'minecraft:dirt', height: 2 },
    { block: 'minecraft:grass_block', height: 1 },
  ],
};

export function buildProperties(): Record<string, string> {
  return {
    gamemode: 'creative',
    // Minecraft ab 26.x legt neue Server mit eingeschalteter Whitelist an – wer hinein darf, entscheidet der Hub.
    'white-list': 'false',
    'enforce-whitelist': 'false',
    'force-gamemode': 'false',
    difficulty: 'peaceful',
    'spawn-monsters': 'false',
    pvp: 'false',
    'level-type': 'minecraft:flat',
    // Ohne Schichten meldet Minecraft „No key layers“ und nimmt still die Standard-Schichten – so steht es fest.
    'generator-settings': JSON.stringify(FLAT_WORLD),
    'generate-structures': 'false',
    'allow-nether': 'false',
    'spawn-protection': '0',
    // Befehle über RCON (Bauten kopieren) nicht als „[Rcon: …]“ in den Chat des Teams.
    'broadcast-rcon-to-ops': 'false',
    'broadcast-console-to-ops': 'false',
    motd: 'MoinMorni Bau-Server',
  };
}

interface MotorNetwork {
  readonly name: string;
  readonly members: ReadonlyArray<{ readonly serverId: string; readonly name: string }>;
}
interface FileEntry {
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly size: number;
  readonly modifiedAt: string;
}

export interface BuildService {
  readonly configure: (serverId: string) => Promise<boolean>;
  readonly overview: () => Promise<{
    available: boolean;
    schematics: Array<{ name: string; size: number; modifiedAt: string }>;
    targets: Array<{ id: string; name: string }>;
  }>;
  readonly copy: (file: string, target: string) => Promise<void>;
}

export function createBuildService(motor: MotorClient, stores: Stores): BuildService {
  const members = async (): Promise<Map<string, string>> => {
    const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
    const net = networks.find(isOurNetwork);
    return new Map((net?.members ?? []).map((m) => [m.name, m.serverId]));
  };
  /** Wohin Bauten dürfen: Lobby und alle Modi mit Server (nicht der Bau-Server selbst). */
  const targets = (servers: Map<string, string>): Array<{ id: string; name: string }> => [
    ...(servers.has('lobby') ? [{ id: 'lobby', name: 'Lobby' }] : []),
    ...stores
      .modes()
      .filter((m) => m.server && m.server !== BUILD_MEMBER && servers.has(m.server))
      .map((m) => ({ id: m.server ?? '', name: m.name.de })),
  ];

  return {
    configure: async (serverId) => {
      const path = `/api/servers/${serverId}/files/content?path=${encodeURIComponent(PROPERTIES_FILE)}`;
      const current = await (async () => {
        try {
          return (await motor.request<{ content: string }>('GET', path)).content;
        } catch {
          return '';
        }
      })();
      const next = patchProperties(current, buildProperties());
      if (!next.changed) return false;
      await motor.request('PUT', `/api/servers/${serverId}/files/content`, {
        path: PROPERTIES_FILE,
        content: next.text,
      });
      return true;
    },
    overview: async () => {
      const servers = await members();
      const bau = servers.get(BUILD_MEMBER);
      if (!bau) return { available: false, schematics: [], targets: [] };
      const list = await (async (): Promise<FileEntry[]> => {
        try {
          return await motor.request<FileEntry[]>(
            'GET',
            `/api/servers/${bau}/files?path=${encodeURIComponent(SCHEMATIC_DIR)}`,
          );
        } catch (err) {
          // Noch nichts gespeichert: den Ordner gibt es noch nicht.
          if (err instanceof MotorError && err.status === HTTP_NOT_FOUND) return [];
          throw err;
        }
      })();
      return {
        available: true,
        schematics: list
          .filter((f) => f.type === 'file' && SCHEMATIC.test(f.name))
          .map((f) => ({ name: f.name, size: f.size, modifiedAt: f.modifiedAt }))
          .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
        targets: targets(servers),
      };
    },
    copy: async (file, target) => {
      const servers = await members();
      const bau = servers.get(BUILD_MEMBER);
      const to = servers.get(target);
      if (!bau) throw notFound('build_server_missing');
      if (!to || !targets(servers).some((t) => t.id === target)) throw badRequest('build_target_unknown');
      const bytes = await motor.download(bau, `${SCHEMATIC_DIR}/${file}`);
      await motor.upload(to, SCHEMATIC_DIR, file, bytes);
    },
  };
}
