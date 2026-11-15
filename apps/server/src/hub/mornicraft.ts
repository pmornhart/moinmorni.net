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
      // Im Streamer-Modus verdeckt: die Adresse des Netzwerks.
      streamer: { hide: [ctx.domain] },
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
