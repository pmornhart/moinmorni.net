package de.moinmorni.network.common;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextReplacementConfig;
import net.kyori.adventure.text.event.HoverEvent;

/**
 * Streamer-Modus (/streamer, Hub): Für Streamer werden IP-Adressen und die eigenen Adressen des Netzwerks zu „•••“ –
 * beim Empfänger, im Chat (Spielserver) und in Nachrichten des Hubs (Proxy). Gleiche Regeln wie MorniCraft
 * ({@code Streamer.forViewer}). Die Adressen schickt der Hub ({@code streamer-config}).
 */
public final class StreamerMask {

    public static final String MASK = "•••";
    /**
     * IPv4, auch mit Port: „85.215.54.143“, „10.0.0.5:25565“ – nicht „1.21.11“ (nur drei Teile).
     * https://regex101.com/?flavor=java&regex=%5Cb(%3F%3A%5Cd%7B1%2C3%7D%5C.)%7B3%7D%5Cd%7B1%2C3%7D(%3F%3A%3A%5Cd%7B1%2C5%7D)%3F%5Cb&testString=85.215.54.143%201.21.11
     */
    private static final Pattern IPV4 = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d{1,5})?\\b");
    /**
     * IPv6, ganz („2001:db8:0:0:0:0:0:1“) oder mit „::“ gekürzt („2001:db8::1“) – keine Uhrzeit wie „12:30:45“.
     * https://regex101.com/?flavor=java&regex=(%3Fi)%5Cb(%3F%3A%5B0-9a-f%5D%7B1%2C4%7D%3A)%7B7%7D%5B0-9a-f%5D%7B1%2C4%7D%5Cb%7C%5Cb%5B0-9a-f%5D%7B1%2C4%7D(%3F%3A%3A%5B0-9a-f%5D%7B1%2C4%7D)*%3A%3A(%3F%3A%5B0-9a-f%5D%7B1%2C4%7D(%3F%3A%3A%5B0-9a-f%5D%7B1%2C4%7D)*)%3F&testString=2001%3Adb8%3A%3A1%2012%3A30%3A45
     */
    private static final Pattern IPV6 = Pattern.compile(
            "(?i)\\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\\b|\\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?");

    /** Die eigenen Namen (z. B. moinmorni.net) mit allem davor und Port dahinter; null, wenn es keine gibt. */
    private volatile Pattern hosts;

    /** Neue Adressen vom Hub ({@code streamer-config}, Feld {@code hosts}). */
    public void hosts(JsonArray list) {
        List<String> names = new ArrayList<>();
        if (list != null) {
            for (JsonElement e : list) {
                String name = e.getAsString().trim().toLowerCase(Locale.ROOT);
                if (!name.isEmpty() && !names.contains(name)) {
                    names.add(name);
                }
            }
        }
        hosts(names);
    }

    /**
     * Die eigenen Namen: „moinmorni.net“ deckt auch „play.moinmorni.net:25566“ ab, aber nicht „moinmorni.network“ oder
     * „xmoinmorni.net“ (der Name muss für sich stehen).
     */
    public void hosts(List<String> names) {
        hosts = names.isEmpty() ? null : Pattern.compile("(?i)(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*(?:"
                + names.stream().map(Pattern::quote).collect(Collectors.joining("|")) + ")(?::\\d{1,5})?(?![a-z0-9-])");
    }

    /**
     * Text, wie ihn ein Streamer sehen darf: IP-Adressen und die eigenen Adressen als „•••“ – auch im Text unter dem
     * Mauszeiger (eine verdeckte /msg zeigt den Text dort, aber ohne Adressen; manche Fassungen von Adventure machen das
     * beim Ersetzen schon selbst, andere nicht).
     */
    public Component apply(Component text) {
        Component out = mask(text, IPV4);
        out = mask(out, IPV6);
        Pattern own = hosts;
        return inHover(own == null ? out : mask(out, own));
    }

    private Component inHover(Component c) {
        Component out = c;
        HoverEvent<?> hover = c.hoverEvent();
        if (hover != null && hover.action() == HoverEvent.Action.SHOW_TEXT && hover.value() instanceof Component shown) {
            out = out.hoverEvent(HoverEvent.showText(apply(shown)));
        }
        List<Component> children = new ArrayList<>();
        for (Component child : c.children()) {
            children.add(inHover(child));
        }
        return out.children(children);
    }

    private static Component mask(Component text, Pattern pattern) {
        return text.replaceText(TextReplacementConfig.builder().match(pattern).replacement(MASK).build());
    }
}
