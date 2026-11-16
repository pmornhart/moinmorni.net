import path from 'node:path';
import { z } from 'zod';

/** Einstellungen aus der Umgebung (.env im Container, nur für root lesbar). */

const SECRET_MIN = 32;
const DEFAULT_PORT = 8080;
const DEFAULT_HUB_PORT = 8090;
const PORT_MAX = 65535;
const DEFAULT_BEDROCK_PORT = 19132;
// Slashes at the end of an address: "http://motor:8080/" → "http://motor:8080"; "http://motor:8080" stays.
// https://regex101.com/?flavor=javascript&regex=%2F%2B%24&testString=http%3A%2F%2Fmotor%3A8080%2F
const TRAILING_SLASHES = /\/+$/;

const envSchema = z.object({
  /** Schlüssel zum Verschlüsseln gespeicherter Geheimnisse (Bot-Token, Hub-Schlüssel). */
  MM_SECRET: z.string().min(SECRET_MIN),
  MM_DATA_DIR: z.string().default('/data'),
  MM_HOST: z.string().default('0.0.0.0'),
  MM_PORT: z.coerce.number().int().min(0).max(PORT_MAX).default(DEFAULT_PORT),
  /** Hub für die Plugins – nur im Minecraft-Netz erreichbar, nie nach außen. */
  MM_HUB_PORT: z.coerce.number().int().min(0).max(PORT_MAX).default(DEFAULT_HUB_PORT),
  /** Der Motor (MorniHosting im Motor-Modus) und sein Dienst-Schlüssel. */
  MM_MOTOR_URL: z.string().url().default('http://motor:8080'),
  MM_MOTOR_TOKEN: z.string().min(1),
  /** Öffentliche Adresse, z. B. morni.net. */
  MM_DOMAIN: z.string().default('morni.net'),
  MM_BEDROCK_PORT: z.coerce.number().int().min(1).max(PORT_MAX).default(DEFAULT_BEDROCK_PORT),
  MM_WEB_DIR: z.string().optional(),
  /** Wie die Plugins den Hub erreichen (Container-Name im Minecraft-Netz). */
  MM_HUB_URL: z.string().default('ws://morninet:8090/hub'),
  /** Das Netzwerk-Plugin, das morni.net auf Proxy und Spielserver legt (im Image unter /app/plugins). */
  MM_PLUGIN_FILE: z.string().default('/app/plugins/MorniNet.jar'),
  /** Netzwerk (Proxy + Lobby) nach der Einrichtung selbst anlegen; false nur für Tests. */
  MM_AUTO_NETWORK: z.enum(['true', 'false']).default('true'),
  /** Token des eigenen Discord-Bots (optional; lässt sich auch im Panel eintragen). */
  MM_DISCORD_TOKEN: z.string().optional(),
  /** Geheimnis der Discord-Anwendung (OAuth2) – für „Mit Discord anmelden“ beim Bewerben auf der Webseite. */
  MM_DISCORD_CLIENT_SECRET: z.string().optional(),
  /** Discord-API (nur Tests zeigen auf ein nachgebautes Discord). */
  MM_DISCORD_API: z.string().url().default('https://discord.com/api/v10'),
  /** Zeitzone für Zeiten im Spiel (bis wann ein Bann gilt). */
  TZ: z.string().default('Europe/Berlin'),
  /** Gebaute Version (update.sh/install.sh: „v0.1.2-0-g<commit>“), „dev“ ohne. */
  MM_VERSION: z.string().default('dev'),
  /** Updates folgen diesem Branch auf GitHub. */
  MM_UPDATE_BRANCH: z.string().default('main'),
  /** GitHub-API (Tests zeigen auf ein nachgebautes GitHub). */
  MM_GITHUB_API: z.string().url().default('https://api.github.com'),
});

export interface Config {
  readonly secret: string;
  readonly dataDir: string;
  readonly host: string;
  readonly port: number;
  readonly hubPort: number;
  readonly motorUrl: string;
  readonly motorToken: string;
  readonly domain: string;
  readonly bedrockPort: number;
  readonly webDir: string;
  readonly timeZone: string;
  readonly hubUrl: string;
  readonly pluginFile: string;
  readonly autoNetwork: boolean;
  readonly discordToken: string | null;
  readonly discordApi: string;
  readonly discordClientSecret: string | null;
  readonly version: string;
  readonly updateBranch: string;
  readonly githubApi: string;
}

export function loadConfig(env: Record<string, string | undefined>, here: string): Config {
  const e = envSchema.parse(env);
  return {
    secret: e.MM_SECRET,
    dataDir: path.resolve(e.MM_DATA_DIR),
    host: e.MM_HOST,
    port: e.MM_PORT,
    hubPort: e.MM_HUB_PORT,
    motorUrl: e.MM_MOTOR_URL.replace(TRAILING_SLASHES, ''),
    motorToken: e.MM_MOTOR_TOKEN,
    domain: e.MM_DOMAIN,
    bedrockPort: e.MM_BEDROCK_PORT,
    webDir: e.MM_WEB_DIR ? path.resolve(e.MM_WEB_DIR) : path.resolve(here, '../../web/dist'),
    timeZone: e.TZ,
    hubUrl: e.MM_HUB_URL,
    pluginFile: path.resolve(e.MM_PLUGIN_FILE),
    autoNetwork: e.MM_AUTO_NETWORK === 'true',
    discordToken: e.MM_DISCORD_TOKEN?.trim() || null,
    discordApi: e.MM_DISCORD_API.replace(TRAILING_SLASHES, ''),
    discordClientSecret: e.MM_DISCORD_CLIENT_SECRET?.trim() || null,
    version: e.MM_VERSION,
    updateBranch: e.MM_UPDATE_BRANCH,
    githubApi: e.MM_GITHUB_API.replace(TRAILING_SLASHES, ''),
  };
}
