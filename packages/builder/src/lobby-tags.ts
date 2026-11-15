/**
 * Jedes Wesen, das die Lobby setzt, trägt `mm_lobby` und die Bau-Version (`mm_build_<version>`; beim Bauen setzt
 * `lobbyPack()` die echte Version für den Platzhalter ein). Das Lobby-Plugin entfernt Wesen aus älteren Bauten, sobald
 * sie geladen werden – auch in Stücken, die beim Neubau gerade nicht geladen waren.
 *
 * Eigene Datei ohne weitere Abhängigkeiten, damit Brunnen, Möbel und Dorf sie ohne Kreis-Import nutzen können.
 */
export const LOBBY_TAG = 'mm_lobby';
export const BUILD_TAG_PREFIX = 'mm_build_';
export const BUILD_PLACEHOLDER = `${BUILD_TAG_PREFIX}dev`;
const LOBBY_TAGS = [LOBBY_TAG, BUILD_PLACEHOLDER];

/** Tags eines Wesens der Lobby als SNBT-Liste (mit Lobby- und Bau-Kennung), z. B. für Anzeige-Objekte. */
export const lobbyTags = (tags: readonly string[]): string =>
  [...tags, ...LOBBY_TAGS].map((t) => `'${t}'`).join(',');
