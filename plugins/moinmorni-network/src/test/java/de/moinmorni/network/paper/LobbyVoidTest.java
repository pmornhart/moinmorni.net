package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Gebautes Gelände der Lobby: Radius 216 (datapack.ts) = Stücke −14 … 13 in beide Richtungen. */
class LobbyVoidTest {
    @Test
    void geländeBleibtDahinterLeer() {
        assertFalse(LobbyVoid.outside(-14, -14));
        assertFalse(LobbyVoid.outside(13, 13));
        assertFalse(LobbyVoid.outside(0, -14));
        assertTrue(LobbyVoid.outside(-15, 0));
        assertTrue(LobbyVoid.outside(0, 14));
        // −216 und 216 liegen in den Randstücken
        assertFalse(LobbyVoid.outside(Math.floorDiv(-216, 16), Math.floorDiv(216, 16)));
    }
}
