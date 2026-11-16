package net.morni.api;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.RegisteredServiceProvider;

/**
 * Schnittstelle des Netzwerks morni.net für Spielmodi (Duels, Morni Party …). Das Netzwerk-Plugin („MorniNet“) stellt
 * sie als Bukkit-Dienst bereit; ein Modus-Plugin holt sie mit {@link #get()} und braucht in seiner plugin.yml
 * {@code depend: [MorniNet]} (oder {@code softdepend}, wenn es auch allein laufen soll).
 *
 * <p>Ändert sich diese Datei, müssen die Kopien in den Modus-Repos gleich bleiben (Paket {@code net.morni.api},
 * dort nur zum Übersetzen, nicht in die Jar).
 */
public interface MorniNet {

    /** Version dieser Schnittstelle; neue Methoden erhöhen sie. */
    int API_VERSION = 1;

    /** Das Netzwerk, falls das Netzwerk-Plugin läuft. */
    static Optional<MorniNet> get() {
        RegisteredServiceProvider<MorniNet> r = Bukkit.getServicesManager().getRegistration(MorniNet.class);
        return r == null ? Optional.empty() : Optional.of(r.getProvider());
    }

    /** Name dieses Servers im Netzwerk, z. B. „duels“. */
    String serverName();

    /** Ist der Hub gerade verbunden? Ohne Hub läuft der Modus allein weiter (Statistiken gehen dann verloren). */
    boolean online();

    /** Sprache des Spielers: „de“ oder „en“ (aus dem Client oder /sprache). */
    String language(UUID player);

    /** Rang des Spielers (Owner, Moderator, VIP, Spieler …). */
    Rank rank(UUID player);

    /** Hat der Rang dieses Recht (z. B. „build“, „teleport“, „bigger-party“)? */
    boolean hasRight(UUID player, String right);

    /** Party des Spielers – leer ohne Party (oder ohne Hub). */
    CompletableFuture<Optional<Party>> party(UUID player);

    /**
     * Statistiken melden (nur für den eigenen Modus, den Rest lehnt der Hub ab). Werte: kleine Buchstaben, Ziffern,
     * Unterstrich, z. B. „wins“, „kills“, „best_time_ms“.
     *
     * @param add  hochzählen (Siege, Kills …)
     * @param best Bestwerte: übernommen nur, wenn besser ({@code lowerIsBetter} für Zeiten)
     */
    void stats(String mode, UUID player, Map<String, Long> add, Map<String, Long> best, boolean lowerIsBetter);

    /** Zustand melden (Lobby-Figur, Webseite): z. B. „waiting“, „running“, „full“. */
    void state(String mode, String state, int players);

    /** Spieler zurück in die Lobby schicken. */
    void toLobby(Player player);

    /** Rang eines Spielers. Farbe als „#rrggbb“; Symbol kann leer sein. */
    record Rank(String id, String symbol, String colour, int position) {
    }

    /** Party: Anführer und alle Mitglieder (mit ihrem Server, null = gerade beim Wechseln). */
    record Party(UUID leader, java.util.List<Member> members) {
        public record Member(UUID uuid, String name, String server) {
        }
    }
}
