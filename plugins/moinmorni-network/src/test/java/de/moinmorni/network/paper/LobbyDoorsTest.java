package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bukkit.Material;
import org.junit.jupiter.api.Test;

class LobbyDoorsTest {

    @Test
    void movableBlocks() {
        assertTrue(LobbyDoors.movable(Material.OAK_DOOR));
        assertFalse(LobbyDoors.movable(Material.SPRUCE_TRAPDOOR));
        assertTrue(LobbyDoors.movable(Material.BIRCH_FENCE_GATE));
        assertTrue(LobbyDoors.movable(Material.LEVER));
        assertTrue(LobbyDoors.movable(Material.STONE_BUTTON));
        assertFalse(LobbyDoors.movable(Material.IRON_DOOR));
        assertFalse(LobbyDoors.movable(Material.IRON_TRAPDOOR));
        assertFalse(LobbyDoors.movable(Material.CHEST));
        assertFalse(LobbyDoors.movable(Material.STONE));
    }

    @Test
    void resetAfterQuietTime() {
        assertFalse(LobbyDoors.due(0, 29_999, 30));
        assertTrue(LobbyDoors.due(0, 30_000, 30));
        assertFalse(LobbyDoors.due(0, 1_000_000, 0));
    }
}
