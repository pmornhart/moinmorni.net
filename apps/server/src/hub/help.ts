import { networkCommand } from '@moinmorni/shared';
import type { Actor, Command } from './commands.js';
import type { HubContext } from './context.js';
import { mm, type Lang } from './texts.js';

/**
 * /hilfe (/help): Hilfe-Menü im Chat zum Anklicken – auf jedem Server, weil der Proxy den Befehl an den Hub reicht
 * (Paper und Velocity kommen mit ihrem eigenen /help nicht dran). Mit Thema nur dieser Teil: /hilfe modi.
 * Was die Zeilen nennen, gibt es wirklich (Test in test/help.test.ts gegen NETWORK_COMMANDS).
 */

const LOBBY = 'lobby';
type Text = Readonly<Record<Lang, string>>;

const HEAD =
  '<dark_gray><st>          </st></dark_gray> <gradient:#3ddc84:#1fa463><bold>MoinMorni</bold></gradient> <gray>·</gray> <gold>{title}</gold> <dark_gray><st>          </st></dark_gray>';

/** Anklickbarer Befehl: Klick führt ihn aus (`run`) oder schreibt ihn in die Zeile (`suggest`, braucht noch etwas). */
const cmd = (command: string, how: 'run' | 'suggest' = 'run'): string =>
  `<click:${how === 'run' ? 'run_command' : 'suggest_command'}:'${command}'><hover:show_text:'<gray>${command}'><yellow>${command}</yellow></hover></click>`;
const link = (url: string, label: string): string =>
  `<click:open_url:'${url}'><hover:show_text:'<gray>${url}'><aqua><u>${label}</u></aqua></hover></click>`;
const row = (left: string, right: string): string =>
  `<dark_gray>▸</dark_gray> ${left} <gray>– ${right}</gray>`;

/** Themen (deutsch/englisch geschrieben) → Teil des Menüs. */
const TOPICS: Readonly<Record<string, Topic>> = {
  modi: 'modes',
  modes: 'modes',
  spielmodi: 'modes',
  befehle: 'commands',
  commands: 'commands',
  regeln: 'rules',
  rules: 'rules',
  sprachchat: 'voice',
  voice: 'voice',
  freunde: 'friends',
  friends: 'friends',
  party: 'friends',
};
type Topic = 'modes' | 'commands' | 'rules' | 'voice' | 'friends';
const TOPIC_WORDS: Readonly<Record<Lang, readonly string[]>> = {
  de: ['modi', 'befehle', 'regeln', 'sprachchat', 'freunde'],
  en: ['modes', 'commands', 'rules', 'voice', 'friends'],
};

const t = (lang: Lang, x: Text): string => x[lang];

export function createHelpCommands(ctx: HubContext): Command[] {
  const site = (path: string): string => `https://${mm(ctx.domain)}${path}`;
  const say = (a: Actor, lines: readonly string[]): void => lines.forEach((l) => ctx.msg(a.uuid, l));
  const head = (lang: Lang, title: Text): string => HEAD.replace('{title}', t(lang, title));
  const inLobby = (a: Actor): boolean => ctx.presence.get(a.uuid)?.server === LOBBY;
  const commandsUrl = (a: Actor): string => site(`/befehle?spieler=${encodeURIComponent(a.name)}`);

  const tourRow = (a: Actor): string =>
    inLobby(a)
      ? row(
          cmd(a.lang === 'de' ? '/rundgang' : '/tour'),
          t(a.lang, { de: 'kurzer Rundgang durchs Dorf', en: 'a short tour of the village' }),
        )
      : row(
          cmd('/lobby'),
          t(a.lang, {
            de: 'zurück in die Lobby – dort gibt es den Rundgang',
            en: 'back to the lobby – the tour is there',
          }),
        );

  const parts: Readonly<Record<Topic, (a: Actor) => string[]>> = {
    modes: (a) => [
      head(a.lang, { de: 'Spielmodi', en: 'Game modes' }),
      `<gray>${t(a.lang, {
        de: 'In der Lobby ist jeder Marktstand ein Spielmodus – klick die Figur an. Oder nimm den Kompass in der Schnellleiste.',
        en: 'In the lobby every market stall is a game mode – click the figure. Or use the compass in your hotbar.',
      })}`,
      row(cmd('/lobby'), t(a.lang, { de: 'zur Lobby', en: 'to the lobby' })),
      row(
        cmd('/rueckkehr'),
        t(a.lang, {
          de: 'zurück ins laufende Spiel (nach einem Absturz)',
          en: 'back into your running game (after a crash)',
        }),
      ),
      row(
        link(site('/spielmodi'), t(a.lang, { de: 'Alle Spielmodi', en: 'All game modes' })),
        t(a.lang, { de: 'mit Regeln und Befehlen', en: 'with rules and commands' }),
      ),
    ],
    commands: (a) => [
      head(a.lang, { de: 'Befehle', en: 'Commands' }),
      row(
        cmd('/msg ', 'suggest'),
        t(a.lang, { de: 'private Nachricht, antworten mit /r', en: 'private message, reply with /r' }),
      ),
      row(
        cmd(a.lang === 'de' ? '/sprache' : '/language', 'suggest'),
        t(a.lang, { de: 'Sprache de/en', en: 'language de/en' }),
      ),
      row(
        cmd('/profil'),
        t(a.lang, { de: 'dein Profil auf der Webseite', en: 'your profile on the website' }),
      ),
      row(cmd('/streamer'), t(a.lang, { de: 'Streamer-Modus', en: 'streamer mode' })),
      row(
        cmd(a.lang === 'de' ? '/musik' : '/music', 'suggest'),
        t(a.lang, { de: 'Lobbymusik an/aus, leiser, lauter', en: 'lobby music on/off, quieter, louder' }),
      ),
      row(
        cmd(a.lang === 'de' ? '/paket' : '/pack'),
        t(a.lang, { de: 'Ressourcenpaket neu laden', en: 'reload the resource pack' }),
      ),
      row(
        link(commandsUrl(a), t(a.lang, { de: 'Alle Befehle', en: 'All commands' })),
        t(a.lang, { de: 'genau die, die du darfst', en: 'exactly the ones you may use' }),
      ),
    ],
    rules: (a) => [
      head(a.lang, { de: 'Regeln', en: 'Rules' }),
      `<gray>${t(a.lang, {
        de: 'Sei freundlich, kein Cheaten, keine Werbung. Strafen gelten im ganzen Netzwerk und im Discord.',
        en: 'Be friendly, no cheating, no advertising. Punishments apply across the network and in Discord.',
      })}`,
      row(
        link(site('/regeln'), t(a.lang, { de: 'Alle Regeln', en: 'All rules' })),
        t(a.lang, { de: 'auf der Webseite', en: 'on the website' }),
      ),
    ],
    voice: (a) => [
      head(a.lang, { de: 'Sprachchat', en: 'Voice chat' }),
      `<gray>${t(a.lang, {
        de: 'Mit dem Mod „Simple Voice Chat“ (Java) hörst du die anderen – auch über alle Server.',
        en: 'With the “Simple Voice Chat” mod (Java) you hear the others – across all servers too.',
      })}`,
      row(
        cmd(a.lang === 'de' ? '/sprachchat' : '/voice'),
        t(a.lang, { de: 'Kanäle, Gruppen und Party-Funk', en: 'channels, groups and party voice' }),
      ),
    ],
    friends: (a) => [
      head(a.lang, { de: 'Freunde & Party', en: 'Friends & party' }),
      row(
        cmd(a.lang === 'de' ? '/freunde' : '/friends'),
        t(a.lang, {
          de: 'Freundesliste, hinzufügen mit /freunde add',
          en: 'friends list, add with /friends add',
        }),
      ),
      row(
        cmd('/party'),
        t(a.lang, {
          de: 'gemeinsam in Spielmodi, Party-Chat mit /pc',
          en: 'play modes together, party chat with /pc',
        }),
      ),
    ],
  };

  const menu = (a: Actor): string[] => [
    head(a.lang, { de: 'Hilfe', en: 'Help' }),
    tourRow(a),
    row(
      cmd(a.lang === 'de' ? '/hilfe modi' : '/help modes'),
      t(a.lang, { de: 'Spielmodi und Kompass', en: 'game modes and compass' }),
    ),
    row(
      cmd(a.lang === 'de' ? '/hilfe befehle' : '/help commands'),
      t(a.lang, { de: 'wichtige Befehle', en: 'important commands' }),
    ),
    row(
      cmd(a.lang === 'de' ? '/hilfe freunde' : '/help friends'),
      t(a.lang, { de: 'Freunde und Party', en: 'friends and party' }),
    ),
    row(
      cmd(a.lang === 'de' ? '/hilfe sprachchat' : '/help voice'),
      t(a.lang, { de: 'Sprachchat', en: 'voice chat' }),
    ),
    row(cmd(a.lang === 'de' ? '/hilfe regeln' : '/help rules'), t(a.lang, { de: 'Regeln', en: 'rules' })),
    row(
      link(site('/hilfe'), t(a.lang, { de: 'Hilfe-Seite', en: 'Help page' })) +
        ' <dark_gray>·</dark_gray> ' +
        link(commandsUrl(a), t(a.lang, { de: 'Befehle', en: 'Commands' })),
      t(a.lang, { de: 'auf der Webseite', en: 'on the website' }),
    ),
    row(
      cmd('/discord'),
      t(a.lang, {
        de: 'Fragen ans Team? Im Discord ein Ticket öffnen',
        en: 'Questions for the team? Open a ticket in Discord',
      }),
    ),
  ];

  return [
    {
      ...networkCommand('hilfe'),
      run: (actor, args) => {
        const topic = args[0] ? TOPICS[args[0].toLowerCase()] : undefined;
        say(actor, topic ? parts[topic](actor) : menu(actor));
      },
      complete: (actor, args) =>
        args.length <= 1
          ? TOPIC_WORDS[actor.lang].filter((w) => w.startsWith((args[0] ?? '').toLowerCase()))
          : [],
    },
  ];
}
