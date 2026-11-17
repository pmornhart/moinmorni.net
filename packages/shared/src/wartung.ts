/**
 * Wartungs-Lobby: ein kleiner Paper-Server „Wartung“, den das Netzwerk selbst anlegt (immer an, schläft nie). Dort
 * wartet, wer gerade nicht in die Lobby kann (Neustart, Update, Absturz) oder während der Wartung des Netzwerks nicht
 * hinein darf. Sie ist immer die zweite Wahl nach der Lobby – nie geht es weiter auf Bau-Server oder Modi.
 */

/** Name des Servers im Netzwerk (Velocity). */
export const WARTUNG_SERVER = 'wartung';
/** Arbeitsspeicher der Wartungs-Lobby: eine kleine Welt, wenige Wesen – 768 MB reichen. */
export const WARTUNG_MEMORY_MB = 768;
/** Countdown, bevor die Wartenden automatisch zurück in die Lobby kommen. */
export const WARTUNG_RETURN_SECONDS = 10;
