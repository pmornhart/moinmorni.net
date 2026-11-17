package de.moinmorni.network.paper;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Rang-Rechte des Netzwerks → Rechte auf diesem Spielserver. So wirkt ein Rang auf jedem Server so, wie er im Panel
 * steht:
 * <ul>
 *   <li>Teleport, Zuschauen und Spielmodus als Minecraft-Befehle – Kreativ aber nur mit dem Recht „creative“
 *       (Minecraft kennt für /gamemode nur ein Recht, darum hält {@link #asksCreative} den Rest auf),</li>
 *   <li>„modes-admin“ (Spielmodi verwalten): die Verwaltungs-Rechte der Spielmodi auf diesem Server – jedes Recht eines
 *       Modus-Plugins, das auf „.admin“ endet (z. B. moinmorni.party.admin, gipfelsturm.admin, morni.smp.admin). Ein
 *       Modus ist ein Plugin, das sich ans Netzwerk hängt (depend/softdepend auf das Netzwerk-Plugin); eine feste Liste
 *       gibt es nicht, neue Modi sind von selbst dabei,</li>
 *   <li>„admin“ (Alles, nur Owner): alles, was ein Operator über Rechte bekäme – jedes Recht mit Standard „op“ oder
 *       „true“ und die Rechte aller Befehle (auch Minecrafts eigene). OP selbst vergibt das Plugin dafür nicht: nichts
 *       bleibt in der ops.json liegen, ein entzogener Rang wirkt sofort, und der Motor (MorniHosting) kann seine
 *       eigenen OPs für verbundene Team-Konten weiter selbst verwalten.</li>
 * </ul>
 * Strafen, Ränge, Sprachchat und Party sind Befehle des Netzwerks (der Hub prüft sie) – dafür braucht es hier nichts.
 * Ohne Bukkit, damit es sich ohne Server prüfen lässt (RightsTest).
 */
final class Rights {

    static final String MODES_ADMIN = "modes-admin";
    static final String EVERYTHING = "admin";
    static final String CREATIVE = "creative";
    static final String LOBBY_EDIT = "lobby-edit";
    /** In der Lobby fliegen statt doppelt springen (ab VIP, {@code LobbyDoubleJump}). */
    static final String LOBBY_FLY = "lobby-fly";
    /** Das Netzwerk-Plugin unter seinem Namen und dem Zwischen-Namen (ältere Modus-Jars hängen sich noch daran). */
    static final Set<String> NETWORK_PLUGINS = Set.of("MoinMorni", "MorniNet");
    private static final String ADMIN_SUFFIX = ".admin";
    private static final String GAMEMODE = "minecraft.command.gamemode";
    /** Was „Kreativ“ bei /gamemode heißen kann (auch die alten Kürzel, falls ein Plugin sie noch annimmt). */
    private static final Set<String> CREATIVE_WORDS = Set.of("creative", "c", "1");
    private static final String PERMISSION_SEPARATOR = ";";
    /** Ursache „Spielmodus-Umschalter“ (F3+F4) in PlayerGameModeChangeEvent. */
    private static final String SWITCHER = "GAMEMODE_SWITCHER";

    /** Rang-Recht → Minecraft-Befehle. */
    static final Map<String, List<String>> COMMANDS = Map.of(
            "teleport", List.of("minecraft.command.teleport", "minecraft.command.tp"),
            "spectate", List.of("minecraft.command.spectate", GAMEMODE),
            "gamemode", List.of(GAMEMODE),
            CREATIVE, List.of(GAMEMODE));

    /**
     * Ein Recht, das der Server kennt.
     *
     * @param operator hätte ein Operator es (Standard „op“ oder „true“, oder Recht eines Befehls)
     * @param mode     gehört es einem Spielmodus
     */
    record Known(String node, boolean operator, boolean mode) {
    }

    private Rights() {
    }

    /** Die Rechte, die ein Spieler mit diesen Rang-Rechten auf diesem Server bekommt. */
    static Set<String> nodes(Set<String> rights, Collection<Known> known) {
        Set<String> out = new TreeSet<>();
        rights.forEach(r -> out.addAll(COMMANDS.getOrDefault(r, List.of())));
        boolean everything = rights.contains(EVERYTHING);
        if (everything || rights.contains(MODES_ADMIN)) {
            out.addAll(modeAdmins(known));
        }
        if (everything) {
            known.stream().filter(Known::operator).map(Known::node).forEach(out::add);
        }
        return out;
    }

    /** Die Verwaltungs-Rechte der Spielmodi auf diesem Server („Spielmodi verwalten“). */
    static Set<String> modeAdmins(Collection<Known> known) {
        return known.stream()
                .filter(k -> k.mode() && k.node().toLowerCase(Locale.ROOT).endsWith(ADMIN_SUFFIX))
                .map(Known::node)
                .collect(Collectors.toCollection(TreeSet::new));
    }

    /** Hängt sich dieses Plugin ans Netzwerk (dann ist es ein Spielmodus)? */
    static boolean isMode(String name, Collection<String> depend, Collection<String> softDepend) {
        return !NETWORK_PLUGINS.contains(name)
                && (depend.stream().anyMatch(NETWORK_PLUGINS::contains)
                || softDepend.stream().anyMatch(NETWORK_PLUGINS::contains));
    }

    /** Das Recht eines Befehls, wie Bukkit es schreibt: leer, eins oder mehrere mit „;“ getrennt. */
    static List<String> split(String permission) {
        if (permission == null || permission.isBlank()) {
            return List.of();
        }
        return Arrays.stream(permission.split(PERMISSION_SEPARATOR))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    /** Darf in den Kreativmodus: Recht „Kreativmodus“ oder „Alles“. */
    static boolean mayCreative(Set<String> rights) {
        return rights.contains(CREATIVE) || rights.contains(EVERYTHING);
    }

    /** Darf in der Lobby bauen (im Kreativmodus): Recht „Lobby bearbeiten“ oder „Alles“. */
    static boolean mayEditLobby(Set<String> rights) {
        return rights.contains(LOBBY_EDIT) || rights.contains(EVERYTHING);
    }

    /**
     * Wechsel über den Spielmodus-Umschalter (F3+F4): Paper lässt ihn schon mit dem Recht für /gamemode zu – also auch mit
     * „Zuschauen“ oder „Spielmodus wechseln“ –, und dabei läuft kein Befehl, den {@link #asksCreative} sehen könnte.
     * In den Kreativmodus darf er nur mit eigenem Recht. {@code cause} = Name der Ursache des Wechsels (als Text, damit
     * es auch auf Paper-Fassungen ohne diese Ursache läuft).
     */
    static boolean blocksSwitcher(String cause, boolean toCreative, Set<String> rights) {
        return SWITCHER.equals(cause) && toCreative && !mayCreative(rights);
    }

    /** Will diese Zeile in den Kreativmodus (/gamemode creative …, auch /minecraft:gamemode)? */
    static boolean asksCreative(String message) {
        String[] parts = message.trim().toLowerCase(Locale.ROOT).replaceFirst("^/", "").split("\\s+");
        if (parts.length < 2) {
            return false;
        }
        String label = parts[0].substring(parts[0].indexOf(':') + 1);
        return label.equals("gamemode") && CREATIVE_WORDS.contains(parts[1]);
    }
}
