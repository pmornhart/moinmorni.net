package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Rang-Rechte → Rechte auf dem Spielserver: Befehle, Spielmodi verwalten, Alles, Kreativ nur mit eigenem Recht. */
class RightsTest {

    /** Was ein Modus-Server so kennt: Rechte eines Modus, von Simple Voice Chat, von Paper und Minecraft-Befehle. */
    private static final List<Rights.Known> SERVER = List.of(
            new Rights.Known("moinmorni.party.admin", true, true),
            new Rights.Known("moinmorni.party.spielen", false, true),
            new Rights.Known("gipfelsturm.admin", true, true),
            new Rights.Known("voicechat.admin", true, false),
            new Rights.Known("voicechat.speak", true, false),
            new Rights.Known("worldedit.secret", false, false),
            new Rights.Known("bukkit.command.reload", true, false),
            new Rights.Known("minecraft.command.gamemode", true, false),
            new Rights.Known("minecraft.command.give", true, false));

    @Test
    void befehleDesTeams() {
        assertEquals(Set.of("minecraft.command.teleport", "minecraft.command.tp", "minecraft.command.spectate",
                        "minecraft.command.gamemode"),
                Rights.nodes(Set.of("warn", "mute", "teleport", "spectate", "inspect"), SERVER));
        assertEquals(Set.of(), Rights.nodes(Set.of(), SERVER));
        // Strafen und Ränge sind Befehle des Netzwerks – auf dem Server gibt es dafür nichts.
        assertEquals(Set.of(), Rights.nodes(Set.of("kick", "ban", "jail", "ranks"), SERVER));
    }

    @Test
    void spielmodiVerwaltenGibtNurDieAdminRechteDerModi() {
        Set<String> nodes = Rights.nodes(Set.of("modes-admin"), SERVER);
        assertEquals(Set.of("moinmorni.party.admin", "gipfelsturm.admin"), nodes);
        // Admin-Rechte anderer Plugins (Sprachchat) gehören nicht dazu.
        assertFalse(nodes.contains("voicechat.admin"));
    }

    @Test
    void allesGibtWasEinOperatorHaette() {
        Set<String> nodes = Rights.nodes(Set.of("admin"), SERVER);
        assertTrue(nodes.containsAll(Set.of("moinmorni.party.admin", "gipfelsturm.admin", "voicechat.admin",
                "bukkit.command.reload", "minecraft.command.gamemode", "minecraft.command.give")));
        // Was auch ein Operator nicht von selbst hat, bleibt aus.
        assertFalse(nodes.contains("worldedit.secret"));
        assertFalse(nodes.contains("moinmorni.party.spielen"));
    }

    @Test
    void spielmodusErkennen() {
        assertTrue(Rights.isMode("MorniParty", List.of(), List.of("MoinMorni")));
        assertTrue(Rights.isMode("MorniDuels", List.of("MorniNet"), List.of()));
        assertFalse(Rights.isMode("voicechat", List.of(), List.of()));
        assertFalse(Rights.isMode("MoinMorni", List.of(), List.of("voicechat")));
    }

    @Test
    void rechtEinesBefehls() {
        assertEquals(List.of(), Rights.split(null));
        assertEquals(List.of(), Rights.split(" "));
        assertEquals(List.of("a.admin", "b.admin"), Rights.split("a.admin; b.admin"));
    }

    @Test
    void kreativNurMitEigenemRecht() {
        assertTrue(Rights.asksCreative("/gamemode creative"));
        assertTrue(Rights.asksCreative("/minecraft:gamemode Creative Lena"));
        assertTrue(Rights.asksCreative("/GAMEMODE c"));
        assertFalse(Rights.asksCreative("/gamemode spectator"));
        assertFalse(Rights.asksCreative("/gamemode"));
        assertFalse(Rights.asksCreative("/gamerule creative"));
        assertTrue(Rights.mayCreative(Set.of("creative")));
        assertTrue(Rights.mayCreative(Set.of("admin")));
        assertFalse(Rights.mayCreative(Set.of("spectate", "gamemode")));
    }

    @Test
    void lobbyBearbeiten() {
        assertTrue(Rights.mayEditLobby(Set.of("lobby-edit")));
        assertTrue(Rights.mayEditLobby(Set.of("admin")));
        assertFalse(Rights.mayEditLobby(Set.of("build", "creative")));
    }
}
