import type { FastifyBaseLogger } from 'fastify';
import { WARTUNG_GENERATOR, wartungPack } from '@moinmorni/builder';
import type { MotorClient } from '../motor/client.js';
import { createLobbyWorld, type LobbyWorld, type LobbyWorldOptions } from './world.js';

/**
 * Die Wartungs-Lobby baut sich wie die Lobby selbst (`world.ts`): ihr Bauplan liegt im Baukasten
 * (`packages/builder/src/wartung/`), MoinMorni spielt ihn über den Motor auf und merkt sich die gebaute Version.
 * Die Welt ist flach (wenig Arbeitsspeicher), mit kleiner Sichtweite; viele Spieler passen gleichzeitig hinein – bei
 * einem Neustart der Lobby kommt das ganze Netzwerk her.
 */

/** So viele dürfen gleichzeitig warten (Paper prüft das auch hinter dem Proxy). */
const MAX_PLAYERS = 500;
const VIEW_DISTANCE = 6;
const SIMULATION_DISTANCE = 4;

/** server.properties der Wartungs-Lobby (Welt-Art gilt nur beim ersten Start – danach ändert sie nichts mehr). */
export function wartungProperties(): Record<string, string> {
  return {
    gamemode: 'adventure',
    'force-gamemode': 'true',
    difficulty: 'peaceful',
    pvp: 'false',
    'spawn-protection': '0',
    'allow-nether': 'false',
    'generate-structures': 'false',
    // Minecraft ab 26.x legt neue Server mit eingeschalteter Whitelist an – wer hinein darf, entscheidet der Hub.
    'white-list': 'false',
    'enforce-whitelist': 'false',
    'level-type': 'minecraft:flat',
    'generator-settings': JSON.stringify(WARTUNG_GENERATOR),
    'max-players': String(MAX_PLAYERS),
    'view-distance': String(VIEW_DISTANCE),
    'simulation-distance': String(SIMULATION_DISTANCE),
    motd: 'MoinMorni – Wartungs-Lobby',
  };
}

export function createWartungWorld(
  motor: MotorClient,
  log: FastifyBaseLogger,
  options: Omit<LobbyWorldOptions, 'pack' | 'properties' | 'label' | 'season' | 'packOffer'> = {},
): LobbyWorld {
  return createLobbyWorld(motor, log, {
    ...options,
    pack: wartungPack,
    properties: wartungProperties,
    label: 'Wartungs-Lobby',
  });
}
