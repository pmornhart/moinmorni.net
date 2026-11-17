package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class LobbyCommandsTest {
    @Test
    void treeShowsOnlyTheGermanMainNames() {
        List<String> names = new ArrayList<>(List.of("fliegen", "fly", "moinmorni:fliegen", "moinmorni:fly",
                "rundgang", "tour", "jnr", "jumpandrun", "parkour", "moinmorni:jnr", "gamemode", "morniduels:duels"));
        LobbyCommands.tidy(names);
        assertEquals(List.of("fliegen", "rundgang", "jnr", "gamemode", "morniduels:duels"), names);
    }

    @Test
    void stopWordsKeepWorking() {
        assertTrue(LobbyCommands.STOP.contains("stopp"));
        assertTrue(LobbyCommands.STOP.contains("stop"));
        assertFalse(LobbyCommands.hidden("FLIEGEN"));
        assertTrue(LobbyCommands.hidden("FLY"));
    }
}
