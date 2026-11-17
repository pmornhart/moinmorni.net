import { z } from 'zod';
import { networkCommand } from '@moinmorni/shared';
import type { Command } from './commands.js';
import type { HubContext } from './context.js';
import type { Body, Connection } from './transport.js';
import { LANGS, text } from './texts.js';

/**
 * Das Netzwerk-Paket aus Sicht des Hubs (`packs/netz.ts`): Er sagt dem Proxy, wo es liegt (Nachricht `netzpaket`),
 * der Proxy bietet es jedem Java-Spieler einmal beim Betreten an und nimmt es nie wieder ab. Was der Spieler damit
 * macht, meldet der Proxy mit `pack` (geladen ja/nein, dazu `status`): Mit Paket spielt die Lobbymusik als
 * Klangdatei, Angelkönig zeigt die eigene Kleidung (Metadaten `moinmorni:paket` aus dem Profil) – und ist das Paket
 * im Panel Pflicht (Netzwerk → Ressourcenpaket), muss, wer ablehnt, freundlich hinaus.
 */

export interface NetzPackOffer {
  readonly url: string;
  readonly sha1: string;
}

/** Länge einer UUID mit Bindestrichen (36) und etwas Luft – wie bei den anderen Nachrichten des Proxys. */
const UUID_MAX = 40;
const statusSchema = z.object({
  uuid: z.string().min(1).max(UUID_MAX),
  loaded: z.boolean(),
  // Ältere Proxys schickten nur `loaded` (Lobby-Paket).
  status: z.enum(['sent', 'loaded', 'declined', 'failed', 'discarded']).optional(),
});

export interface NetzPack {
  /** Ist das Paket im Panel Pflicht (gilt auch für das Abzeichen-Paket)? */
  readonly required: () => boolean;
  /** Was der Proxy wissen muss: an/aus, Adresse, SHA-1, Pflicht, Text im Fenster. */
  readonly proxyBody: () => Body;
  /** Meldung `pack` vom Proxy (nach der Lobbymusik, die das Profil nachzieht). */
  readonly onStatus: (conn: Connection, body: Body) => void;
  readonly commands: readonly Command[];
}

export interface NetzPackOptions {
  readonly ctx: HubContext;
  /** Wo das Paket gerade liegt; null = keins (keine Domain). */
  readonly offer: () => NetzPackOffer | null;
  readonly toProxy: (body: Body) => boolean;
}

export function createNetzPack({ ctx, offer, toProxy }: NetzPackOptions): NetzPack {
  const required = (): boolean => ctx.stores.settings('network')['packRequired'] === true;
  /** Wer /paket getippt hat, bekommt Bescheid, wie es ausging. */
  const asked = new Set<string>();
  const say = (uuid: string, key: Parameters<typeof text>[1]): void => {
    const p = ctx.presence.get(uuid);
    if (p) ctx.msg(p.uuid, text(p.lang, key));
  };

  const command: Command = {
    ...networkCommand('paket'),
    run: (actor) => {
      if (offer() === null) {
        ctx.msg(actor.uuid, text(actor.lang, 'pack.off'));
        return;
      }
      if (ctx.presence.get(actor.uuid)?.bedrock) {
        ctx.msg(actor.uuid, text(actor.lang, 'pack.bedrock'));
        return;
      }
      asked.add(actor.uuid);
      ctx.msg(actor.uuid, text(actor.lang, 'pack.sending'));
      toProxy({ t: 'netzpaket-send', uuid: actor.uuid });
    },
  };

  return {
    required,
    proxyBody: () => {
      const pack = offer();
      return {
        t: 'netzpaket',
        enabled: pack !== null,
        url: pack?.url ?? null,
        sha1: pack?.sha1 ?? null,
        required: required(),
        // Pflicht steht im Fenster selbst – Minecraft bekommt das Paket nie als „verpflichtend“ (siehe Proxy).
        prompt: Object.fromEntries(
          LANGS.map((lang) => [lang, text(lang, required() ? 'pack.prompt_required' : 'pack.prompt')]),
        ),
      };
    },
    onStatus: (_conn, body) => {
      const m = statusSchema.parse(body);
      const p = ctx.presence.get(m.uuid);
      if (!p || !m.status) return;
      const wanted = asked.has(p.uuid);
      if (m.status !== 'sent') asked.delete(p.uuid);
      if (m.status === 'loaded' && wanted) say(p.uuid, 'pack.loaded');
      if (m.status === 'failed') say(p.uuid, 'pack.failed');
      if (m.status !== 'declined') return;
      // Pflicht: freundlich hinaus, mit Erklärung, wie man das Paket einschaltet.
      if (required()) ctx.kick(p.uuid, text(p.lang, 'pack.required'));
      else say(p.uuid, 'pack.declined');
    },
    commands: [command],
  };
}
