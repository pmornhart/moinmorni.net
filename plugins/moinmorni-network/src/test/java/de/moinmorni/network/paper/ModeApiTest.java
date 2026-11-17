package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import de.moinmorni.api.MoinMorni;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.bukkit.entity.Player;
import org.junit.jupiter.api.Test;

/**
 * Schnittstelle Fassung 2 auf dem Spielserver, ohne Hub: Wer gerade spielt, wird vor der Lobby gefragt (Fenster hier
 * auf dem Server), wer nicht spielt oder den Server verlassen hat, geht wie bei toLobby. Dazu die Restzeit-Anzeige
 * für „Zurück ins Spiel“.
 */
class ModeApiTest {

    /** Was mit dem nachgebauten Spieler passiert ist. */
    private final List<String> events = new ArrayList<>();
    private final UUID id = UUID.fromString("22222222-2222-2222-2222-222222222222");

    /** Spieler ohne Server: kennt nur seine UUID und merkt sich, ob er rausgeworfen wurde. */
    private Player player() {
        return (Player) Proxy.newProxyInstance(Player.class.getClassLoader(), new Class<?>[] {Player.class},
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getUniqueId" -> {
                            return id;
                        }
                        case "kick" -> {
                            events.add("kick");
                            return null;
                        }
                        case "hashCode" -> {
                            return id.hashCode();
                        }
                        case "equals" -> {
                            return proxy == args[0];
                        }
                        default -> {
                            return null;
                        }
                    }
                });
    }

    /** Ohne Hub (null): „online“ ist aus, alles läuft auf dem Server selbst. */
    private ModeApi api() {
        return new ModeApi(null, "duels", u -> "de", u -> null, u -> Set.of(), p -> events.add("ask"));
    }

    @Test
    void schnittstelleFassungZwei() {
        assertEquals(2, MoinMorni.API_VERSION);
        assertFalse(api().online());
    }

    @Test
    void werSpieltWirdGefragtWerNichtSpieltGehtWieToLobby() {
        ModeApi api = api();
        Player p = player();
        api.askToLobby(p);
        assertEquals(List.of("kick"), events);

        events.clear();
        api.playing(p, true);
        api.askToLobby(p);
        assertEquals(List.of("ask"), events);

        events.clear();
        api.playing(p, false);
        api.askToLobby(p);
        assertEquals(List.of("kick"), events);
    }

    @Test
    void nachDemVerlassenIstDerStandVergessen() {
        ModeApi api = api();
        Player p = player();
        api.playing(p, true);
        api.forget(id);
        api.askToLobby(p);
        assertEquals(List.of("kick"), events);
    }

    @Test
    void ohneHubGehtNichtsVerlorenUndNichtsKaputt() {
        ModeApi api = api();
        assertDoesNotThrow(() -> api.holdSlot(id, 120));
        assertDoesNotThrow(() -> api.holdSlot(id, -5));
        assertDoesNotThrow(api::resendPlaying);
        assertTrue(events.isEmpty());
    }

    @Test
    void restzeitWieAufEinerUhr() {
        assertEquals("1:45", ReturnOffer.remaining(105_000));
        assertEquals("1:45", ReturnOffer.remaining(105_999));
        assertEquals("0:59", ReturnOffer.remaining(59_999));
        assertEquals("10:00", ReturnOffer.remaining(600_000));
        assertEquals("0:00", ReturnOffer.remaining(-3_000));
    }
}
