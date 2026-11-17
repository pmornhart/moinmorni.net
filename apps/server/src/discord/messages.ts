import type { Mode, NetworkStatus } from '@moinmorni/shared';
import type { PositionView } from '../applications/team.js';
import { colourInt } from './layout.js';
import { bt } from './texts.js';

/**
 * Die festen Nachrichten, die der Bot beim Einrichten in die Kanäle stellt – als Embeds in den Farben der Webseite
 * (Smaragd und Gold), zuerst Deutsch, darunter Englisch. Bilder kommen von der Webseite (https://<Domain>/bilder/…),
 * Adresse und Port aus dem Panel bzw. dem Motor (public/status.ts). Ändert sich etwas im Panel (Regeln, Stellen,
 * Spielmodi), zieht der Bot die Nachricht nach.
 * Nachrichten-Bausteine: https://docs.discord.com/developers/components/reference
 */

export const EMERALD = 0x10b981;
export const GOLD = 0xe7bb4d;
export const GREY = 0x6b7280;
export const RED = 0xdc2626;
export const AMBER = 0xf59e0b;

export const ROW = 1;
export const BUTTON = 2;
export const STRING_SELECT = 3;
export const TEXT_INPUT = 4;
export const STYLE_PRIMARY = 1;
export const STYLE_SECONDARY = 2;
export const STYLE_SUCCESS = 3;
export const STYLE_DANGER = 4;
export const STYLE_LINK = 5;
/** Höchstens so viele Embeds pro Nachricht und Knöpfe pro Zeile (Discord). */
const EMBEDS_PER_MESSAGE = 10;
const BUTTONS_PER_ROW = 5;
const FIELD_MAX = 1024;
/** Beschreibung eines Embeds: höchstens so viele Zeichen. */
const DESCRIPTION_MAX = 4096;
const SHORT_TEXT = 180;
const WELCOME_PICTURE = 'hero-tag.webp';

export const CUSTOM_IDS = {
  ticketOpen: 'mm:ticket:open',
  ticketClose: 'mm:ticket:close',
  /** Auswahl bei /bewerben: Stelle oder MorniCraft. */
  applyPick: 'mm:apply:pick',
  /** Knopf „MorniCraft“ (wie bisher). */
  applyMornicraft: 'mm:apply',
  /** Knopf je Stelle: „mm:apply:team:moderator“. */
  applyTeam: 'mm:apply:team:',
} as const;

export type Body = Record<string, unknown>;

/** Farbe je Spielmodus – wie die Figuren auf der Webseite (apps/web/src/public/art.ts). */
const MODE_COLOURS: Readonly<Record<string, string>> = {
  mornicraft: '#6cc644',
  duels: '#ef4b3f',
  party: '#ffc93c',
  gipfelsturm: '#4cb4f0',
  burgverlies: '#a660f2',
  bollwerk: '#ff9a2e',
  mirni: '#9fb0ba',
  wolkenkampf: '#53dbe3',
  versteckerl: '#7fd35a',
  wintersport: '#cfe6ff',
  adlerflug: '#f070dc',
  angelkoenig: '#5b93ff',
  maibaumklau: '#d9944e',
  dorfkrimi: '#c7b8ff',
  baumeister: '#ff8a5c',
};

const MODE_ICON: Readonly<Record<Mode['state'], string>> = {
  on: '🟢',
  off: '⚫',
  maintenance: '🛠',
  soon: '🕓',
};
const MODE_STATE: Readonly<Record<Mode['state'], 'modeOn' | 'modeOff' | 'modeMaintenance' | 'modeSoon'>> = {
  on: 'modeOn',
  off: 'modeOff',
  maintenance: 'modeMaintenance',
  soon: 'modeSoon',
};

export interface BoardContext {
  readonly domain: string;
  readonly status: NetworkStatus;
  /** Discord-ID eines Kanals (für Erwähnungen wie #regeln); null = (noch) keiner. */
  readonly channel: (key: string) => string | null;
  readonly rules: { readonly de: readonly string[]; readonly en: readonly string[] };
  readonly modes: readonly Mode[];
  /** Offene Stellen fürs Team. */
  readonly positions: readonly PositionView[];
  readonly mornicraftOpen: boolean;
}

export const cut = (text: string, max = FIELD_MAX): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const web = (domain: string, path = ''): string => `https://${domain}${path}`;
const mention = (ctx: BoardContext, key: string, fallback: string): string => {
  const id = ctx.channel(key);
  return id ? `<#${id}>` : fallback;
};

export function welcomeMessage(ctx: BoardContext): Body {
  const s = ctx.status;
  const fields = (lang: 'de' | 'en') => [
    { name: bt(lang, 'welcomeJava'), value: `\`${s.javaAddress}\``, inline: true },
    {
      name: bt(lang, 'welcomeBedrock'),
      value: bt(lang, 'welcomeBedrockValue', { address: s.bedrockAddress, port: s.bedrockPort }),
      inline: true,
    },
    { name: bt(lang, 'welcomeWeb'), value: `[${ctx.domain}](${web(ctx.domain)})`, inline: true },
    { name: bt(lang, 'welcomeLink'), value: bt(lang, 'welcomeLinkText') },
    {
      name: bt(lang, 'welcomeNext'),
      value: bt(lang, 'welcomeNextText', {
        rules: mention(ctx, 'rules', '#regeln'),
        modes: mention(ctx, 'modes', '#spielmodi'),
        help: mention(ctx, 'help', '#hilfe'),
      }),
    },
  ];
  return {
    embeds: [
      {
        title: bt('de', 'welcomeTitle'),
        description: bt('de', 'welcomeText'),
        url: web(ctx.domain),
        color: EMERALD,
        fields: fields('de'),
        image: { url: web(ctx.domain, `/bilder/${WELCOME_PICTURE}`) },
      },
      {
        title: bt('en', 'welcomeTitle'),
        description: bt('en', 'welcomeText'),
        color: GOLD,
        fields: fields('en'),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export function rulesMessage(ctx: BoardContext): Body {
  const list = (rules: readonly string[]): string =>
    cut(rules.map((r, i) => `**${i + 1}.** ${r}`).join('\n'), DESCRIPTION_MAX);
  return {
    embeds: [
      {
        title: bt('de', 'rulesTitle'),
        description: list(ctx.rules.de),
        color: EMERALD,
        footer: { text: bt('de', 'rulesFooter') },
      },
      {
        title: bt('en', 'rulesTitle'),
        description: list(ctx.rules.en.length ? ctx.rules.en : ctx.rules.de),
        color: GOLD,
        footer: { text: bt('en', 'rulesFooter') },
      },
    ],
  };
}

export function helpMessage(ctx: BoardContext): Body {
  const s = ctx.status;
  return {
    embeds: [
      {
        title: bt('de', 'helpTitle'),
        description: `${bt('de', 'helpText')}\n\n*${bt('en', 'helpText')}*`,
        color: EMERALD,
        fields: [
          {
            name: bt('de', 'hilfeJoin'),
            value: bt('de', 'hilfeJoinText', { address: s.javaAddress, port: s.bedrockPort }),
          },
          { name: bt('de', 'hilfeLink'), value: bt('de', 'hilfeLinkText') },
        ],
      },
    ],
    components: [
      {
        type: ROW,
        components: [
          {
            type: BUTTON,
            style: STYLE_PRIMARY,
            label: bt('de', 'ticketButton'),
            custom_id: CUSTOM_IDS.ticketOpen,
            emoji: { name: '🎫' },
          },
          {
            type: BUTTON,
            style: STYLE_SECONDARY,
            label: bt('de', 'applyBoardTitle').replace('📝 ', ''),
            custom_id: CUSTOM_IDS.applyPick,
            emoji: { name: '📝' },
          },
          {
            type: BUTTON,
            style: STYLE_LINK,
            label: bt('de', 'helpWebButton'),
            url: web(ctx.domain, '/hilfe'),
          },
        ],
      },
    ],
  };
}

export function ticketsMessage(): Body {
  return {
    embeds: [
      {
        title: bt('de', 'ticketsTitle'),
        description: `${bt('de', 'ticketsText')}\n\n*${bt('en', 'ticketsText')}*`,
        color: GOLD,
      },
    ],
    components: [
      {
        type: ROW,
        components: [
          {
            type: BUTTON,
            style: STYLE_PRIMARY,
            label: bt('de', 'ticketButton'),
            custom_id: CUSTOM_IDS.ticketOpen,
            emoji: { name: '🎫' },
          },
        ],
      },
    ],
  };
}

/** Knopf-Beschriftung einer Stelle: Symbol und Name („⚔ Moderator“). */
export const positionLabel = (p: PositionView, lang: 'de' | 'en' = 'de'): string =>
  p.role.symbol ? `${p.role.symbol} ${p.role.name[lang]}` : p.role.name[lang];

export function applyMessage(ctx: BoardContext): Body {
  const open = ctx.positions.filter((p) => p.open);
  const fields = [
    ...open.map((p) => ({ name: positionLabel(p), value: cut(p.text.de, SHORT_TEXT) || '—' })),
    {
      name: bt('de', 'applyBoardMornicraft'),
      value: bt('de', ctx.mornicraftOpen ? 'applyBoardMornicraftOpen' : 'applyBoardMornicraftClosed'),
    },
  ];
  const buttons = [
    ...open.map((p) => ({
      type: BUTTON,
      style: STYLE_PRIMARY,
      label: positionLabel(p),
      custom_id: `${CUSTOM_IDS.applyTeam}${p.id}`,
    })),
    ...(ctx.mornicraftOpen
      ? [
          {
            type: BUTTON,
            style: STYLE_SECONDARY,
            label: bt('de', 'applyMornicraftShort'),
            custom_id: CUSTOM_IDS.applyMornicraft,
            emoji: { name: '⛏' },
          },
        ]
      : []),
    {
      type: BUTTON,
      style: STYLE_LINK,
      label: bt('de', 'welcomeWeb').replace('🌐 ', ''),
      url: web(ctx.domain, '/team/bewerben'),
    },
  ];
  const rows = Array.from({ length: Math.ceil(buttons.length / BUTTONS_PER_ROW) }, (_, i) => ({
    type: ROW,
    components: buttons.slice(i * BUTTONS_PER_ROW, (i + 1) * BUTTONS_PER_ROW),
  }));
  return {
    embeds: [
      {
        title: bt('de', 'applyBoardTitle'),
        description: [
          open.length
            ? bt('de', 'applyBoardText', { web: web(ctx.domain, '/team/bewerben') })
            : bt('de', 'applyBoardNone'),
          '',
          `*${open.length ? bt('en', 'applyBoardText', { web: web(ctx.domain, '/team/bewerben') }) : bt('en', 'applyBoardNone')}*`,
        ].join('\n'),
        color: GOLD,
        fields,
      },
    ],
    components: rows,
  };
}

/** Die Spielmodi als Embeds (höchstens 10 je Nachricht) – mit Figur, Farbe und Link zur Modus-Seite. */
export function modesMessages(ctx: BoardContext): Body[] {
  const embeds = ctx.modes.map((m) => ({
    title: m.name.de,
    url: web(ctx.domain, `/spielmodi/${m.id}`),
    description: cut(
      `${m.description.de}\n*${m.description.en}*\n\n[${bt('de', 'modeMore')} →](${web(ctx.domain, `/spielmodi/${m.id}`)})`,
    ),
    color: MODE_COLOURS[m.id] ? colourInt(MODE_COLOURS[m.id] ?? '') : EMERALD,
    thumbnail: { url: web(ctx.domain, `/bilder/figur-${m.id}.webp`) },
  }));
  const head = {
    title: bt('de', 'modesTitle'),
    description: `${bt('de', 'modesText', { status: mention(ctx, 'status', '#status') })}\n*${bt('en', 'modesText', { status: mention(ctx, 'status', '#status') })}*`,
    color: GOLD,
  };
  const all = [head, ...embeds];
  return Array.from({ length: Math.ceil(all.length / EMBEDS_PER_MESSAGE) }, (_, i) => ({
    embeds: all.slice(i * EMBEDS_PER_MESSAGE, (i + 1) * EMBEDS_PER_MESSAGE),
  }));
}

/** Die Status-Nachricht: wer gerade spielt, jeder Modus mit Zustand und Spielerzahl. */
export function statusMessage(s: NetworkStatus): Body {
  const head = s.online
    ? bt('de', 'statusOnline', { players: s.players, max: s.maxPlayers })
    : bt('de', 'statusOffline');
  const fields = s.modes
    .filter((m) => m.state !== 'off' || m.players > 0)
    .map((m) => {
      const state = bt('de', MODE_STATE[m.state]);
      const asleep = m.state === 'on' && !m.awake ? ` · ${bt('de', 'modeAsleep')}` : '';
      const players = m.state === 'on' ? ` · **${m.players}**/${m.maxPlayers}` : '';
      return {
        name: `${MODE_ICON[m.state]} ${m.name.de}`,
        value: `${state}${players}${asleep}`,
        inline: true,
      };
    });
  return {
    embeds: [
      {
        title: bt('de', 'statusTitle'),
        description: head,
        color: s.online ? EMERALD : GREY,
        fields,
        footer: { text: bt('de', 'statusFooter', { address: s.javaAddress, port: s.bedrockPort }) },
        timestamp: s.updatedAt,
      },
    ],
  };
}
