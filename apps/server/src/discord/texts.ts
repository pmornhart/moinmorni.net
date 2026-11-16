/** Texte des Discord-Bots (Deutsch + Englisch, je nach Sprache der Person in Discord). */

export type BotLang = 'de' | 'en';

export const botLang = (locale: unknown): BotLang =>
  typeof locale === 'string' && locale.toLowerCase().startsWith('de') ? 'de' : 'en';

export const RULES_TEXT = [
  '## 📜 Regeln – im Spiel und hier',
  '1. **Freundlich bleiben.** Keine Beleidigungen, kein Mobbing, keine Hetze.',
  '2. **Kein Cheaten.** Keine Hacks, Fly-, X-Ray- oder Auto-Clicker-Mods.',
  '3. **Kein Spam, keine Werbung** für andere Server.',
  '4. **Keine Bugs ausnutzen** – melde sie uns, wir sagen Danke.',
  '5. **Höre auf das Team.** Bei Fragen: Ticket in 🎫・hilfe.',
  '',
  'Strafen gelten überall: im Spiel und hier im Discord.',
  '',
  '*English: be kind, no cheating, no spam or ads, report bugs, listen to the team. Punishments apply in game and here.*',
].join('\n');

export const T = {
  helpTitle: { de: '🎫 Hilfe & Support', en: '🎫 Help & support' },
  helpText: {
    de: 'Du hast eine Frage, ein Problem oder willst jemanden melden? Öffne ein Ticket – nur du und das Team sehen es.',
    en: 'A question, a problem or someone to report? Open a ticket – only you and the team can see it.',
  },
  ticketButton: { de: 'Ticket öffnen', en: 'Open a ticket' },
  ticketOpened: { de: 'Dein Ticket ist offen: {channel}', en: 'Your ticket is open: {channel}' },
  ticketHello: {
    de: 'Servus {user}! Schreib hier dein Anliegen – {team} meldet sich so schnell es geht.',
    en: 'Hi {user}! Describe what you need here – {team} will get back to you as soon as possible.',
  },
  ticketClose: { de: 'Ticket schließen', en: 'Close ticket' },
  ticketClosed: { de: 'Ticket geschlossen von {user}.', en: 'Ticket closed by {user}.' },
  welcome: {
    de: 'Servus {user}, schön dass du da bist! 👋\nSpielen: **{address}** (Java) · Bedrock: **{address}**, Port **{port}**\nVerbinde dein Minecraft-Konto: im Spiel `/discord` eingeben. Hilfe: `/hilfe`',
    en: 'Hi {user}, great to have you! 👋\nPlay: **{address}** (Java) · Bedrock: **{address}**, port **{port}**\nLink your Minecraft account: type `/discord` in game. Help: `/hilfe`',
  },
  hilfeTitle: { de: 'So geht morni.net', en: 'How morni.net works' },
  hilfeJoin: { de: 'Mitspielen', en: 'Join' },
  hilfeJoinText: {
    de: '**Java:** Mehrspieler → Server hinzufügen → `{address}`\n**Bedrock (Handy, Konsole, Windows):** `{address}`, Port `{port}`',
    en: '**Java:** Multiplayer → Add server → `{address}`\n**Bedrock (phone, console, Windows):** `{address}`, port `{port}`',
  },
  hilfeLink: { de: 'Konto verbinden', en: 'Link your account' },
  hilfeLinkText: {
    de: 'Im Spiel `/discord` eingeben, dann hier `/verbinden <code>`. Danach hast du deinen Rang auch in Discord.',
    en: 'Type `/discord` in game, then `/verbinden <code>` here. Your rank then shows in Discord too.',
  },
  hilfeHelp: { de: 'Fragen?', en: 'Questions?' },
  hilfeHelpText: {
    de: 'Öffne ein Ticket in {help} – oder schau auf {web}/hilfe.',
    en: 'Open a ticket in {help} – or have a look at {web}/hilfe.',
  },
  linkOk: {
    de: '✅ Verbunden mit **{name}**. Dein Rang gilt jetzt auch hier.',
    en: '✅ Linked to **{name}**. Your rank applies here too now.',
  },
  linkWrong: {
    de: 'Der Code stimmt nicht oder ist abgelaufen. Im Spiel `/discord` eingeben, dann den neuen Code hier nutzen.',
    en: 'That code is wrong or expired. Type `/discord` in game and use the new code here.',
  },
  statusTitle: { de: 'morni.net – gerade', en: 'morni.net – right now' },
  statusOnline: {
    de: '🟢 **{players}** von {max} Spielern online',
    en: '🟢 **{players}** of {max} players online',
  },
  statusOffline: { de: '🔴 Das Netzwerk ist gerade offline', en: '🔴 The network is offline right now' },
  statusFooter: {
    de: 'Java: {address} · Bedrock: {address}, Port {port}',
    en: 'Java: {address} · Bedrock: {address}, port {port}',
  },
  modeOn: { de: 'Offen', en: 'Open' },
  modeOff: { de: 'Geschlossen', en: 'Closed' },
  modeMaintenance: { de: 'Wartung', en: 'Maintenance' },
  modeSoon: { de: 'Bald', en: 'Soon' },
  modeAsleep: { de: 'schläft', en: 'asleep' },
  logBan: {
    de: '🔨 **{name}** gebannt{until} von {by} – {reason}',
    en: '🔨 **{name}** banned{until} by {by} – {reason}',
  },
  logMute: {
    de: '🔇 **{name}** stumm{until} von {by} – {reason}',
    en: '🔇 **{name}** muted{until} by {by} – {reason}',
  },
  logWarn: {
    de: '⚠️ **{name}** verwarnt von {by} – {reason}',
    en: '⚠️ **{name}** warned by {by} – {reason}',
  },
  logKick: {
    de: '👢 **{name}** rausgeworfen von {by} – {reason}',
    en: '👢 **{name}** kicked by {by} – {reason}',
  },
  logJail: {
    de: '⛓ **{name}** im Gefängnis{until} von {by} – {reason}',
    en: '⛓ **{name}** jailed{until} by {by} – {reason}',
  },
  logLiftJail: {
    de: '🔓 **{name}** aus dem Gefängnis ({by})',
    en: '🔓 **{name}** released from jail ({by})',
  },
  applyButton: { de: 'Für MorniCraft bewerben', en: 'Apply for MorniCraft' },
  applyClosed: {
    de: 'Gerade nehmen wir keine Bewerbungen für MorniCraft an – schau bald wieder vorbei!',
    en: 'We are not taking MorniCraft applications right now – check back soon!',
  },
  applyPending: {
    de: 'Deine Bewerbung als **{name}** liegt beim Team – du hörst bald von uns.',
    en: 'Your application as **{name}** is with the team – you will hear from us soon.',
  },
  applyTitle: { de: 'Bewerbung für MorniCraft', en: 'Application for MorniCraft' },
  applyName: { de: 'Dein Minecraft-Name', en: 'Your Minecraft name' },
  applyAbout: { de: 'Erzähl kurz von dir', en: 'Tell us a bit about you' },
  applyWhy: { de: 'Warum möchtest du mitspielen?', en: 'Why do you want to play with us?' },
  applyAge: { de: 'Alter (freiwillig)', en: 'Age (optional)' },
  applyThanks: {
    de: 'Danke! Deine Bewerbung als **{name}** ist beim Team. Du bekommst hier eine Nachricht, sobald entschieden ist.',
    en: 'Thank you! Your application as **{name}** is with the team. You will get a message here once it is decided.',
  },
  applyFailed: {
    de: 'Das hat nicht geklappt ({reason}). Prüf den Minecraft-Namen oder frag im Hilfe-Kanal.',
    en: 'That did not work ({reason}). Check the Minecraft name or ask in the help channel.',
  },
  applyNoRight: {
    de: 'Entscheiden darf nur das Team – mit verbundenem Minecraft-Konto (/verbinden).',
    en: 'Only the team may decide – with a linked Minecraft account (/verbinden).',
  },
  applyAccepted: { de: 'Bewerbung #{id} angenommen ✅', en: 'Application #{id} accepted ✅' },
  applyRejected: { de: 'Bewerbung #{id} abgelehnt.', en: 'Application #{id} rejected.' },
  applyWelcome: {
    de: '🎉 Willkommen bei MorniCraft, {name}! Du stehst jetzt auf der Liste – verbinde dich mit {domain} und klick in der Lobby auf die MorniCraft-Figur.',
    en: '🎉 Welcome to MorniCraft, {name}! You are on the list now – join {domain} and click the MorniCraft figure in the lobby.',
  },
  applyNo: {
    de: 'Danke für deine Bewerbung für MorniCraft. Diesmal hat es leider nicht gepasst.{note}',
    en: 'Thank you for applying to MorniCraft. Unfortunately it was not a fit this time.{note}',
  },
  logUpdateStarted: {
    de: '🔄 Update von morni.net gestartet ({by}) – das Panel ist gleich ein paar Minuten weg, die Minecraft-Server laufen weiter.',
    en: '🔄 morni.net update started ({by}) – the panel is gone for a few minutes, the Minecraft servers keep running.',
  },
  logUpdateDone: {
    de: '✅ morni.net ist aktualisiert: {from} → {to}',
    en: '✅ morni.net is updated: {from} → {to}',
  },
  logUpdateRolledBack: {
    de: '↩️ Das Update von morni.net hat nicht geklappt – alles läuft wieder in der alten Fassung {from}. Protokoll im Panel unter Updates.',
    en: '↩️ The morni.net update did not work – everything runs the old version {from} again. Log in the panel under Updates.',
  },
  logUpdateFailed: {
    de: '⚠️ Das Update von morni.net ist fehlgeschlagen. Protokoll im Panel unter Updates.',
    en: '⚠️ The morni.net update failed. Log in the panel under Updates.',
  },
  // Meldungen des Motors (Wächter, NetBird-Ausgang, Server) im Team-Log.
  alertSelf: { de: '**Behebt sich selbst?** {answer}', en: '**Fixes itself?** {answer}' },
  alertFixed: { de: '✅ Ja – ist schon behoben.', en: '✅ Yes – already fixed.' },
  alertFixing: { de: '🔄 Ja – wird gerade repariert.', en: '🔄 Yes – being repaired right now.' },
  alertAction: { de: '❌ Nein – bitte selbst etwas tun:', en: '❌ No – please do something:' },
  logLiftBan: { de: '✅ **{name}** entbannt von {by}', en: '✅ **{name}** unbanned by {by}' },
  logLiftMute: {
    de: '🔊 **{name}** darf wieder schreiben ({by})',
    en: '🔊 **{name}** may chat again ({by})',
  },
  until: { de: ' bis <t:{ts}:f>', en: ' until <t:{ts}:f>' },
  linkCodeGame: {
    de: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Dein Code: <white><bold>{code}</bold></white> – schreib in unserem Discord <yellow>/verbinden {code}</yellow> (gilt 10 Minuten).',
    en: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Your code: <white><bold>{code}</bold></white> – type <yellow>/verbinden {code}</yellow> in our Discord (valid for 10 minutes).',
  },
  linkDoneGame: {
    de: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <green>Dein Discord-Konto <white>{name}</white> ist verbunden.',
    en: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <green>Your Discord account <white>{name}</white> is linked.',
  },
  noBotGame: {
    de: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Unser Discord ist noch nicht eingerichtet.',
    en: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Our Discord is not set up yet.',
  },
} as const;

// Platzhalter: "{name}" → Wert.
// https://regex101.com/?flavor=javascript&regex=%5C%7B(%5Cw%2B)%5C%7D&flags=g&testString=%7Bname%7D
const PLACEHOLDER = /\{(\w+)\}/g;

export function bt(
  lang: BotLang,
  key: keyof typeof T,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  return T[key][lang].replace(PLACEHOLDER, (all, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : all,
  );
}
