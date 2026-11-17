import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { streamerHosts } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { modePlayers } from '../db/schema.js';
import type { Stores } from '../panel/stores.js';
import type { Body } from './transport.js';

/**
 * MorniCraft (Plugin pmornhart/MorniCraft) im Netzwerk: Was im Panel unter Einstellungen → MorniCraft steht, geht als
 * `mornicraft-settings` an den MorniCraft-Server. Das Netzwerk-Plugin schreibt es nach
 * `plugins/MorniCraft/network.json`, MorniCraft legt es über seine config.yml und lädt neu – sofort, ohne Neustart.
 *
 * Die Schlüssel sind die der config.yml von MorniCraft (wie MorniHosting sie schreibt). Ränge, Abzeichen, Chat,
 * /msg und Strafen kommen im Netzwerk vom Netzwerk – sie stehen hier nicht.
 */

const MODE_ID = 'mornicraft';
const lines = (raw: unknown): string[] =>
  String(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export interface MorniCraftContext {
  readonly domain: string;
  readonly timeZone: string;
}

/** Der Server des Modus MorniCraft im Netzwerk (null = keiner). */
export function morniCraftServer(stores: Stores): string | null {
  return stores.modes().find((m) => m.id === MODE_ID)?.server ?? null;
}

export function morniCraftSettings(stores: Stores, ctx: MorniCraftContext): Body {
  const s = stores.settings(MODE_ID);
  const site = stores.settings('website');
  const net = stores.settings('network');
  const n = (key: string): number => Number(s[key]);
  const b = (key: string): boolean => s[key] === true;
  const limit = (cmd: string): { uses: number; hours: number } => ({
    uses: n(`${cmd}Limit`),
    hours: n(`${cmd}LimitHours`),
  });
  return {
    t: 'mornicraft-settings',
    config: {
      language: net['defaultLanguage'] === 'en' ? 'en' : 'de',
      'server-name': 'MorniCraft auf MoinMorni',
      timezone: ctx.timeZone,
      link: '',
      'update-check': false,
      'teleport-delay': n('teleportDelay'),
      'max-homes': n('maxHomes'),
      'spawn-command': b('spawnCommand'),
      homes: b('homes'),
      tpa: b('tpa'),
      back: b('back'),
      limits: {
        spawn: limit('spawn'),
        home: limit('home'),
        tpa: limit('tpa'),
        back: limit('back'),
      },
      'spawn-protection': b('spawnProtection'),
      'spawn-radius': n('spawnRadius'),
      'sleep-at-spawn': b('sleepAtSpawn'),
      'pvp-at-spawn': b('pvpAtSpawn'),
      welcome: b('welcome'),
      elytra: b('elytra'),
      'elytra-radius': n('elytraRadius'),
      'elytra-boost': b('elytraBoost'),
      tnt: b('tnt'),
      'creeper-damage': b('creeperDamage'),
      'fire-spread': b('fireSpread'),
      'enderman-grief': b('endermanGrief'),
      'combat-seconds': n('combatSeconds'),
      graves: b('graves'),
      'grave-private-minutes': 0,
      sit: b('sit'),
      clans: { enabled: b('clans'), 'max-members': n('clanMaxMembers') },
      sidebar: b('sidebar'),
      'tab-stats': b('tabStats'),
      'hard-dragon': b('hardDragon'),
      dragon: {
        health: n('dragonHealth'),
        damage: n('dragonDamage'),
        'attack-seconds': n('dragonAttackSeconds'),
        'rage-percent': n('dragonRagePercent'),
        xp: n('dragonXp'),
        brood: b('dragonBrood'),
        lightning: b('dragonLightning'),
        fireballs: b('dragonFireballs'),
        fangs: b('dragonFangs'),
        endermen: b('dragonEndermen'),
        levitation: b('dragonLevitation'),
        shockwave: b('dragonShockwave'),
        crystals: b('dragonCrystals'),
        egg: b('dragonEgg'),
      },
      // Im Streamer-Modus verdeckt: die Adressen aus dem Panel (Netzwerk → Streamer-Modus), wie auf allen Servern.
      // Ob jemand streamt, kommt nicht von hier: das Netzwerk-Plugin hängt es an den Spieler (moinmorni:streamer).
      streamer: { hide: streamerHosts(net, ctx.domain) },
      network: {
        // Dieselben Regeln wie auf der Webseite und im Discord.
        'rules-de': lines(site['rulesDe']),
        'rules-en': lines(site['rulesEn']),
        address: ctx.domain,
        'panel-players': `https://${ctx.domain}/panel/spieler`,
        'panel-punishments': `https://${ctx.domain}/panel/strafen`,
      },
    },
  };
}

/** Bereiche, deren Änderung MorniCraft neu braucht. */
export const MORNICRAFT_AREAS: ReadonlySet<string> = new Set([MODE_ID, 'website', 'network']);

// ---------- Was MorniCraft über einen Spieler meldet (nur lesen, fürs Panel) ----------

const NAME_MAX = 32;
const WORLD_MAX = 64;
const COORD_MAX = 30_000_000;
const HOMES_MAX = 20;
const GRAVES_MAX = 10;
const ITEMS_MAX = 100_000;
const MEMBERS_MAX = 100;
// Kürzel eines Clans: "MC" – Buchstaben und Ziffern.
// https://regex101.com/?flavor=javascript&regex=%5E%5B%5Cp%7BL%7D%5Cp%7BN%7D%5D%7B1%2C6%7D%24&flags=u&testString=MC
const TAG = /^[\p{L}\p{N}]{1,6}$/u;
// https://regex101.com/?flavor=javascript&regex=%5E%23%5B0-9a-fA-F%5D%7B6%7D%24&testString=%237dd3fc
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const coord = z.number().int().min(-COORD_MAX).max(COORD_MAX);
const place = { world: z.string().min(1).max(WORLD_MAX), x: coord, y: coord, z: coord };

/** Zuhause, Clan, Gräber, online/AFK – geprüft, unbekannte Felder fliegen raus. */
export const morniCraftPlayerSchema = z.object({
  online: z.boolean(),
  afk: z.boolean(),
  homes: z.array(z.object({ name: z.string().min(1).max(NAME_MAX), ...place })).max(HOMES_MAX),
  clan: z
    .object({
      name: z.string().min(1).max(NAME_MAX),
      tag: z.string().regex(TAG),
      colour: z.string().regex(COLOUR),
      leader: z.boolean(),
      members: z.number().int().min(1).max(MEMBERS_MAX),
    })
    .nullable()
    // Ohne Clan schreibt MorniCraft (Gson) das Feld gar nicht – fehlt es, gilt „kein Clan“.
    .default(null),
  graves: z
    .array(
      z.object({ ...place, items: z.number().int().min(0).max(ITEMS_MAX), since: z.number().int().min(0) }),
    )
    .max(GRAVES_MAX),
});
export type MorniCraftPlayer = z.infer<typeof morniCraftPlayerSchema>;

/** Prüfung der Zusammenfassung je Modus – nur Modi, die eine haben. */
export const MODE_PLAYER_SCHEMAS: Readonly<Record<string, z.ZodType>> = { [MODE_ID]: morniCraftPlayerSchema };

export function saveModePlayer(db: Db, mode: string, uuid: string, data: unknown): void {
  const updatedAt = new Date().toISOString();
  db.insert(modePlayers)
    .values({ mode, uuid, data, updatedAt })
    .onConflictDoUpdate({ target: [modePlayers.mode, modePlayers.uuid], set: { data, updatedAt } })
    .run();
}

/** MorniCraft-Daten eines Spielers (null = war nie auf MorniCraft). */
export function morniCraftPlayer(db: Db, uuid: string): (MorniCraftPlayer & { updatedAt: string }) | null {
  const row = db
    .select()
    .from(modePlayers)
    .where(and(eq(modePlayers.mode, MODE_ID), eq(modePlayers.uuid, uuid)))
    .get();
  if (!row) return null;
  const parsed = morniCraftPlayerSchema.safeParse(row.data);
  return parsed.success ? { ...parsed.data, updatedAt: row.updatedAt } : null;
}
