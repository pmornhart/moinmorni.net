/** Texte des Discord-Bots (Deutsch + Englisch, je nach Sprache der Person in Discord). */

export type BotLang = 'de' | 'en';

export const botLang = (locale: unknown): BotLang =>
  typeof locale === 'string' && locale.toLowerCase().startsWith('de') ? 'de' : 'en';

export const T = {
  helpTitle: { de: '❓ Hilfe & Support', en: '❓ Help & support' },
  helpText: {
    de: 'Frag hier einfach – das Team und die Community helfen gern. Für Privates (jemanden melden, dein Konto, eine Strafe) öffne ein Ticket: das sieht nur das Team.',
    en: 'Just ask here – the team and the community are happy to help. For private things (reporting someone, your account, a punishment) open a ticket: only the team sees it.',
  },
  helpWebButton: { de: 'Hilfe-Seite', en: 'Help page' },
  ticketsTitle: { de: '🎫 Tickets', en: '🎫 Tickets' },
  ticketsText: {
    de: 'Du hast eine Frage, ein Problem oder willst jemanden melden? Drück auf den Knopf: Es öffnet sich ein privater Kanal nur für dich und das Team.',
    en: 'A question, a problem or someone to report? Press the button: a private channel opens just for you and the team.',
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
  hilfeTitle: { de: 'So geht MoinMorni', en: 'How MoinMorni works' },
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
  statusTitle: { de: 'MoinMorni – gerade', en: 'MoinMorni – right now' },
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
  logVoiceMute: {
    de: '🎙️ **{name}** im Sprachchat stumm{until} von {by} – {reason}',
    en: '🎙️ **{name}** muted in voice chat{until} by {by} – {reason}',
  },
  logLiftVoiceMute: {
    de: '🔊 **{name}** darf im Sprachchat wieder sprechen ({by})',
    en: '🔊 **{name}** may speak in voice chat again ({by})',
  },
  logVoiceNoRight: {
    de: ' · Discord: Der Bot darf niemanden stummschalten (Recht „Mitglieder stummschalten“ fehlt) – gilt nur im Spiel.',
    en: ' · Discord: the bot may not mute members (“Mute Members” permission missing) – applies in game only.',
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
    de: '🔄 Update von MoinMorni gestartet ({by}) – das Panel ist gleich ein paar Minuten weg, die Minecraft-Server laufen weiter.',
    en: '🔄 MoinMorni update started ({by}) – the panel is gone for a few minutes, the Minecraft servers keep running.',
  },
  logUpdateDone: {
    de: '✅ MoinMorni ist aktualisiert: {from} → {to}',
    en: '✅ MoinMorni is updated: {from} → {to}',
  },
  logUpdateRolledBack: {
    de: '↩️ Das Update von MoinMorni hat nicht geklappt – alles läuft wieder in der alten Fassung {from}. Protokoll im Panel unter Updates.',
    en: '↩️ The MoinMorni update did not work – everything runs the old version {from} again. Log in the panel under Updates.',
  },
  logUpdateFailed: {
    de: '⚠️ Das Update von MoinMorni ist fehlgeschlagen. Protokoll im Panel unter Updates.',
    en: '⚠️ The MoinMorni update failed. Log in the panel under Updates.',
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
  // Klick auf den Befehl oder den Code kopiert ihn (Java); Bedrock zeigt den Text wie bisher.
  linkCodeGame: {
    de: "<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Dein Code: <click:copy_to_clipboard:'{code}'><hover:show_text:'<gray>Klicken: nur den Code kopieren'><white><bold>{code}</bold></white></hover></click> – schreib in unserem Discord <click:copy_to_clipboard:'/verbinden {code}'><hover:show_text:'<gray>Klicken: Befehl kopieren, dann in Discord einfügen'><yellow><u>/verbinden {code}</u></yellow></hover></click> (gilt 10 Minuten). <click:copy_to_clipboard:'/verbinden {code}'><hover:show_text:'<gray>Befehl kopieren'><green>[Kopieren]</green></hover></click>",
    en: "<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Your code: <click:copy_to_clipboard:'{code}'><hover:show_text:'<gray>Click: copy just the code'><white><bold>{code}</bold></white></hover></click> – type <click:copy_to_clipboard:'/verbinden {code}'><hover:show_text:'<gray>Click: copy the command, then paste it in Discord'><yellow><u>/verbinden {code}</u></yellow></hover></click> in our Discord (valid for 10 minutes). <click:copy_to_clipboard:'/verbinden {code}'><hover:show_text:'<gray>Copy the command'><green>[Copy]</green></hover></click>",
  },
  linkDoneGame: {
    de: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <green>Dein Discord-Konto <white>{name}</white> ist verbunden.',
    en: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <green>Your Discord account <white>{name}</white> is linked.',
  },
  // /discord im Spiel: Einladung zum Anklicken (öffnet den Link) und zum Kopieren, darunter der Code zum Verbinden.
  inviteGame: {
    de: "<dark_gray>[<blue>Discord</blue>]</dark_gray> <white><bold>MoinMorni auf Discord</bold></white> <gray>– News, Hilfe, Bewerbungen und Sprachkanäle.<newline><dark_gray>[<blue>Discord</blue>]</dark_gray> <click:open_url:'{invite}'><hover:show_text:'<gray>Klicken: Einladung öffnen<newline><white>{invite}'><aqua><bold>[ Discord beitreten ]</bold></aqua></hover></click> <click:copy_to_clipboard:'{invite}'><hover:show_text:'<gray>Klicken: Einladungs-Link kopieren'><gray>[Link kopieren]</gray></hover></click>",
    en: "<dark_gray>[<blue>Discord</blue>]</dark_gray> <white><bold>MoinMorni on Discord</bold></white> <gray>– news, help, applications and voice channels.<newline><dark_gray>[<blue>Discord</blue>]</dark_gray> <click:open_url:'{invite}'><hover:show_text:'<gray>Click: open the invite<newline><white>{invite}'><aqua><bold>[ Join Discord ]</bold></aqua></hover></click> <click:copy_to_clipboard:'{invite}'><hover:show_text:'<gray>Click: copy the invite link'><gray>[Copy link]</gray></hover></click>",
  },
  noBotGame: {
    de: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Unser Discord ist noch nicht eingerichtet.',
    en: '<dark_gray>[<blue>Discord</blue>]</dark_gray> <gray>Our Discord is not set up yet.',
  },
  // ---------- Begrüßung, Regeln, Spielmodi (Einrichtung) ----------
  welcomeTitle: { de: '👋 Servus auf MoinMorni!', en: '👋 Welcome to MoinMorni!' },
  welcomeText: {
    de: 'Unser Minecraft-Netzwerk mitten in den Alpen: ein Dorf als Lobby, Duels, Morni Party, Parkour und vieles mehr – für Java und Bedrock (Handy, Konsole, Windows).',
    en: 'Our Minecraft network in the middle of the Alps: a village as the lobby, Duels, Morni Party, parkour and much more – for Java and Bedrock (phone, console, Windows).',
  },
  welcomeJava: { de: '☕ Java', en: '☕ Java' },
  welcomeBedrock: { de: '📱 Bedrock', en: '📱 Bedrock' },
  welcomeBedrockValue: { de: '`{address}` · Port `{port}`', en: '`{address}` · port `{port}`' },
  welcomeWeb: { de: '🌐 Webseite', en: '🌐 Website' },
  welcomeLink: { de: '🔗 Konto verbinden', en: '🔗 Link your account' },
  welcomeLinkText: {
    de: 'Im Spiel `/discord` eingeben, dann hier `/verbinden <code>` – danach hast du deinen Rang auch hier. Schreiben und im Sprachkanal reden geht erst mit verbundenem Konto; vorher kannst du mitlesen und zuhören.',
    en: 'Type `/discord` in game, then `/verbinden <code>` here – your rank then shows here too. Writing and talking in voice channels only works with a linked account; until then you can read and listen.',
  },
  welcomeNext: { de: '🧭 So geht’s weiter', en: '🧭 Next steps' },
  welcomeNextText: {
    de: 'Lies die Regeln in {rules}, schau dir die Spielmodi in {modes} an und frag in {help}, wenn etwas klemmt.',
    en: 'Read the rules in {rules}, have a look at the game modes in {modes} and ask in {help} if something is stuck.',
  },
  rulesTitle: { de: '📜 Regeln', en: '📜 Rules' },
  rulesFooter: {
    de: 'Strafen gelten überall: im Spiel und hier im Discord.',
    en: 'Punishments apply everywhere: in game and here on Discord.',
  },
  modesTitle: { de: '🎮 Spielmodi', en: '🎮 Game modes' },
  modesText: {
    de: 'Alles, was du auf MoinMorni spielen kannst. Wer gerade spielt, steht in {status}.',
    en: 'Everything you can play on MoinMorni. Who is playing right now is shown in {status}.',
  },
  modeMore: { de: 'Mehr auf der Webseite', en: 'More on the website' },
  // ---------- Bewerbungen (Kanal mit Knöpfen) ----------
  applyBoardTitle: { de: '📝 Bewerbungen', en: '📝 Applications' },
  applyBoardText: {
    de: 'Du willst mithelfen? Wähl unten eine Stelle – das Formular kommt gleich hier in Discord. Lieber auf der Webseite: {web}',
    en: 'Want to help? Pick a position below – the form opens right here on Discord. Prefer the website: {web}',
  },
  applyBoardNone: {
    de: 'Gerade suchen wir niemanden fürs Team – schau bald wieder vorbei!',
    en: 'We are not looking for anyone for the team right now – check back soon!',
  },
  applyBoardMornicraft: { de: '⛏ MorniCraft', en: '⛏ MorniCraft' },
  applyBoardMornicraftOpen: {
    de: 'Unser Freunde-Survival – nur auf Einladung. Bewirb dich für die Whitelist.',
    en: 'Our friends’ survival – invitation only. Apply for the whitelist.',
  },
  applyBoardMornicraftClosed: {
    de: 'Gerade nehmen wir keine Bewerbungen für MorniCraft an.',
    en: 'We are not taking MorniCraft applications right now.',
  },
  applyMornicraftShort: { de: 'MorniCraft', en: 'MorniCraft' },
  // ---------- Team-Bewerbungen ----------
  pickTitle: { de: 'Wofür möchtest du dich bewerben?', en: 'What would you like to apply for?' },
  pickPlaceholder: { de: 'Stelle wählen', en: 'Choose a position' },
  pickNone: {
    de: 'Gerade ist nichts offen – schau bald wieder vorbei!',
    en: 'Nothing is open right now – check back soon!',
  },
  pickMornicraft: { de: 'Whitelist für unser Freunde-Survival', en: 'Whitelist for our friends’ survival' },
  pickTeam: { de: 'Stelle im Team', en: 'Position in the team' },
  teamClosed: {
    de: 'Die Stelle **{position}** ist gerade nicht offen.',
    en: 'The position **{position}** is not open right now.',
  },
  teamPending: {
    de: 'Deine Bewerbung liegt noch beim Team – du hörst bald von uns.',
    en: 'Your application is still with the team – you will hear from us soon.',
  },
  teamCooldown: {
    de: 'Nach einer Absage kannst du dich ab <t:{ts}:D> wieder bewerben.',
    en: 'After a rejection you can apply again from <t:{ts}:D>.',
  },
  teamNeedLink: {
    de: 'Verbinde zuerst dein Minecraft-Konto: im Spiel `/discord` eingeben, dann hier `/verbinden <code>`. Danach geht’s los.',
    en: 'Link your Minecraft account first: type `/discord` in game, then `/verbinden <code>` here. Then off you go.',
  },
  teamFormTitle: {
    de: 'Bewerbung: {position} ({step}/{steps})',
    en: 'Application: {position} ({step}/{steps})',
  },
  teamNext: { de: 'Weiter zu Teil {step}', en: 'On to part {step}' },
  teamPartDone: {
    de: 'Teil {done} von {steps} ist gespeichert. Weiter geht’s mit dem nächsten Teil:',
    en: 'Part {done} of {steps} is saved. Continue with the next part:',
  },
  teamExpired: {
    de: 'Das hat zu lange gedauert – fang bitte mit /bewerben neu an.',
    en: 'That took too long – please start again with /bewerben.',
  },
  teamThanks: {
    de: 'Danke! Deine Bewerbung als **{position}** ist beim Team. Du bekommst hier eine Nachricht, sobald entschieden ist.',
    en: 'Thank you! Your application as **{position}** is with the team. You will get a message here once it is decided.',
  },
  teamFailed: { de: 'Das hat nicht geklappt ({reason}).', en: 'That did not work ({reason}).' },
  intakeTitle: {
    de: '📥 Bewerbung #{id}: {name} als {position}',
    en: '📥 Application #{id}: {name} as {position}',
  },
  intakeVia: { de: 'Über', en: 'Via' },
  intakeWebsite: { de: 'Webseite', en: 'Website' },
  intakeAccept: { de: 'Annehmen', en: 'Accept' },
  intakeReject: { de: 'Ablehnen', en: 'Reject' },
  intakePanel: { de: 'Im Panel ansehen', en: 'View in the panel' },
  intakeAccepted: { de: '✅ Angenommen von {by}', en: '✅ Accepted by {by}' },
  intakeRejected: { de: '❌ Abgelehnt von {by}', en: '❌ Rejected by {by}' },
  intakeUnlinked: { de: 'nicht verbunden – Name selbst angegeben', en: 'not linked – name typed in' },
  decideAccept: { de: 'Annehmen: {name}', en: 'Accept: {name}' },
  decideReject: { de: 'Ablehnen: {name}', en: 'Reject: {name}' },
  decideMessage: { de: 'Nachricht an die Person (freiwillig)', en: 'Message to the person (optional)' },
  decideMessageHint: {
    de: 'Kommt per Direktnachricht – z. B. wie es weitergeht.',
    en: 'Sent as a direct message – e.g. what happens next.',
  },
  decideNoRight: {
    de: 'Annehmen oder ablehnen darf nur, wer diese Rolle auch vergeben darf – mit verbundenem Minecraft-Konto.',
    en: 'Only those who may give this role can accept or reject – with a linked Minecraft account.',
  },
  decideDone: { de: 'Erledigt: Bewerbung #{id} – {state}.', en: 'Done: application #{id} – {state}.' },
  stateAccepted: { de: 'angenommen', en: 'accepted' },
  stateRejected: { de: 'abgelehnt', en: 'rejected' },
  teamWelcome: {
    de: '🎉 Willkommen im Team, {name}! Du bist jetzt **{position}** auf MoinMorni – im Spiel und hier im Discord.{note}',
    en: '🎉 Welcome to the team, {name}! You are now **{position}** on MoinMorni – in game and here on Discord.{note}',
  },
  teamAccount: {
    de: 'Deine Zugangsdaten fürs Panel bekommst du vom Team persönlich.',
    en: 'You get your panel login from the team in person.',
  },
  teamNo: {
    de: 'Danke für deine Bewerbung als {position} bei MoinMorni. Diesmal hat es leider nicht gepasst.{note}{again}',
    en: 'Thank you for applying as {position} at MoinMorni. Unfortunately it was not a fit this time.{note}{again}',
  },
  teamAgain: {
    de: 'Ab <t:{ts}:D> kannst du dich wieder bewerben.',
    en: 'You can apply again from <t:{ts}:D>.',
  },
  teamWelcomeGame: {
    de: '<gold>🎉 Willkommen im Team!</gold> <gray>Deine Bewerbung wurde angenommen – du bist jetzt</gray> {rank}<gray>.</gray>',
    en: '<gold>🎉 Welcome to the team!</gold> <gray>Your application was accepted – you are now</gray> {rank}<gray>.</gray>',
  },
  commandApply: { de: 'Fürs Team oder für MorniCraft bewerben', en: 'Apply for the team or for MorniCraft' },
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
