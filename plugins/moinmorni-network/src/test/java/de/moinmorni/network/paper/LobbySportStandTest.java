package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.gson.JsonParser;
import java.util.List;
import org.bukkit.Material;
import org.junit.jupiter.api.Test;

/** Sport-Stand: Merker lesen, richtigen Umbau wählen, Kompass nur mit dem Modus am Stand. */
class LobbySportStandTest {

    /** So schickt der Hub den Stand (features.sport aus dem Baukasten). */
    private static final String SPOT = """
            {"host":"wintersport","modes":["wintersport","sommerspiele"],"sentinel":[-26,62,-33],
             "blocks":{"wintersport":"packed_ice","sommerspiele":"sandstone"},"center":[-25.5,65,-31.5],"radius":8,
             "functions":{"on":"sport/sommerspiele_on","off":"sport/sommerspiele_off",
               "show":{"wintersport":"sport/wintersport","sommerspiele":"sport/sommerspiele"}}}""";

    private static LobbySportStand.Spot spot() {
        return LobbySportStand.parse(JsonParser.parseString(SPOT).getAsJsonObject());
    }

    @Test
    void merkerSagtWelcherStandSteht() {
        LobbySportStand.Spot s = spot();
        assertEquals("wintersport", LobbySportStand.builtLook(s, Material.PACKED_ICE));
        assertEquals("sommerspiele", LobbySportStand.builtLook(s, Material.SANDSTONE));
        // Lobby noch nicht (neu) gebaut: nichts anfassen
        assertNull(LobbySportStand.builtLook(s, Material.DIRT));
        assertEquals("sport/sommerspiele", s.show().get("sommerspiele"));
    }

    @Test
    void umbauNurWennNoetigUndInDieRichtigeRichtung() {
        LobbySportStand.Spot s = spot();
        assertEquals("sport/sommerspiele_on", LobbySportStand.blockStep(s, "wintersport", "sommerspiele"));
        assertEquals("sport/sommerspiele_off", LobbySportStand.blockStep(s, "sommerspiele", "wintersport"));
        assertNull(LobbySportStand.blockStep(s, "wintersport", "wintersport"));
        assertNull(LobbySportStand.blockStep(s, null, "sommerspiele"));
        assertNull(LobbySportStand.blockStep(s, "wintersport", "duels"));
    }

    @Test
    void kompassNurMitDemModusAmStand() {
        List<LobbyNpcs.ModeInfo> all = List.of(info("duels", null), info("wintersport", "summer"),
                info("sommerspiele", null));
        assertEquals(List.of("duels", "sommerspiele"),
                LobbyNpcs.compassModes(all, "sommerspiele").stream().map(LobbyNpcs.ModeInfo::id).toList());
        assertEquals(List.of("duels", "wintersport"),
                LobbyNpcs.compassModes(all, "wintersport").stream().map(LobbyNpcs.ModeInfo::id).toList());
        assertEquals(3, LobbyNpcs.compassModes(all, null).size());
    }

    @Test
    void winterpauseAufDemSchild() {
        LobbyNpcs.ModeInfo m = info("sommerspiele", "winter");
        LobbyNpcs.LabelText de = LobbyNpcs.labelText(m, "sommerspiele", "de", null);
        assertEquals("❄ Winterpause", plain(de.state()));
        assertEquals("Rechtsklick: Dorf anschauen", plain(de.hint()));
        assertEquals("❄ Winter break", plain(LobbyNpcs.labelText(m, "sommerspiele", "en", null).state()));
    }

    private static LobbyNpcs.ModeInfo info(String id, String pause) {
        return new LobbyNpcs.ModeInfo(id, id, id, "on", "everyone", 0, true, true, "sunflower",
                pause == null ? null : "closed", pause);
    }

    private static String plain(net.kyori.adventure.text.Component c) {
        return net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer.plainText().serialize(c);
    }

}
