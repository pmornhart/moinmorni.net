package de.moinmorni.network.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.google.gson.JsonArray;
import java.util.List;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.junit.jupiter.api.Test;

class StreamerMaskTest {

    private static String plain(Component c) {
        return PlainTextComponentSerializer.plainText().serialize(c);
    }

    @Test
    void ipAdressenWerdenVerdecktVersionsnummernUndUhrzeitenNicht() {
        StreamerMask mask = new StreamerMask();
        Component in = Component.text("Server 85.215.54.143:25565, v6 2001:db8::1, Version 1.21.11 um 12:30:45");
        assertEquals("Server •••, v6 •••, Version 1.21.11 um 12:30:45", plain(mask.apply(in)));
    }

    @Test
    void eigeneAdressenMitAllemDavorUndPort() {
        StreamerMask mask = new StreamerMask();
        JsonArray hosts = new JsonArray();
        hosts.add("moinmorni.net");
        hosts.add(" Example.DE ");
        mask.hosts(hosts);
        Component in = Component.text("Komm auf play.moinmorni.net:25566 oder EXAMPLE.de/hilfe – nicht moinmorni.network");
        assertEquals("Komm auf ••• oder •••/hilfe – nicht moinmorni.network", plain(mask.apply(in)));
        mask.hosts(List.of());
        assertEquals("moinmorni.net", plain(mask.apply(Component.text("moinmorni.net"))));
    }

    @Test
    void verschachtelteTexteUndMauszeiger() {
        StreamerMask mask = new StreamerMask();
        Component hover = Component.text("geheim ").append(Component.text("10.0.0.5"));
        Component in = Component.text("IP: ").append(Component.text("10.0.0.5").hoverEvent(HoverEvent.showText(hover)));
        Component out = mask.apply(in);
        assertEquals("IP: •••", plain(out));
        // Was nur mit der Maus zu lesen ist (verdeckte /msg), bleibt dort lesbar – ohne Adressen.
        assertEquals("geheim •••", plain((Component) out.children().get(0).hoverEvent().value()));
    }
}
