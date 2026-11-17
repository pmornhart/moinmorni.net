package de.moinmorni.network.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Wohin nach einem Rauswurf: Lobby, dann Wartungs-Lobby – nie weiter zu Bau-Server oder Modi. */
class FallbackTest {

    private static final Set<String> NETWORK = Set.of("lobby", "wartung", "bau", "duels");

    private static Optional<String> next(List<String> order, String... tried) {
        return Fallback.next(order, Set.of(tried), NETWORK::contains);
    }

    @Test
    void lobbyZuerstDannWartungDannNichts() {
        List<String> order = Fallback.localOrder(false, true);
        assertEquals(Optional.of("lobby"), next(order, "duels"));
        assertEquals(Optional.of("wartung"), next(order, "duels", "lobby"));
        assertEquals(Optional.empty(), next(order, "duels", "lobby", "wartung"));
    }

    @Test
    void ohneWartungsLobbyNurDieLobby() {
        List<String> order = Fallback.localOrder(false, false);
        assertEquals(Optional.empty(), next(order, "lobby"));
    }

    @Test
    void wartungOhneHubNurWartungsLobby() {
        assertEquals(List.of("wartung"), Fallback.localOrder(true, true));
    }

    @Test
    void wasDerHubSonstNochSagtFliegtRaus() {
        assertEquals(List.of("wartung", "lobby"),
                Fallback.onlyFallbacks(List.of("bau", "wartung", "duels", "lobby", "wartung")));
    }

    @Test
    void fehlenderServerWirdUebersprungen() {
        Optional<String> found = Fallback.next(List.of("lobby", "wartung"), Set.of(), "wartung"::equals);
        assertEquals(Optional.of("wartung"), found);
    }

    @Test
    void ohneHubOffen() {
        assertTrue(Fallback.openWithoutHub("lobby"));
        assertTrue(Fallback.openWithoutHub("wartung"));
        assertFalse(Fallback.openWithoutHub("bau"));
    }
}
