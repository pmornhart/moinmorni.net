import type { GameRight, Role } from '@moinmorni/shared';
import type { Stores } from '../panel/stores.js';
import type { PlayerService } from './players.js';
import type { Presence } from './presence.js';
import type { PunishService } from './punish.js';
import type { Lang } from './texts.js';

/** Was Chat und Befehle vom Hub brauchen. */
export interface HubContext {
  readonly presence: Presence;
  readonly players: PlayerService;
  readonly punish: PunishService;
  readonly stores: Stores;
  readonly timeZone: string;
  /** Öffentliche Adresse (Links zur Webseite). */
  readonly domain: string;
  /** Nachricht an einen Spieler, egal auf welchem Server (über den Proxy). */
  readonly msg: (uuid: string, text: string) => void;
  readonly kick: (uuid: string, text: string) => void;
  /** false = Server nicht im Netzwerk. */
  readonly connect: (uuid: string, server: string) => boolean;
  /** Wie über eine Figur: erst prüfen (Rechte, Wartung, Whitelist) und schlafende Server wecken, dann verbinden. */
  readonly goTo: (uuid: string, server: string) => void;
  /** Chat-Zeile an Spielserver: `servers` = alle oder einer. Text pro Sprache. */
  readonly chat: (servers: 'all' | string, line: Record<Lang, string>) => void;
  /** Hinweis an alle im Team, die dieses Recht haben. */
  readonly team: (right: GameRight, build: (lang: Lang) => string) => void;
  /** Rang/Name eines Spielers hat sich geändert → Spielserver neu informieren. */
  readonly refreshProfile: (uuid: string) => void;
  /** Bann-Liste an den Proxy. */
  readonly syncBans: () => void;
}

export const hasRight = (role: Role, right: GameRight): boolean => role.game.includes(right);
