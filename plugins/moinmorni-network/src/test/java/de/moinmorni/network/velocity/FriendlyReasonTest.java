package de.moinmorni.network.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.junit.jupiter.api.Test;

/** Bricht ein Spielserver weg, sieht der Spieler einen freundlichen Satz statt Velocitys englischer Fehlermeldung. */
class FriendlyReasonTest {
    private static String plain(Component c) {
        return PlainTextComponentSerializer.plainText().serialize(c);
    }

    @Test
    void ohneGrundFreundlich() {
        assertTrue(plain(VelocityPlugin.friendlyReason(null, null)).contains("zurück im Dorf"));
    }

    @Test
    void velocityFehlerWirdErsetzt() {
        Component velocity = Component.translatable("velocity.error.internal-server-connection-error");
        assertTrue(plain(VelocityPlugin.friendlyReason(velocity, null)).contains("zurück im Dorf"));
    }

    @Test
    void eigenerGrundBleibt() {
        Component own = Component.text("Vom Team gebannt");
        assertEquals(own, VelocityPlugin.friendlyReason(own, null));
    }
}
