package de.moinmorni.network.velocity;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Wohin, wenn ein Spieler ankommt oder von einem Server fliegt (Neustart, Absturz, Rauswurf): erst die Lobby, dann
 * die Wartungs-Lobby – sonst freundlich trennen. Nie weiter durch die {@code try}-Liste von Velocity (Bau-Server,
 * Spielmodi). Rein, ohne Velocity – darum mit Tests.
 */
final class Fallback {

    static final String LOBBY = "lobby";
    static final String WARTUNG = "wartung";
    private static final List<String> LOBBY_FIRST = List.of(LOBBY, WARTUNG);

    private Fallback() {
    }

    /**
     * Reihenfolge, wenn der Hub gerade nicht antwortet: bei Wartung nur die Wartungs-Lobby (ohne Hub weiß der Proxy nicht,
     * wer zum Team gehört), sonst Lobby und – wenn eingeschaltet – die Wartungs-Lobby.
     */
    static List<String> localOrder(boolean maintenance, boolean wartungOn) {
        if (!wartungOn) {
            return List.of(LOBBY);
        }
        return maintenance ? List.of(WARTUNG) : LOBBY_FIRST;
    }

    /** Erster Server aus der Reihenfolge, der noch nicht gescheitert ist und den es gibt. */
    static Optional<String> next(List<String> order, Set<String> tried, Predicate<String> exists) {
        return order.stream().filter(name -> !tried.contains(name)).filter(exists).findFirst();
    }

    /** Ohne Hub sind nur Lobby und Wartungs-Lobby offen (niemand kann Rechte, Wartung oder Einladungen prüfen). */
    static boolean openWithoutHub(String server) {
        return LOBBY.equals(server) || WARTUNG.equals(server);
    }

    /** Nur eine dieser Antworten des Hubs gilt; alles andere (z. B. „bau“) lässt der Proxy aus. */
    static List<String> onlyFallbacks(List<String> order) {
        return order.stream().filter(Fallback::openWithoutHub).distinct().toList();
    }
}
