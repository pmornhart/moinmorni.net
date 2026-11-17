import type { ChangeItem, ChangeKind } from '@moinmorni/shared';

/**
 * Was sich geändert hat – aus Commit-Nachrichten gelesen, für die Update-Karte im Panel (`update.ts`) und
 * für „Was ist neu“ (`changelog.ts`). Commits haben Stichpunkte wie „- Neu: …“, „- Behoben: …“,
 * „- Verbessert: …“, „- Entfernt: …“; ein Stichpunkt ohne diese Wörter und ein Commit ganz ohne Stichpunkte
 * (nur Betreff) werden nach ihren Wörtern eingeordnet (wie in MorniHosting). Unterschrift („Verfasst mit
 * Claude“, `Co-Authored-By`, …), Merge-Kopfzeilen und Commits nur für Doku und Stand bleiben weg.
 */

/** Längere Stichpunkte werden gekürzt (manche Commits erzählen sehr ausführlich). */
const MAX_TEXT = 600;
const ELLIPSIS = '…';
const MERGE_PREFIX = 'Merge ';
/** Zeilen, die nicht zur Änderung gehören (Unterschrift, Hinweise von Git). */
const SKIP_PREFIXES = ['Verfasst mit Claude', 'Co-Authored-By:', 'Claude-Session:', 'Signed-off-by:', '#'];

// Ein Stichpunkt: "- Neu: Gefängnis" gibt "Neu: Gefängnis", "  * Teil" gibt "Teil"; "Verfasst …" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs*%5B-*%E2%80%A2%5D%5Cs%2B(.%2B)%24&testString=-%20Neu%3A%20Gef%C3%A4ngnis
const BULLET = /^\s*[-*•]\s+(.+)$/;
// Fortsetzung eines umgebrochenen Stichpunkts, eingerückt ohne Strich ("  weiter im Text" ja, "Absatz" nein).
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs%2B%5CS&testString=%20%20weiter%20im%20Text
const CONTINUED = /^\s+\S/;
// Art vorn genannt: "Behoben: Bedrock-Port" gibt "Behoben" und "Bedrock-Port".
// https://regex101.com/?flavor=javascript&regex=%5E(neu%7Cbehoben%7Cverbessert%7Centfernt%7Cge%C3%A4ndert)%5Cs*%3A%5Cs*(.%2B)%24&flags=i&testString=Behoben%3A%20Bedrock-Port
const LABELLED = /^(neu|behoben|verbessert|entfernt|geändert)\s*:\s*(.+)$/i;
// Kein Teil der Änderung, sondern wie geprüft wurde: "Echt geprüft: …", "Tests: 12/12", "Hinweis: …".
// https://regex101.com/?flavor=javascript&regex=%5E(echt%20gepr%C3%BCft%7Cnicht%20gepr%C3%BCft%7Cgepr%C3%BCft%7Cgetestet%7Ctests%3F%7Chinweis%7Coffen)%5Cs*%3A&flags=i&testString=Echt%20gepr%C3%BCft%3A%20Plugin
const NOT_A_CHANGE = /^(echt geprüft|nicht geprüft|geprüft|getestet|tests?|hinweis|offen)\s*:/i;
// Commits nur für Doku und Stand: "STAND: …", "Fortschrittsseite: …", "STAND und Fortschrittsseite: …".
// https://regex101.com/?flavor=javascript&regex=%5E(STAND%7CFortschrittsseite%7CREADME%7CDoku)%5Cb&testString=STAND%3A%20Wartungs-Lobby
const DOCS_ONLY = /^(STAND|Fortschrittsseite|README|Doku)\b/;
// Markdown-Zeichen für Code: "`update.sh`" wird "update.sh".
// https://regex101.com/?flavor=javascript&regex=%60&flags=g&testString=%60update.sh%60
const BACKTICKS = /`/g;
// Mehrere Leerzeichen/Umbrüche zu einem: "a  b" → "a b".
// https://regex101.com/?flavor=javascript&regex=%5Cs%2B&flags=g&testString=a%20%20b
const SPACES = /\s+/g;

const LABEL_KINDS: Readonly<Record<string, ChangeKind>> = {
  neu: 'new',
  behoben: 'fixed',
  verbessert: 'improved',
  entfernt: 'removed',
  geändert: 'other',
};

// Wörter, die die Art eines Satzes ohne Angabe verraten; die Grenzen kennen Umlaute ((?<!\p{L}) statt \b).
// Behoben: "Funde aus dem Test behoben" passt, "Fundstück" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(behoben%7Crepariert%7Cfix%7Cfehler%7Cfunde%3F(%3F!%5Cp%7BL%7D)%7Cging%20nicht%7Ckam%20nicht)&flags=iu&testString=Funde%20aus%20dem%20Test%20behoben
const FIXED_WORDS = /(?<!\p{L})(behoben|repariert|fix|fehler|funde?(?!\p{L})|ging nicht|kam nicht)/iu;
// Entfernt: "Menüpunkt entfernt" passt, "Rückweg" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(entfernt%7Cgel%C3%B6scht%7Cweg%7Craus%7Cabgeschaltet)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Men%C3%BCpunkt%20entfernt
const REMOVED_WORDS = /(?<!\p{L})(entfernt|gelöscht|weg|raus|abgeschaltet)(?!\p{L})/iu;
// Neu: "Neue Impressum-Seite" passt, "erneuert" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(neu%7Cneue%5Bnrs%5D%3F%7Chinzu%7Ckann%20jetzt)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Neue%20Impressum-Seite
const NEW_WORDS = /(?<!\p{L})(neu|neue[nrs]?|hinzu|kann jetzt)(?!\p{L})/iu;
// Verbessert: "Start ist schneller" passt, "Besserwisser" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(schneller%7Cbessere%3F%5Bnrs%5D%3F%7Cweniger%7Cstabiler%7Cklarer%7Csch%C3%B6ner)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Start%20ist%20schneller
const BETTER_WORDS = /(?<!\p{L})(schneller|bessere?[nrs]?|weniger|stabiler|klarer|schöner)(?!\p{L})/iu;
// Verbessert: "Proxmox-Einzeiler bequemer" passt, "verbesserungswürdig" nicht.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(bequemer%7Cfeinschliff%7Crobuster%7Ceinfacher%7Cverbessert%7Caufger%C3%A4umt)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Proxmox-Einzeiler%20bequemer
const POLISHED_WORDS = /(?<!\p{L})(bequemer|feinschliff|robuster|einfacher|verbessert|aufgeräumt)(?!\p{L})/iu;
const GUESSES: readonly (readonly [RegExp, ChangeKind])[] = [
  [FIXED_WORDS, 'fixed'],
  [REMOVED_WORDS, 'removed'],
  [NEW_WORDS, 'new'],
  [BETTER_WORDS, 'improved'],
  [POLISHED_WORDS, 'improved'],
];

/**
 * Für wen die Liste ist: das Team im Panel sieht alles; Spieler auf der Webseite nur, was sie verstehen – ohne
 * Dateinamen, Umgebungsvariablen, Testzahlen, Branches und Panel-Interna.
 */
export type ChangeAudience = 'team' | 'players';

/** Ein Stichpunkt für Spieler wird höchstens so lang (bis zum Satzende davor). */
const PLAYER_MAX_TEXT = 280;
// Satzende vor einem neuen Satz: "… geladen. Jetzt …" ja, "z. B. Wintersport", "bzw. „Abend“" und "ca. 5" nein.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!(%3F%3C!%5Cp%7BL%7D)(%5Cp%7BL%7D%7Cbzw%7Cusw%7Cggf%7Cinkl%7Cvgl%7Cetc%7Cca%7Cevtl%7Cmax%7Cmin))%5B.!%3F%5D(%3F%3D%5Cs%2B%5Cp%7BLu%7D)&flags=gu&testString=Stand%20geladen.%20Jetzt%20z.%20B.%20Wintersport
const SENTENCE_END = /(?<!(?<!\p{L})(\p{L}|bzw|usw|ggf|inkl|vgl|etc|ca|evtl|max|min))[.!?](?=\s+\p{Lu})/gu;

// Spuren von Code und Technik in einem Satz – so ein Satz (oder Klammer-Teil) ist nichts für Spieler.
// Markdown-Code: "`hub/streamer.ts`" ja, "Streamer" nein.
// https://regex101.com/?flavor=javascript&regex=%60&testString=%60hub%2Fstreamer.ts%60
const CODE_MARK = /`/;
// Dateinamen: "update.sh", "config.yml", "LobbyNpcs.java" ja, "moinmorni.net" und "z. B." nein.
// https://regex101.com/?flavor=javascript&regex=%5Cw%5C.(ts%7Ctsx%7Cjs%7Ccjs%7Cmjs%7Cjava%7Cjson%7Cya%3Fml%7Csh%7Ctoml%7Cproperties%7Cmd%7Chtml%7Ccss%7Csql%7Ctxt%7Czip%7Cjar%7Cpng%7Cwebp%7Cogg%7Cenv%7Cpy)(%3F!%5Cp%7BL%7D)&flags=iu&testString=update.sh%20und%20moinmorni.net
const FILE_NAME =
  /\w\.(ts|tsx|js|cjs|mjs|java|json|ya?ml|sh|toml|properties|md|html|css|sql|txt|zip|jar|png|webp|ogg|env|py)(?!\p{L})/iu;
// Pfade mit zwei Schrägstrichen in Kleinbuchstaben: "apps/server/src", "/api/public/x" ja, "Java/Bedrock" nein.
// https://regex101.com/?flavor=javascript&regex=%5B%2Fa-z0-9_.-%5D%5C%2F%5Ba-z0-9_.-%5D%2B%5C%2F&testString=%2Fapi%2Fpublic%2Fchangelog
const PATH = /[a-z0-9_.-]\/[a-z0-9_.-]+\//;
// Umgebungsvariablen: "MH_BRAND", "MM_UPDATE_BRANCH" ja, "MoinMorni" nein.
// https://regex101.com/?flavor=javascript&regex=%5Cb%5BA-Z%5D%5BA-Z0-9%5D*_%5BA-Z0-9_%5D%2B%5Cb&testString=MM_UPDATE_BRANCH
const ENV_NAME = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;
// Namen aus dem Code: "holdSlot", "askToLobby" ja, "MoinMorni" und "NetBird" (groß vorn) nein.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)%5Ba-z%5D%2B%5BA-Z%5D%5Ba-zA-Z%5D*&flags=u&testString=holdSlot%20MoinMorni
const CODE_NAME = /(?<!\p{L})[a-z]+[A-Z][a-zA-Z]*/u;
// Testergebnisse: "20/20", "35/35" ja, "Bester aus 3/5" nein.
// https://regex101.com/?flavor=javascript&regex=%5Cb(%5Cd%2B)%5C%2F%5C1%5Cb&testString=echt%2020%2F20
const TEST_SCORE = /\b(\d+)\/\1\b/;
// Wörter vom Bauen und Prüfen: "Tests", "JUnit", "Branch", "Commit", "echt geprüft" … – "Testspiel" nein.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(tests%3F%7Cjunit%7Cplaywright%7Cprettier%7Cvitest%7Ctypen%7Cbranch(es%7Cs)%3F%7Ccommits%3F%7Cmerge%7Csubmodul%7Cmigration%7Cecht%20gepr%C3%BCft%7Cmineflayer%7Capi%7Cnachgebaut(e%5Bnrs%5D)%3F%7Cgepr%C3%BCft%7Crelease)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Tests%3A%2012%2F12
const BUILD_WORDS =
  /(?<!\p{L})(tests?|junit|playwright|prettier|vitest|typen|branch(es|s)?|commits?|merge|submodul|migration|echt geprüft|mineflayer|api|nachgebaut(e[nrs]?)?|geprüft|release)(?!\p{L})/iu;
// Fachwörter aus Server und Betrieb: "Hub", "JVM", "Heap", "Velocity", "Netzwerk-Plugin" – "Hubschrauber" nein.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(hubs%3F%7Cjvm%7Cheap%7Cvelocity%7Cpaper%7Cbukkit%7Cgithub%7Cmornihosting%7C(netzwerk-)%3Fplugins%3F%7Cproxy%7Cchunks%3F%7Carbeitsspeicher%7Cspeicherplan%7Cselbstbau%7Csicherheitspr%C3%BCfung%7Cprotokoll%7Cfestplatte%7Cspeicher%7Ctoken)(%3F!%5Cp%7BL%7D)&flags=iu&testString=der%20Hub%20nimmt%20sie
const SERVER_WORDS =
  /(?<!\p{L})(hubs?|jvm|heap|velocity|paper|bukkit|github|mornihosting|(netzwerk-)?plugins?|proxy|chunks?|arbeitsspeicher|speicherplan|selbstbau|sicherheitsprüfung|protokoll|festplatte|speicher|token)(?!\p{L})/iu;
// Kennungen aus dem Code, klein mit Bindestrich: "rueckkehr-sekunden" ja, "Jump-and-Run" (groß vorn) nein.
// https://regex101.com/?flavor=javascript&regex=(%3C!%5B%5Cp%7BL%7D-%5D)%5Ba-z%5D%2B(-%5Ba-z%5D%2B)%2B(%3F!%5B%5Cp%7BL%7D-%5D)&flags=u&testString=rueckkehr-sekunden
const CODE_ID = /(?<![\p{L}-])[a-z]+(-[a-z]+)+(?![\p{L}-])/u;
// Versionsnummern von Programmen und Modi: "4.23.15", "0.2.1", "26.x" ja, "3,5" nein.
// https://regex101.com/?flavor=javascript&regex=%5Cb%5Cd%2B%5C.(%5Cd%2B%5C.%5Cd%2B%7Cx)%5Cb&testString=tsx%204.23.15%20und%2026.x
const VERSION_NUMBER = /\b\d+\.(\d+\.\d+|x)\b/;
const CODE_TRACES = [
  CODE_MARK,
  FILE_NAME,
  PATH,
  ENV_NAME,
  CODE_NAME,
  TEST_SCORE,
  BUILD_WORDS,
  SERVER_WORDS,
  CODE_ID,
  VERSION_NUMBER,
];
// Themen nur fürs Team (Panel, Einrichtung, Betrieb, Werkzeuge): "Panel → Duels", "Proxmox-Einzeiler", "Demo" ja,
// "Lobby" und "Paneele" nein.
// https://regex101.com/?flavor=javascript&regex=(%3F%3C!%5Cp%7BL%7D)(panels%3F%7Ceinricht%5Cp%7BL%7D*%7Cproxmox%7Cnetbird%7Ceinzeiler%7Cmotors%3F%7Cw%C3%A4chter%7Creadme%7Canleitung(en)%3F%7Cschnellstart%7Cquick%20start%7Cinstallation(en)%3F%7Cprovisioner%7Cbauplan-pr%C3%BCfung%7Cupdate-karte%7Cteam-log%7Ccontainer%7Czwischen-namen%3F%7Ckonflikte%3F%7Czusammengef%C3%BChrt%7Cbaukasten%7Ctrailer%7Cdarsteller%7Cbekannten%20funde%7Cdemo%7Ckopien%3F%7Cfortschrittsseite%7Cdoku)(%3F!%5Cp%7BL%7D)&flags=iu&testString=Panel%20%E2%86%92%20Duels
const TEAM_TOPICS =
  /(?<!\p{L})(panels?|einricht\p{L}*|proxmox|netbird|einzeiler|motors?|wächter|readme|anleitung(en)?|schnellstart|quick start|installation(en)?|provisioner|bauplan-prüfung|update-karte|team-log|container|zwischen-namen?|konflikte?|zusammengeführt|baukasten|trailer|darsteller|bekannten funde|demo|kopien?|fortschrittsseite|doku)(?!\p{L})/iu;
// Einstellungen im Panel ("Einstellungen → Rang-Abzeichen …", "Einstellungen Netzwerk → …") und die Stand-Datei
// ("STAND nachgezogen"); "Stand der Dinge" nein.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs*%5BEe%5Dinstellungen(%3F!%5Cp%7BL%7D)%7C%5CbSTAND%5Cb&flags=u&testString=Einstellungen%20Netzwerk%20%E2%86%92%20Mitten%20im%20Spiel
const TEAM_PLACES = /^\s*[Ee]instellungen(?!\p{L})|\bSTAND\b/u;
// Innerste Klammer: "(hub/voice.ts)".
// https://regex101.com/?flavor=javascript&regex=%5C(%5B%5E()%5D*%5C)&flags=g&testString=Sprachchat%20(hub%2Fvoice.ts)
const PARENTHESES = /\([^()]*\)/g;
// Leerzeichen vor Satzzeichen nach dem Kürzen: "Lobby ," → "Lobby,".
// https://regex101.com/?flavor=javascript&regex=%5Cs%2B(%5B%2C.%3B%3A!%3F%5D)&flags=g&testString=Lobby%20%2C%20fertig%20.
const SPACE_BEFORE_MARK = /\s+([,.;:!?])/g;

const technical = (text: string): boolean => CODE_TRACES.some((trace) => trace.test(text));
/** Code-Spuren oder ein Thema nur fürs Team. */
const notForPlayers = (text: string): boolean =>
  technical(text) || TEAM_TOPICS.test(text) || TEAM_PLACES.test(text);

/**
 * Ein Satz für Spieler: Klammern mit Technik fallen weg; ab dem ersten Teil (getrennt durch „;“) mit Technik oder
 * einem Team-Thema ist Schluss – steht so etwas schon im ersten Teil, ist der Satz nichts für Spieler (null). Lange Sätze enden am letzten Satzende vor 280 Zeichen.
 */
export function playerText(raw: string): string | null {
  const withoutParts = raw.replace(PARENTHESES, (part) => (technical(part) ? '' : part));
  // Teile nach „;“ nur, solange keiner davor wegfiel – sonst blieben Bruchstücke ohne Zusammenhang übrig.
  const clauses = withoutParts.split(';');
  const firstOut = clauses.findIndex(notForPlayers);
  const kept = (firstOut < 0 ? clauses : clauses.slice(0, firstOut)).join(';');
  if (!kept.trim() || kept.includes('(') !== kept.includes(')')) return null;
  const tidy = kept.replace(SPACES, ' ').replace(SPACE_BEFORE_MARK, '$1').trim();
  if (tidy.length <= PLAYER_MAX_TEXT) return tidy;
  const end = [...tidy.matchAll(SENTENCE_END)]
    .map((m) => m.index)
    .filter((i) => i < PLAYER_MAX_TEXT)
    .at(-1);
  return end ? tidy.slice(0, end + 1) : `${tidy.slice(0, PLAYER_MAX_TEXT - 1).trimEnd()}${ELLIPSIS}`;
}

const clean = (text: string): string => {
  const plain = text.replace(BACKTICKS, '').replace(SPACES, ' ').trim();
  return plain.length > MAX_TEXT ? `${plain.slice(0, MAX_TEXT - 1).trimEnd()}${ELLIPSIS}` : plain;
};

/** Art aus den Wörtern – „other“, wenn nichts passt. */
export function guessKind(text: string): ChangeKind {
  return GUESSES.find(([words]) => words.test(text))?.[1] ?? 'other';
}

/** Ein Stichpunkt als Änderung: „Neu:“/„Behoben:“ … vorn zählt, sonst nach Wörtern; null = keine Änderung. */
function itemOf(line: string, audience: ChangeAudience): ChangeItem | null {
  if (NOT_A_CHANGE.test(line)) return null;
  const labelled = LABELLED.exec(line);
  const said = labelled ? (labelled[2] ?? '') : line;
  const forPlayers = audience === 'players' ? playerText(said) : said;
  const text = forPlayers === null ? '' : clean(forPlayers);
  if (!text) return null;
  const kind = labelled ? (LABEL_KINDS[(labelled[1] ?? '').toLowerCase()] ?? 'other') : guessKind(text);
  return { kind, text };
}

const skipped = (line: string): boolean => SKIP_PREFIXES.some((prefix) => line.trim().startsWith(prefix));

/** Die Stichpunkte einer Commit-Nachricht (ohne Betreff), umgebrochene Zeilen wieder zusammengesetzt. */
export function bulletItems(message: string, audience: ChangeAudience = 'team'): ChangeItem[] {
  const bullets = message
    .split('\n')
    .slice(1)
    .filter((line) => !skipped(line))
    .reduce<{ readonly done: string[]; readonly open: boolean }>(
      (acc, line) => {
        const bullet = BULLET.exec(line);
        if (bullet) return { done: [...acc.done, bullet[1] ?? ''], open: true };
        if (acc.open && CONTINUED.test(line)) {
          const last = acc.done.length - 1;
          return { done: acc.done.map((b, i) => (i === last ? `${b} ${line.trim()}` : b)), open: true };
        }
        return { done: acc.done, open: false };
      },
      { done: [], open: false },
    ).done;
  return bullets.map((b) => itemOf(b, audience)).filter((item): item is ChangeItem => item !== null);
}

/** Der Betreff als Änderung (nach Wörtern eingeordnet) – null für Merge-Kopfzeilen und reine Doku-Commits. */
export function subjectItem(message: string, audience: ChangeAudience = 'team'): ChangeItem | null {
  const raw = message.split('\n')[0] ?? '';
  const subject = clean(raw);
  if (!subject || subject.startsWith(MERGE_PREFIX) || DOCS_ONLY.test(subject)) return null;
  const said = audience === 'players' ? playerText(raw) : subject;
  return said ? { kind: guessKind(subject), text: clean(said) } : null;
}

/** Ein reiner Doku-Commit („STAND: …“, „Fortschrittsseite: …“) zählt nicht als Änderung. */
export const docsOnly = (message: string): boolean => DOCS_ONLY.test(message.trimStart());

/**
 * Was ein Commit geändert hat: seine Stichpunkte, sonst sein Betreff. Doku-Commits: nichts. Für Spieler nur, was sie
 * verstehen – hat ein Commit Stichpunkte, aber keinen für Spieler, bleibt er für sie leer (der Betreff ist dann meist
 * genauso technisch).
 */
export function itemsOf(message: string, audience: ChangeAudience = 'team'): ChangeItem[] {
  if (docsOnly(message)) return [];
  if (bulletItems(message).length) return bulletItems(message, audience);
  const subject = subjectItem(message, audience);
  return subject ? [subject] : [];
}
