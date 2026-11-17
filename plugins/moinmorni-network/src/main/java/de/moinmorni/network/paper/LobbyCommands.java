package de.moinmorni.network.paper;

import java.util.Collection;
import java.util.Locale;
import java.util.Set;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerCommandSendEvent;

/**
 * Befehle des Netzwerk-Plugins auf dem Spielserver: im Befehlsbaum (Tab-Vorschläge) steht je Befehl nur ein Name –
 * der deutsche Hauptname (/fliegen, /rundgang, /jnr). Aliase (/fly, /tour, /jumpandrun, /parkour) und die Namen mit
 * Präfix (/moinmorni:fliegen) fehlen dort, funktionieren aber weiter, wenn man sie tippt.
 */
final class LobbyCommands implements Listener {
    /** Präfix, unter dem Bukkit unsere Befehle zusätzlich anmeldet. */
    static final String PREFIX = "moinmorni:";
    /** Aliase, die nicht in den Tab-Vorschlägen stehen sollen. */
    static final Set<String> HIDDEN = Set.of("fly", "tour", "jumpandrun", "parkour");
    /** Wörter für „beenden“ (/rundgang stopp, /jnr stopp) – alte und englische gehen weiter. */
    static final Set<String> STOP = Set.of("stopp", "stop", "aus", "ende", "off");

    /** Gehört der Name nicht in die Tab-Vorschläge? */
    static boolean hidden(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return n.startsWith(PREFIX) || HIDDEN.contains(n);
    }

    static void tidy(Collection<String> names) {
        names.removeIf(LobbyCommands::hidden);
    }

    @EventHandler
    public void onCommandSend(PlayerCommandSendEvent event) {
        tidy(event.getCommands());
    }
}
