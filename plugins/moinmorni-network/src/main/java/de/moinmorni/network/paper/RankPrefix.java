package de.moinmorni.network.paper;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;

/**
 * Rang vor dem Namen in der Tab-Liste und über dem Kopf. Mit Rang-Abzeichen ist er eine Übersetzung mit dem Schlüssel
 * „Symbol + Leerzeichen“ („♛ “, packages/shared/src/badges.ts): Clients mit dem Abzeichen-Paket zeigen das
 * Pixel-Schild, alle anderen kennen den Schlüssel nicht und zeigen ihn selbst – also Symbol und Farbe wie bisher
 * (auch Bedrock über Geyser und alte Clients). So sieht jeder Betrachter das Richtige, ohne dass der Server wissen
 * muss, wer das Paket hat. Spielmodi, die die Teams des Netzwerks in ihre eigenen Leisten übernehmen, bekommen das
 * Abzeichen gleich mit.
 */
final class RankPrefix {

    private RankPrefix() {
    }

    /**
     * {@code badge}: Schlüssel vom Hub (null = Abzeichen aus, leer = Rang ohne Symbol); sonst wie früher das Symbol.
     */
    static Component of(String badge, String symbol, TextColor colour) {
        if (badge != null) {
            return Component.translatable(badge, colour);
        }
        return symbol == null || symbol.isEmpty() ? Component.empty() : Component.text(symbol + " ", colour);
    }

    /** Eintrag in der Tab-Liste: Rang und Name nebeneinander (der Name nicht als Teil der Übersetzung). */
    static Component listName(Component prefix, String name, TextColor colour) {
        return Component.textOfChildren(prefix, Component.text(name, colour));
    }
}
