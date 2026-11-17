package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextComponent;
import net.kyori.adventure.text.TranslatableComponent;
import net.kyori.adventure.text.TranslationArgument;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.junit.jupiter.api.Test;

/**
 * Rang-Abzeichen auf dem Spielserver: Tab-Liste und über dem Kopf (RankPrefix) und die Chat-Zeilen des Hubs
 * (MiniMessage aus apps/server/src/hub/badges.ts).
 */
class RankPrefixTest {

    private static final TextColor RED = TextColor.fromHexString("#ff5555");
    private static final MiniMessage MM = MiniMessage.miniMessage();

    @Test
    void withBadgesTheRankIsATranslationOfItsSymbol() {
        Component prefix = RankPrefix.of("♛ ", "♛", RED);
        TranslatableComponent t = assertInstanceOf(TranslatableComponent.class, prefix);
        assertEquals("♛ ", t.key());
        assertEquals(RED, t.color());
        // Ohne Symbol (Spieler): leerer Schlüssel – ohne Paket steht da nichts, mit Paket das Schild.
        assertEquals("", assertInstanceOf(TranslatableComponent.class, RankPrefix.of("", "", RED)).key());
    }

    @Test
    void withoutBadgesTheSymbolStaysAsBefore() {
        assertEquals(Component.text("♛ ", RED), RankPrefix.of(null, "♛", RED));
        assertEquals(Component.empty(), RankPrefix.of(null, "", RED));
        assertEquals(Component.empty(), RankPrefix.of(null, null, RED));
    }

    @Test
    void theNameIsNotPartOfTheTranslation() {
        Component name = RankPrefix.listName(RankPrefix.of("♛ ", "♛", RED), "Philip", RED);
        List<Component> parts = name.children();
        assertEquals(2, parts.size());
        assertInstanceOf(TranslatableComponent.class, parts.get(0));
        assertTrue(parts.get(0).children().isEmpty());
        assertEquals("Philip", assertInstanceOf(TextComponent.class, parts.get(1)).content());
    }

    @Test
    void chatLinesFromTheHubBecomeTranslations() {
        Component line = MM.deserialize("<dark_gray>[</dark_gray><gray>Lobby</gray><dark_gray>]</dark_gray> "
                + "<#ff5555><lang:'♛ '/></#ff5555><#ff5555>Philip</#ff5555> <dark_gray>»</dark_gray> <white>Servus");
        TranslatableComponent rank = line.children().stream()
                .filter(TranslatableComponent.class::isInstance).map(TranslatableComponent.class::cast)
                .findFirst().orElseThrow();
        assertEquals("♛ ", rank.key());
        assertEquals(RED, rank.color());
        assertTrue(rank.children().isEmpty(), "der Name hängt nicht an der Übersetzung");
        // Ein ' im Symbol: im Hub mit \ geschützt.
        Component quoted = MM.deserialize("<lang:'it\\'s '/>");
        assertEquals("it's ", assertInstanceOf(TranslatableComponent.class, quoted).key());
    }

    @Test
    void jailLinesKeepTheirOldLookWithoutThePack() {
        Component line = MM.deserialize("<lang:'%1$s%2$s%3$s ':'<dark_gray>[':'<gray>⛓ Gefängnis':'<dark_gray>]'/>"
                + "<gray>Lena</gray> <dark_gray>»</dark_gray> <white>Hallo");
        TranslatableComponent jail = line.children().stream()
                .filter(TranslatableComponent.class::isInstance).map(TranslatableComponent.class::cast)
                .findFirst().orElseThrow();
        assertEquals("%1$s%2$s%3$s ", jail.key());
        List<TranslationArgument> args = jail.arguments();
        assertEquals(3, args.size());
        assertEquals("[", PlainTextComponentSerializer.plainText().serialize(args.get(0).asComponent()));
        assertEquals("⛓ Gefängnis", PlainTextComponentSerializer.plainText().serialize(args.get(1).asComponent()));
        assertEquals(TextColor.fromHexString("#555555"), args.get(0).asComponent().color());
    }

    @Test
    void modesThatPaintThemselvesGetTheKeyAsMetadata() {
        // MorniCraft liest genau diesen Namen (de.mornihosting.mornicraft.Network.BADGE).
        assertEquals("moinmorni:badge", RankPrefix.META);
        assertEquals("♛ ", RankPrefix.metaValue("♛ "));
        assertEquals("", RankPrefix.metaValue(""));
        assertEquals(null, RankPrefix.metaValue(null));
    }
}
