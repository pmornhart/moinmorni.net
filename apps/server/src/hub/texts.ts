/**
 * Texte, die Spieler im Spiel sehen (MiniMessage). Platzhalter {name} werden ersetzt; Werte von Spielern werden
 * vorher entschärft (`mm`), damit niemand mit <red> oder <click:…> Unsinn treiben kann.
 */

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];

// Zeichen, die in MiniMessage etwas bedeuten: "<red>" → "\<red>", "a\b" → "a\\b".
// https://regex101.com/?flavor=javascript&regex=%5B%5C%5C%3C%5D&flags=g&testString=%3Cred%3E%5C
const MM_SPECIAL = /[\\<]/g;
// Platzhalter im Text: "{name}" → Wert von name.
// https://regex101.com/?flavor=javascript&regex=%5C%7B(%5Cw%2B)%5C%7D&flags=g&testString=Hallo%20%7Bname%7D
const PLACEHOLDER = /\{(\w+)\}/g;

/** Text eines Spielers sicher in MiniMessage einsetzen. */
export const mm = (text: string): string => text.replace(MM_SPECIAL, '\\$&');

const P = '<dark_gray>[<gradient:#3ddc84:#1fa463>MoinMorni</gradient>]</dark_gray> ';

const F = '<dark_gray>[<aqua>Freunde</aqua>]</dark_gray> ';
const FE = '<dark_gray>[<aqua>Friends</aqua>]</dark_gray> ';
const Y = '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> ';

const V = '<dark_gray>[<green>Sprachchat</green>]</dark_gray> ';
const VE = '<dark_gray>[<green>Voice</green>]</dark_gray> ';

const TEXTS = {
  'lang.set': {
    de: `${P}<gray>Deine Sprache ist jetzt <green>Deutsch</green>.`,
    en: `${P}<gray>Your language is now <green>English</green>.`,
  },
  'lang.usage': {
    de: `${P}<gray>So geht's: <yellow>/sprache de</yellow> oder <yellow>/sprache en</yellow>`,
    en: `${P}<gray>Usage: <yellow>/language de</yellow> or <yellow>/language en</yellow>`,
  },
  'cmd.unknown_player': {
    de: `${P}<red>Den Spieler <white>{name}</white> kennen wir nicht.`,
    en: `${P}<red>We don't know a player called <white>{name}</white>.`,
  },
  'cmd.offline': {
    de: `${P}<red><white>{name}</white> ist gerade nicht online.`,
    en: `${P}<red><white>{name}</white> is not online right now.`,
  },
  'cmd.no_right': {
    de: `${P}<red>Das darfst du leider nicht.`,
    en: `${P}<red>Sorry, you're not allowed to do that.`,
  },
  'cmd.higher': {
    de: `${P}<red>Bei <white>{name}</white> geht das nicht – gleicher oder höherer Rang.`,
    en: `${P}<red>You can't do that to <white>{name}</white> – same or higher rank.`,
  },
  'cmd.self': {
    de: `${P}<red>Das geht nicht bei dir selbst.`,
    en: `${P}<red>You can't do that to yourself.`,
  },
  // Strafen nur nach unten: {rank} = Rang der Person (in Rangfarbe), {who} = wer es darf.
  'punish.protected_one': {
    de: `${P}<red><white>{name}</white> ist {rank} – das darf nur der {who}.`,
    en: `${P}<red><white>{name}</white> is {rank} – only the {who} may do that.`,
  },
  'punish.protected_many': {
    de: `${P}<red><white>{name}</white> ist {rank} – das dürfen nur {who}.`,
    en: `${P}<red><white>{name}</white> is {rank} – only {who} may do that.`,
  },
  'punish.protected_nobody': {
    de: `${P}<red><white>{name}</white> ist {rank} – diesen Rang darf niemand bestrafen.`,
    en: `${P}<red><white>{name}</white> is {rank} – nobody may punish this rank.`,
  },
  'punish.and': {
    de: ' und ',
    en: ' and ',
  },
  'cmd.duration': {
    de: `${P}<red>Dauer verstehe ich nicht: <white>{value}</white>. Beispiele: <yellow>30m</yellow>, <yellow>2h</yellow>, <yellow>7d</yellow>, <yellow>perm</yellow>`,
    en: `${P}<red>I don't understand the duration <white>{value}</white>. Examples: <yellow>30m</yellow>, <yellow>2h</yellow>, <yellow>7d</yellow>, <yellow>perm</yellow>`,
  },
  'cmd.usage': {
    de: `${P}<gray>So geht's: <yellow>{usage}</yellow>`,
    en: `${P}<gray>Usage: <yellow>{usage}</yellow>`,
  },
  'msg.to': {
    de: '<dark_gray>[<light_purple>du → {name}</light_purple>]</dark_gray> <gray>{text}',
    en: '<dark_gray>[<light_purple>you → {name}</light_purple>]</dark_gray> <gray>{text}',
  },
  'msg.from': {
    de: '<dark_gray>[<light_purple>{name} → dich</light_purple>]</dark_gray> <gray>{text}',
    en: '<dark_gray>[<light_purple>{name} → you</light_purple>]</dark_gray> <gray>{text}',
  },
  'msg.nobody': {
    de: `${P}<gray>Dir hat noch niemand geschrieben.`,
    en: `${P}<gray>Nobody has written to you yet.`,
  },
  'msg.muted': {
    de: `${P}<red>Du bist stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>You are muted{until}. Reason: <white>{reason}`,
  },
  'chat.slow': {
    de: `${P}<gray>Langsam! Du kannst in {seconds} s wieder schreiben.`,
    en: `${P}<gray>Slow down! You can write again in {seconds} s.`,
  },
  'chat.link': { de: `${P}<gray>Links sind im Chat aus.`, en: `${P}<gray>Links are turned off in chat.` },
  'punish.until': { de: ' bis {date}', en: ' until {date}' },
  'punish.forever': { de: ' für immer', en: ' forever' },
  'punish.no_reason': { de: 'kein Grund angegeben', en: 'no reason given' },
  'ban.screen': {
    de: '<red><bold>Du bist gebannt</bold></red>\n\n<gray>Grund: <white>{reason}</white>\n<gray>Dauer:<white>{until}</white>\n\n<dark_gray>Fehler? Melde dich im Discord.',
    en: '<red><bold>You are banned</bold></red>\n\n<gray>Reason: <white>{reason}</white>\n<gray>Duration:<white>{until}</white>\n\n<dark_gray>A mistake? Contact us on Discord.',
  },
  'kick.screen': {
    de: '<red><bold>Vom Team rausgeworfen</bold></red>\n\n<gray>Grund: <white>{reason}',
    en: '<red><bold>Kicked by the team</bold></red>\n\n<gray>Reason: <white>{reason}',
  },
  'maintenance.screen': {
    de: '<gold><bold>Wartung</bold></gold>\n\n<gray>{message}{until}',
    en: '<gold><bold>Maintenance</bold></gold>\n\n<gray>{message}{until}',
  },
  'wartung.until': {
    de: ' <gray>(bis ca. <white>{time}</white> Uhr)</gray>',
    en: ' <gray>(until approx. <white>{time}</white>)</gray>',
  },
  'wartung.bye': {
    de: '<gold><bold>Die Lobby startet gerade neu</bold></gold>\n\n<gray>Gleich ist sie wieder da – versuch es in ein paar Sekunden nochmal.',
    en: '<gold><bold>The lobby is restarting</bold></gold>\n\n<gray>It’ll be back in a moment – try again in a few seconds.',
  },
  'wartung.moving': {
    de: `${P}<gold>Die Wartung beginnt</gold> <gray>– du wartest in der Wartungs-Lobby, bis wir fertig sind{until}.`,
    en: `${P}<gold>Maintenance is starting</gold> <gray>– you’ll wait in the maintenance lobby until we’re done{until}.`,
  },
  'wartung.held': {
    de: `${P}<gold>Wartung läuft</gold> <gray>– bis wir fertig sind, wartest du in der Wartungs-Lobby{until}. Danach geht’s automatisch weiter.`,
    en: `${P}<gold>Maintenance in progress</gold> <gray>– until we’re done you’ll wait in the maintenance lobby{until}. Afterwards you’ll go on automatically.`,
  },
  'wartung.back': {
    de: `${P}<green>Die Lobby ist wieder da!</green> <gray>Ab zurück …`,
    en: `${P}<green>The lobby is back!</green> <gray>Off you go …`,
  },
  'wartung.back_manual': {
    de: `${P}<green>Die Lobby ist wieder da!</green> <gray>Mit <yellow>/lobby</yellow> kommst du zurück.`,
    en: `${P}<green>The lobby is back!</green> <gray>Use <yellow>/lobby</yellow> to go back.`,
  },
  'full.screen': {
    de: '<gold><bold>Das Netzwerk ist voll</bold></gold>\n\n<gray>Probier es gleich nochmal.',
    en: '<gold><bold>The network is full</bold></gold>\n\n<gray>Please try again in a moment.',
  },
  'team.ban': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> gebannt{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>banned <white>{name}</white>{until}. Reason: <white>{reason}`,
  },
  'team.unban': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> entbannt.`,
    en: `${P}<green>{actor}</green> <gray>unbanned <white>{name}</white>.`,
  },
  'team.mute': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>muted <white>{name}</white>{until}. Reason: <white>{reason}`,
  },
  'team.unmute': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> wieder freigegeben.`,
    en: `${P}<green>{actor}</green> <gray>unmuted <white>{name}</white>.`,
  },
  'team.kick': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> rausgeworfen. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>kicked <white>{name}</white>. Reason: <white>{reason}`,
  },
  'team.warn': {
    de: `${P}<gold>{actor}</gold> <gray>hat <white>{name}</white> verwarnt. Grund: <white>{reason}`,
    en: `${P}<gold>{actor}</gold> <gray>warned <white>{name}</white>. Reason: <white>{reason}`,
  },
  'punish.not_banned': {
    de: `${P}<gray><white>{name}</white> ist nicht gebannt.`,
    en: `${P}<gray><white>{name}</white> is not banned.`,
  },
  'punish.not_muted': {
    de: `${P}<gray><white>{name}</white> ist nicht stummgeschaltet.`,
    en: `${P}<gray><white>{name}</white> is not muted.`,
  },
  'warn.you': {
    de: `${P}<gold><bold>Verwarnung</bold></gold> <gray>vom Team: <white>{reason}`,
    en: `${P}<gold><bold>Warning</bold></gold> <gray>from the team: <white>{reason}`,
  },
  'mute.you': {
    de: `${P}<red>Du wurdest stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>You were muted{until}. Reason: <white>{reason}`,
  },
  'unmute.you': { de: `${P}<green>Du kannst wieder schreiben.`, en: `${P}<green>You can chat again.` },
  'jail.you': {
    de: `${P}<red>Du kommst ins Gefängnis{until}. Grund: <white>{reason}</white>. <gray>Schreiben kannst du nur ans Team.`,
    en: `${P}<red>You are going to jail{until}. Reason: <white>{reason}</white>. <gray>You can only write to the team.`,
  },
  'unjail.you': {
    de: `${P}<green>Du bist wieder frei – willkommen zurück!`,
    en: `${P}<green>You are free again – welcome back!`,
  },
  'jail.blocked': {
    de: `${P}<red>Du sitzt im Gefängnis{until} und kannst die Lobby nicht verlassen.`,
    en: `${P}<red>You are in jail{until} and cannot leave the lobby.`,
  },
  'jail.msg_team_only': {
    de: `${P}<red>Aus dem Gefängnis kannst du nur dem Team schreiben.`,
    en: `${P}<red>From jail you can only write to the team.`,
  },
  'jail.chat': {
    de: '<dark_gray>[</dark_gray><gray>⛓ Gefängnis</gray><dark_gray>]</dark_gray> <gray>{name}</gray> <dark_gray>»</dark_gray> <white>{text}',
    en: '<dark_gray>[</dark_gray><gray>⛓ Jail</gray><dark_gray>]</dark_gray> <gray>{name}</gray> <dark_gray>»</dark_gray> <white>{text}',
  },
  'punish.not_jailed': {
    de: `${P}<gray><white>{name}</white> sitzt nicht im Gefängnis.`,
    en: `${P}<gray><white>{name}</white> is not in jail.`,
  },
  'team.jail': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> ins Gefängnis gesteckt{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>jailed <white>{name}</white>{until}. Reason: <white>{reason}`,
  },
  'team.unjail': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> aus dem Gefängnis gelassen.`,
    en: `${P}<green>{actor}</green> <gray>released <white>{name}</white> from jail.`,
  },
  'history.head': {
    de: `${P}<gray>Strafen von <white>{name}</white>:`,
    en: `${P}<gray>Punishments of <white>{name}</white>:`,
  },
  'history.none': {
    de: `${P}<gray><white>{name}</white> hat eine weiße Weste.`,
    en: `${P}<gray><white>{name}</white> has a clean record.`,
  },
  'history.line': {
    de: '<dark_gray> • </dark_gray><gray>{date} <white>{kind}</white>{until} – {reason} <dark_gray>({by}){state}',
    en: '<dark_gray> • </dark_gray><gray>{date} <white>{kind}</white>{until} – {reason} <dark_gray>({by}){state}',
  },
  'history.revoked': { de: ', aufgehoben', en: ', lifted' },
  'rank.set': {
    de: `${P}<white>{name}</white> <gray>hat jetzt den Rang {rank}<gray>.`,
    en: `${P}<white>{name}</white> <gray>now has the rank {rank}<gray>.`,
  },
  'rank.removed': {
    de: `${P}<white>{name}</white> <gray>hat keinen eigenen Rang mehr.`,
    en: `${P}<white>{name}</white> <gray>no longer has a rank of their own.`,
  },
  'rank.unknown': {
    de: `${P}<red>Diesen Rang gibt es nicht: <white>{rank}`,
    en: `${P}<red>There is no rank called <white>{rank}`,
  },
  'rank.too_high': {
    de: `${P}<red>Diesen Rang darfst du nicht vergeben.`,
    en: `${P}<red>You may not give this rank.`,
  },
  'lobby.going': { de: `${P}<gray>Ab in die Lobby!`, en: `${P}<gray>Off to the lobby!` },
  // Mitten im Spiel (rejoin.ts): erst nachfragen, „Zurück ins Spiel“ anbieten. Bedrock kann im Chat nicht klicken.
  'lobby.ask': {
    de: `${P}<gold>Du bist mitten in <white>{mode}</white>.</gold> <gray>Wirklich zur Lobby?</gray> <click:run_command:'/lobby ja'><hover:show_text:'<gold>Runde verlassen und zur Lobby'><gold><bold>[Ja, zur Lobby]</bold></gold></hover></click> <click:run_command:'/lobby nein'><hover:show_text:'<green>Hierbleiben und weiterspielen'><green><bold>[Weiterspielen]</bold></green></hover></click> <dark_gray>·</dark_gray> <gray>Nochmal <yellow>/lobby</yellow> geht auch.`,
    en: `${P}<gold>You're in the middle of <white>{mode}</white>.</gold> <gray>Really go to the lobby?</gray> <click:run_command:'/lobby yes'><hover:show_text:'<gold>Leave the round and go to the lobby'><gold><bold>[Yes, to the lobby]</bold></gold></hover></click> <click:run_command:'/lobby no'><hover:show_text:'<green>Stay and keep playing'><green><bold>[Keep playing]</bold></green></hover></click> <dark_gray>·</dark_gray> <gray>Typing <yellow>/lobby</yellow> again works too.`,
  },
  'lobby.ask_bedrock': {
    de: `${P}<gold>Du bist mitten in <white>{mode}</white>.</gold> <gray>Wirklich zur Lobby? Wähl im Fenster – oder gib gleich nochmal <yellow>/lobby</yellow> ein.`,
    en: `${P}<gold>You're in the middle of <white>{mode}</white>.</gold> <gray>Really go to the lobby? Choose in the window – or type <yellow>/lobby</yellow> again right away.`,
  },
  'lobby.stay': {
    de: `${P}<green>Alles klar – viel Spaß beim Weiterspielen!`,
    en: `${P}<green>Alright – have fun playing on!`,
  },
  'rejoin.offer': {
    de: `${P}<gold>Du warst mitten in <white>{mode}</white> – dein Platz ist noch frei.</gold> <click:run_command:'/rueckkehr'><hover:show_text:'<green>Zurück in deine Runde'><green><bold>[Zurück ins Spiel]</bold></green></hover></click>`,
    en: `${P}<gold>You were in the middle of <white>{mode}</white> – your spot is still free.</gold> <click:run_command:'/rejoin'><hover:show_text:'<green>Back to your round'><green><bold>[Back to the game]</bold></green></hover></click>`,
  },
  'rejoin.offer_bedrock': {
    de: `${P}<gold>Du warst mitten in <white>{mode}</white> – dein Platz ist noch frei.</gold> <gray>Zurück ins Spiel: Gegenstand in der Mitte deiner Leiste benutzen oder <yellow>/rueckkehr</yellow> eingeben.`,
    en: `${P}<gold>You were in the middle of <white>{mode}</white> – your spot is still free.</gold> <gray>Back to the game: use the item in the middle of your hotbar or type <yellow>/rejoin</yellow>.`,
  },
  'rejoin.going': {
    de: `${P}<gray>Zurück nach <white>{mode}</white> …`,
    en: `${P}<gray>Back to <white>{mode}</white> …`,
  },
  'rejoin.none': {
    de: `${P}<gray>Gerade wartet keine Runde auf dich.`,
    en: `${P}<gray>No round is waiting for you right now.`,
  },
  'rejoin.expired': {
    de: `${P}<gray>Die Zeit ist um – in <white>{mode}</white> ist dein Platz nicht mehr frei.`,
    en: `${P}<gray>Time's up – your spot in <white>{mode}</white> isn't held any more.`,
  },
  'rejoin.ended': {
    de: `${P}<gray>Deine Runde in <white>{mode}</white> ist inzwischen vorbei.`,
    en: `${P}<gray>Your round in <white>{mode}</white> is over by now.`,
  },
  'rejoin.gone': {
    de: `${P}<gray><white>{mode}</white> ist gerade nicht erreichbar – deine Runde gibt es leider nicht mehr.`,
    en: `${P}<gray><white>{mode}</white> can't be reached right now – your round is gone, sorry.`,
  },
  'set.saved': {
    de: `${P}<green>Gespeichert:</green> <gray>{label} <dark_gray>→</dark_gray> <white>{value}`,
    en: `${P}<green>Saved:</green> <gray>{label} <dark_gray>→</dark_gray> <white>{value}`,
  },
  'set.current': {
    de: `${P}<gray>{label}: <white>{value}</white> <dark_gray>·</dark_gray> ändern: <yellow>{usage}`,
    en: `${P}<gray>{label}: <white>{value}</white> <dark_gray>·</dark_gray> change: <yellow>{usage}`,
  },
  'set.invalid': {
    de: `${P}<red>Das passt nicht für „{label}“.</red> <gray>So geht's: <yellow>{usage}`,
    en: `${P}<red>That doesn't fit "{label}".</red> <gray>Usage: <yellow>{usage}`,
  },
  'set.head': {
    de: `${P}<gray>Einstellungen – alles auch im Panel unter <white>{area}</white>:`,
    en: `${P}<gray>Settings – everything is in the panel too, under <white>{area}</white>:`,
  },
  'set.line': {
    de: '<dark_gray> • </dark_gray><yellow>{usage}</yellow> <dark_gray>–</dark_gray> <gray>{label}: <white>{value}',
    en: '<dark_gray> • </dark_gray><yellow>{usage}</yellow> <dark_gray>–</dark_gray> <gray>{label}: <white>{value}',
  },
  'set.on': { de: 'an', en: 'on' },
  'set.off': { de: 'aus', en: 'off' },
  'set.empty': { de: '(leer)', en: '(empty)' },
  'friend.request_sent': {
    de: `${F}<gray>Anfrage an <white>{name}</white> ist raus.`,
    en: `${FE}<gray>Request sent to <white>{name}</white>.`,
  },
  'friend.request_got': {
    de: `${F}<white>{name}</white> <gray>möchte mit dir befreundet sein.</gray> <click:run_command:'/freunde annehmen {name}'><hover:show_text:'<green>Annehmen'><green><bold>[Annehmen]</bold></green></hover></click> <click:run_command:'/freunde ablehnen {name}'><hover:show_text:'<red>Ablehnen'><red>[Ablehnen]</red></hover></click>`,
    en: `${FE}<white>{name}</white> <gray>wants to be your friend.</gray> <click:run_command:'/friends accept {name}'><hover:show_text:'<green>Accept'><green><bold>[Accept]</bold></green></hover></click> <click:run_command:'/friends deny {name}'><hover:show_text:'<red>Deny'><red>[Deny]</red></hover></click>`,
  },
  'friend.now': {
    de: `${F}<green>Du und <white>{name}</white> seid jetzt Freunde!`,
    en: `${FE}<green>You and <white>{name}</white> are friends now!`,
  },
  'friend.denied': {
    de: `${F}<gray>Anfrage von <white>{name}</white> abgelehnt.`,
    en: `${FE}<gray>Request from <white>{name}</white> denied.`,
  },
  'friend.removed': {
    de: `${F}<gray><white>{name}</white> ist nicht mehr in deiner Freundesliste.`,
    en: `${FE}<gray><white>{name}</white> is no longer on your friends list.`,
  },
  'friend.already': { de: `${F}<gray>Ihr seid schon befreundet.`, en: `${FE}<gray>You are already friends.` },
  'friend.pending': {
    de: `${F}<gray>Die Anfrage an <white>{name}</white> läuft schon.`,
    en: `${FE}<gray>Your request to <white>{name}</white> is still open.`,
  },
  'friend.no_request': {
    de: `${F}<gray>Von <white>{name}</white> gibt es keine Anfrage.`,
    en: `${FE}<gray>There is no request from <white>{name}</white>.`,
  },
  'friend.not_friends': {
    de: `${F}<gray>Du bist nicht mit <white>{name}</white> befreundet.`,
    en: `${FE}<gray>You are not friends with <white>{name}</white>.`,
  },
  'friend.full': {
    de: `${F}<red>Die Freundesliste ist voll ({max}).`,
    en: `${FE}<red>The friends list is full ({max}).`,
  },
  'friend.head': {
    de: `${F}<gray>Deine Freunde ({online} online, {total} insgesamt):`,
    en: `${FE}<gray>Your friends ({online} online, {total} in total):`,
  },
  'friend.none': {
    de: `${F}<gray>Noch keine Freunde. So geht's: <yellow>/freunde add <name>`,
    en: `${FE}<gray>No friends yet. Try <yellow>/friends add <name>`,
  },
  'friend.line_online': {
    de: '<dark_gray> • </dark_gray><green>●</green> <white>{name}</white> <gray>auf {server}',
    en: '<dark_gray> • </dark_gray><green>●</green> <white>{name}</white> <gray>on {server}',
  },
  'friend.line_offline': {
    de: '<dark_gray> • ● <gray>{name}</gray> <dark_gray>zuletzt {date}',
    en: '<dark_gray> • ● <gray>{name}</gray> <dark_gray>last seen {date}',
  },
  'friend.requests': {
    de: `${F}<gray>Offene Anfragen: <white>{names}`,
    en: `${FE}<gray>Open requests: <white>{names}`,
  },
  'friend.joined': {
    de: `${F}<white>{name}</white> <green>ist jetzt online.`,
    en: `${FE}<white>{name}</white> <green>is online now.`,
  },
  'friend.left': {
    de: `${F}<white>{name}</white> <gray>ist offline gegangen.`,
    en: `${FE}<white>{name}</white> <gray>went offline.`,
  },
  'party.invited': {
    de: `${Y}<gray>Einladung an <white>{name}</white> ist raus.`,
    en: `${Y}<gray>Invitation sent to <white>{name}</white>.`,
  },
  'party.invite_got': {
    de: `${Y}<white>{name}</white> <gray>lädt dich in die Party ein.</gray> <click:run_command:'/party annehmen {name}'><hover:show_text:'<green>Beitreten'><green><bold>[Beitreten]</bold></green></hover></click>`,
    en: `${Y}<white>{name}</white> <gray>invites you to their party.</gray> <click:run_command:'/party accept {name}'><hover:show_text:'<green>Join'><green><bold>[Join]</bold></green></hover></click>`,
  },
  'party.joined': {
    de: `${Y}<white>{name}</white> <green>ist der Party beigetreten.`,
    en: `${Y}<white>{name}</white> <green>joined the party.`,
  },
  'party.left': {
    de: `${Y}<white>{name}</white> <gray>hat die Party verlassen.`,
    en: `${Y}<white>{name}</white> <gray>left the party.`,
  },
  'party.kicked': {
    de: `${Y}<white>{name}</white> <gray>wurde aus der Party genommen.`,
    en: `${Y}<white>{name}</white> <gray>was removed from the party.`,
  },
  'party.leader': {
    de: `${Y}<white>{name}</white> <gray>leitet jetzt die Party.`,
    en: `${Y}<white>{name}</white> <gray>leads the party now.`,
  },
  'party.disbanded': { de: `${Y}<gray>Die Party wurde aufgelöst.`, en: `${Y}<gray>The party was disbanded.` },
  'party.none': {
    de: `${Y}<gray>Du bist in keiner Party. So geht's: <yellow>/party einladen <name>`,
    en: `${Y}<gray>You are not in a party. Try <yellow>/party invite <name>`,
  },
  'party.not_leader': {
    de: `${Y}<red>Das darf nur der Party-Leiter.`,
    en: `${Y}<red>Only the party leader can do that.`,
  },
  'party.full': { de: `${Y}<red>Die Party ist voll ({max}).`, en: `${Y}<red>The party is full ({max}).` },
  'party.in_other': {
    de: `${Y}<gray><white>{name}</white> ist schon in einer Party.`,
    en: `${Y}<gray><white>{name}</white> is already in a party.`,
  },
  'party.no_invite': {
    de: `${Y}<gray>Von <white>{name}</white> gibt es keine Einladung (gilt 5 Minuten).`,
    en: `${Y}<gray>There is no invitation from <white>{name}</white> (valid for 5 minutes).`,
  },
  'party.head': { de: `${Y}<gray>Deine Party ({count}/{max}):`, en: `${Y}<gray>Your party ({count}/{max}):` },
  'party.line': {
    de: '<dark_gray> • </dark_gray>{lead}<white>{name}</white> <gray>{where}',
    en: '<dark_gray> • </dark_gray>{lead}<white>{name}</white> <gray>{where}',
  },
  'party.lead_mark': { de: '<gold>♚</gold> ', en: '<gold>♚</gold> ' },
  'party.offline': { de: '(offline)', en: '(offline)' },
  'party.follow': {
    de: `${Y}<gray>Die Party geht nach <white>{server}</white> – du kommst mit.`,
    en: `${Y}<gray>The party is heading to <white>{server}</white> – you're coming along.`,
  },
  'party.chat': {
    de: '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> <white>{name}</white> <dark_gray>»</dark_gray> <light_purple>{text}',
    en: '<dark_gray>[<light_purple>Party</light_purple>]</dark_gray> <white>{name}</white> <dark_gray>»</dark_gray> <light_purple>{text}',
  },
  'mode.waking': {
    de: `${P}<white>{mode}</white> <gray>wacht gerade auf – du wirst gleich automatisch verbunden (etwa eine halbe Minute).`,
    en: `${P}<white>{mode}</white> <gray>is waking up – you'll be connected automatically in a moment (about half a minute).`,
  },
  'mode.ready': {
    de: `${P}<green><white>{mode}</white> ist wach – ab geht's!`,
    en: `${P}<green><white>{mode}</white> is awake – off you go!`,
  },
  'mode.wake_failed': {
    de: `${P}<red><white>{mode}</white> ist leider nicht aufgewacht. Probier es gleich nochmal – das Team weiß Bescheid.`,
    en: `${P}<red><white>{mode}</white> didn't wake up. Please try again in a moment – the team has been told.`,
  },
  'mode.closed': {
    de: `${P}<gray><white>{mode}</white> ist gerade geschlossen.`,
    en: `${P}<gray><white>{mode}</white> is closed right now.`,
  },
  'mode.closed_team': {
    de: `${P}<gold><white>{mode}</white> ist für Spieler geschlossen – du kommst als Team trotzdem rein. Öffnen: Panel → Modi.`,
    en: `${P}<gold><white>{mode}</white> is closed to players – as team you get in anyway. To open it: panel → modes.`,
  },
  'mode.soon': {
    de: `${P}<gray><white>{mode}</white> kommt bald – wir bauen noch daran.`,
    en: `${P}<gray><white>{mode}</white> is coming soon – we're still building it.`,
  },
  'mode.pause': {
    de: `${P}<yellow>☀ <white>{mode}</white> hat gerade Sommerpause – Wettkämpfe gibt es erst wieder im Winter. Schau dich trotzdem im Dorf um!`,
    en: `${P}<yellow>☀ <white>{mode}</white> is on its summer break – competitions start again in winter. Have a look around the village anyway!`,
  },
  'mode.joining': {
    de: `${P}<gray>Ab nach <white>{mode}</white> …`,
    en: `${P}<gray>Off to <white>{mode}</white> …`,
  },
  'mode.already': {
    de: `${P}<gray>Du bist schon in <white>{mode}</white>.`,
    en: `${P}<gray>You're already in <white>{mode}</white>.`,
  },
  'mode.invite_only': {
    de: `${P}<light_purple><white>{mode}</white> ist nur auf Einladung.</light_purple> <gray>Stehst du auf der Liste, geht's gleich los – sonst kannst du dich auf der Webseite oder im Discord bewerben.`,
    en: `${P}<light_purple><white>{mode}</white> is invitation only.</light_purple> <gray>If you're on the list, you'll be in right away – otherwise apply on the website or in Discord.`,
  },
  'mode.not_listed': {
    de: `${P}<light_purple><white>{mode}</white> ist nur auf Einladung – du stehst (noch) nicht auf der Liste.</light_purple> <gray>Bewirb dich: <click:open_url:'{url}'><aqua><u>{url}</u></aqua></click> oder im Discord mit <white>/bewerben</white>.`,
    en: `${P}<light_purple><white>{mode}</white> is invitation only – you are not on the list (yet).</light_purple> <gray>Apply: <click:open_url:'{url}'><aqua><u>{url}</u></aqua></click> or in Discord with <white>/bewerben</white>.`,
  },
  'build.no_right': {
    de: `${P}<gray>Der Bau-Server ist nur fürs Bauteam.`,
    en: `${P}<gray>The build server is for the build team only.`,
  },
  'build.going': { de: `${P}<gray>Ab auf den Bau-Server …`, en: `${P}<gray>Off to the build server …` },
  'mode.maintenance': {
    de: `${P}<gold><white>{mode}</white> ist gerade in Wartung.`,
    en: `${P}<gold><white>{mode}</white> is under maintenance right now.`,
  },
  'voice.list': {
    de: `${V}<gray>Kanäle für alle Server: {channels}</gray>\n<gray>Beitreten: <yellow>/voice <kanal></yellow> oder im Sprachchat-Menü (Taste <white>G</white>) unter „Gruppen“. Eigene Gruppe für alle Server: <yellow>/voice gruppe <name> [passwort]</yellow>.`,
    en: `${VE}<gray>Channels on every server: {channels}</gray>\n<gray>Join: <yellow>/voice <channel></yellow> or in the voice chat menu (key <white>G</white>) under "Groups". Own group on every server: <yellow>/voice group <name> [password]</yellow>.`,
  },
  'voice.channel': {
    de: "<click:run_command:'/voice {name}'><hover:show_text:'Beitreten'><white>{name}</white> <dark_gray>({count})</dark_gray></hover></click>",
    en: "<click:run_command:'/voice {name}'><hover:show_text:'Join'><white>{name}</white> <dark_gray>({count})</dark_gray></hover></click>",
  },
  'voice.joined': {
    de: `${V}<gray>Du bist jetzt in <white>{name}</white> – alle Server hören dich.`,
    en: `${VE}<gray>You're in <white>{name}</white> now – every server can hear you.`,
  },
  'voice.left': { de: `${V}<gray>Du hast den Kanal verlassen.`, en: `${VE}<gray>You left the channel.` },
  'voice.unknown': {
    de: `${V}<red>Diesen Kanal gibt es nicht: <white>{name}`,
    en: `${VE}<red>There is no channel called <white>{name}`,
  },
  'voice.no_group': {
    de: `${V}<gray><white>{name}</white> ist in keiner Gruppe.`,
    en: `${VE}<gray><white>{name}</white> is not in a group.`,
  },
  'voice.other_server': {
    de: `${V}<gray><white>{name}</white> ist in einer eigenen Gruppe auf einem anderen Server.`,
    en: `${VE}<gray><white>{name}</white> is in a private group on another server.`,
  },
  'voice.followed': {
    de: `${V}<gray>Du bist jetzt in der Gruppe von <white>{name}</white>.`,
    en: `${VE}<gray>You joined <white>{name}</white>'s group.`,
  },
  'voice.own_list': {
    de: `${V}<gray>Eigene Gruppen: {groups}</gray> <dark_gray>(🔒 = mit Passwort: /voice <name> <passwort>)`,
    en: `${VE}<gray>Own groups: {groups}</gray> <dark_gray>(🔒 = password: /voice <name> <password>)`,
  },
  'voice.own_locked': {
    de: "<click:suggest_command:'/voice {name} '><hover:show_text:'Mit Passwort beitreten'><white>🔒 {name}</white> <dark_gray>({count})</dark_gray></hover></click>",
    en: "<click:suggest_command:'/voice {name} '><hover:show_text:'Join with password'><white>🔒 {name}</white> <dark_gray>({count})</dark_gray></hover></click>",
  },
  'voice.own_made': {
    de: `${V}<gray>Gruppe <white>{name}</white> steht – auf allen Servern. Andere kommen mit <yellow>/voice {name}</yellow> dazu.`,
    en: `${VE}<gray>Group <white>{name}</white> is ready – on every server. Others join with <yellow>/voice {name}</yellow>.`,
  },
  'voice.own_made_locked': {
    de: `${V}<gray>Gruppe <white>{name}</white> steht – auf allen Servern, mit Passwort. Andere kommen mit <yellow>/voice {name} {password}</yellow> dazu (oder im Menü mit dem Passwort).`,
    en: `${VE}<gray>Group <white>{name}</white> is ready – on every server, with password. Others join with <yellow>/voice {name} {password}</yellow> (or in the menu with the password).`,
  },
  'voice.own_usage': {
    de: `${V}<gray>So geht's: <yellow>/voice gruppe <name> [passwort]</yellow> – Name 3–16 Zeichen (Buchstaben, Ziffern, _ und -).`,
    en: `${VE}<gray>Usage: <yellow>/voice group <name> [password]</yellow> – name 3–16 characters (letters, digits, _ and -).`,
  },
  'voice.own_password_rule': {
    de: `${V}<red>Das Passwort braucht 4 bis 32 Zeichen.`,
    en: `${VE}<red>The password needs 4 to 32 characters.`,
  },
  'voice.own_taken': {
    de: `${V}<red>Den Namen <white>{name}</white> gibt es schon.`,
    en: `${VE}<red>The name <white>{name}</white> is already taken.`,
  },
  'voice.own_off': {
    de: `${V}<gray>Eigene Gruppen sind auf diesem Netzwerk gerade aus.`,
    en: `${VE}<gray>Own groups are switched off on this network right now.`,
  },
  'voice.own_none': {
    de: `${V}<gray>Du hast gerade keine eigene Gruppe.`,
    en: `${VE}<gray>You don't have an own group right now.`,
  },
  'voice.own_removed': {
    de: `${V}<gray>Gruppe <white>{name}</white> ist aufgelöst.`,
    en: `${VE}<gray>Group <white>{name}</white> has been closed.`,
  },
  'voice.own_password': {
    de: `${V}<red><white>{name}</white> hat ein Passwort: <yellow>/voice {name} <passwort>`,
    en: `${VE}<red><white>{name}</white> has a password: <yellow>/voice {name} <password>`,
  },
  'voice.muted_you': {
    de: `${V}<red>Du bist im Sprachchat stumm{until}. Grund: <white>{reason}`,
    en: `${VE}<red>You are muted in voice chat{until}. Reason: <white>{reason}`,
  },
  'voice.unmuted_you': {
    de: `${V}<green>Du kannst im Sprachchat wieder sprechen.`,
    en: `${VE}<green>You can speak in voice chat again.`,
  },
  'team.voicemute': {
    de: `${P}<red>{actor}</red> <gray>hat <white>{name}</white> im Sprachchat stummgeschaltet{until}. Grund: <white>{reason}`,
    en: `${P}<red>{actor}</red> <gray>muted <white>{name}</white> in voice chat{until}. Reason: <white>{reason}`,
  },
  'team.voiceunmute': {
    de: `${P}<green>{actor}</green> <gray>hat <white>{name}</white> im Sprachchat freigegeben.`,
    en: `${P}<green>{actor}</green> <gray>unmuted <white>{name}</white> in voice chat.`,
  },
  'voice.not_muted': {
    de: `${V}<gray><white>{name}</white> ist im Sprachchat nicht stumm.`,
    en: `${VE}<gray><white>{name}</white> is not muted in voice chat.`,
  },
  'profile.private': {
    de: `${P}<gray>Dein Profil auf der Webseite ist jetzt <white>privat</white> – niemand sieht deine Spielzeit.`,
    en: `${P}<gray>Your profile on the website is <white>private</white> now – nobody sees your play time.`,
  },
  'profile.public': {
    de: `${P}<gray>Dein Profil ist jetzt <white>öffentlich</white>: <aqua><click:open_url:'{url}'>{url}</click></aqua>`,
    en: `${P}<gray>Your profile is <white>public</white> now: <aqua><click:open_url:'{url}'>{url}</click></aqua>`,
  },
  'profile.usage': {
    de: `${P}<gray>Dein Profil: <aqua><click:open_url:'{url}'>{url}</click></aqua> <dark_gray>·</dark_gray> <yellow>/profil privat</yellow> oder <yellow>/profil öffentlich</yellow>`,
    en: `${P}<gray>Your profile: <aqua><click:open_url:'{url}'>{url}</click></aqua> <dark_gray>·</dark_gray> <yellow>/profile private</yellow> or <yellow>/profile public</yellow>`,
  },
  'lobby.missing': {
    de: `${P}<gold>Die Lobby startet gerade neu</gold> <gray>– gleich ist sie wieder da.`,
    en: `${P}<gold>The lobby is restarting</gold> <gray>– it’ll be back in a moment.`,
  },
  // Neustart mit Countdown (network/restart-now.ts). {s} in den Leisten zählt das Netzwerk-Plugin selbst herunter.
  'restart.update': {
    de: `${P}<gold>Update eingespielt</gold> <gray>– <white>{server}</white> startet in <yellow>{seconds} Sekunden</yellow> neu. Du kommst vorher in die Lobby, gleich geht es weiter.`,
    en: `${P}<gold>Update installed</gold> <gray>– <white>{server}</white> restarts in <yellow>{seconds} seconds</yellow>. You'll be moved to the lobby first – back in a moment.`,
  },
  'restart.release': {
    de: `${P}<gold>Neue Fassung von {server}</gold> <gray>– der Server startet in <yellow>{seconds} Sekunden</yellow> neu. Du kommst vorher in die Lobby, gleich geht es weiter.`,
    en: `${P}<gold>New version of {server}</gold> <gray>– the server restarts in <yellow>{seconds} seconds</yellow>. You'll be moved to the lobby first – back in a moment.`,
  },
  'restart.lobby': {
    de: `${P}<gold>Update eingespielt</gold> <gray>– die Lobby startet in <yellow>{seconds} Sekunden</yellow> neu. Es geht gleich weiter: In etwa einer Minute kannst du wieder rein.`,
    en: `${P}<gold>Update installed</gold> <gray>– the lobby restarts in <yellow>{seconds} seconds</yellow>. It goes on in a moment: you can join again in about a minute.`,
  },
  'restart.lobby.wartung': {
    de: `${P}<gold>Update eingespielt</gold> <gray>– die Lobby startet in <yellow>{seconds} Sekunden</yellow> neu. So lange wartest du in der Wartungs-Lobby und kommst danach von selbst zurück.`,
    en: `${P}<gold>Update installed</gold> <gray>– the lobby restarts in <yellow>{seconds} seconds</yellow>. Meanwhile you wait in the maintenance lobby and come back on your own afterwards.`,
  },
  'restart.wartung.held': {
    de: `${P}<gold>Update eingespielt</gold> <gray>– die Wartungs-Lobby startet in <yellow>{seconds} Sekunden</yellow> neu. In etwa einer Minute kannst du wieder rein.`,
    en: `${P}<gold>Update installed</gold> <gray>– the maintenance lobby restarts in <yellow>{seconds} seconds</yellow>. You can join again in about a minute.`,
  },
  'restart.network': {
    de: `${P}<gold>Update eingespielt</gold> <gray>– das Netzwerk startet in <yellow>{seconds} Sekunden</yellow> kurz neu. In etwa einer Minute geht es weiter – einfach wieder verbinden.`,
    en: `${P}<gold>Update installed</gold> <gray>– the network restarts briefly in <yellow>{seconds} seconds</yellow>. It goes on in about a minute – just connect again.`,
  },
  'restart.soon': {
    de: `${P}<gray>Noch <yellow>{seconds} Sekunden</yellow> bis zum Neustart.`,
    en: `${P}<gray><yellow>{seconds} seconds</yellow> until the restart.`,
  },
  'restart.moved': {
    de: `${P}<gray>Du bist in der Lobby, solange <white>{server}</white> neu startet – gleich ist der Modus wieder da.`,
    en: `${P}<gray>You're in the lobby while <white>{server}</white> restarts – the mode is back in a moment.`,
  },
  'restart.bar.update': {
    de: `<gold>Update eingespielt</gold> <gray>–</gray> <white>{server}</white> <gray>startet in</gray> <yellow>{s} s</yellow> <gray>neu</gray>`,
    en: `<gold>Update installed</gold> <gray>–</gray> <white>{server}</white> <gray>restarts in</gray> <yellow>{s} s</yellow>`,
  },
  'restart.bar.release': {
    de: `<gold>Neue Fassung</gold> <gray>–</gray> <white>{server}</white> <gray>startet in</gray> <yellow>{s} s</yellow> <gray>neu</gray>`,
    en: `<gold>New version</gold> <gray>–</gray> <white>{server}</white> <gray>restarts in</gray> <yellow>{s} s</yellow>`,
  },
  'restart.kick.lobby': {
    de: `<gold>Die Lobby startet neu</gold>\n\n<gray>Update eingespielt – in etwa einer Minute kannst du wieder rein. Bis gleich!`,
    en: `<gold>The lobby is restarting</gold>\n\n<gray>Update installed – you can join again in about a minute. See you soon!`,
  },
  'restart.kick.wartung': {
    de: `<gold>Die Wartungs-Lobby startet neu</gold>\n\n<gray>Update eingespielt – in etwa einer Minute kannst du wieder rein. Bis gleich!`,
    en: `<gold>The maintenance lobby is restarting</gold>\n\n<gray>Update installed – you can join again in about a minute. See you soon!`,
  },
  'restart.kick.network': {
    de: `<gold>Das Netzwerk startet kurz neu</gold>\n\n<gray>Update eingespielt – in etwa einer Minute kannst du wieder rein. Bis gleich!`,
    en: `<gold>The network is restarting briefly</gold>\n\n<gray>Update installed – you can join again in about a minute. See you soon!`,
  },
  'restart.name.lobby': { de: 'die Lobby', en: 'the lobby' },
  'restart.name.bau': { de: 'der Bau-Server', en: 'the build server' },
  'restart.name.proxy': { de: 'das Netzwerk', en: 'the network' },
  'restart.name.wartung': { de: 'die Wartungs-Lobby', en: 'the maintenance lobby' },
} as const satisfies Record<string, Record<Lang, string>>;

export type TextKey = keyof typeof TEXTS;

/** Text in der Sprache des Spielers; `vars` werden so eingesetzt, wie sie sind (vorher mit `mm` entschärfen). */
export function text(lang: Lang, key: TextKey, vars: Readonly<Record<string, string | number>> = {}): string {
  return TEXTS[key][lang].replace(PLACEHOLDER, (all, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : all,
  );
}

const DATE_FORMAT: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function dateText(lang: Lang, iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString(DATE_FORMAT[lang], {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  });
}

/** Sprache aus der Einstellung im Client: "de_de", "de_AT" → de, alles andere → en. */
export const langOfLocale = (locale: string | null | undefined, fallback: Lang): Lang => {
  if (!locale) return fallback;
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
};
