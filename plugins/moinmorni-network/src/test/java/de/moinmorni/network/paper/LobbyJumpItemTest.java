package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import de.moinmorni.network.paper.LobbyFeatures.JumpLook;
import org.junit.jupiter.api.Test;

/** Gegenstand „Jump and Run“ in der Schnellleiste: was er je nach Panel-Schalter und Lauf ist. */
class LobbyJumpItemTest {

    @Test
    void startsWhenOpenAndItemOn() {
        assertEquals(JumpLook.START, LobbyFeatures.jumpLook(true, true, true, false));
    }

    @Test
    void becomesStopDuringARun() {
        assertEquals(JumpLook.STOP, LobbyFeatures.jumpLook(true, true, true, true));
        // Auch wenn das Panel den Gegenstand gerade abschaltet: wer läuft, kann damit aufhören.
        assertEquals(JumpLook.STOP, LobbyFeatures.jumpLook(true, false, true, true));
    }

    @Test
    void greyWhenJumpAndRunIsClosed() {
        assertEquals(JumpLook.CLOSED, LobbyFeatures.jumpLook(true, true, false, false));
    }

    @Test
    void goneWhenSwitchedOffOrBeforeSettings() {
        assertEquals(JumpLook.NONE, LobbyFeatures.jumpLook(true, false, true, false));
        assertEquals(JumpLook.NONE, LobbyFeatures.jumpLook(false, true, true, false));
    }

    @Test
    void slotNextToTheCompassAndNotTheReturnOffer() {
        assertEquals(1, LobbyFeatures.JUMP_SLOT);
        assertNotEquals(4, LobbyFeatures.JUMP_SLOT);
    }
}
