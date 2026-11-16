package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.maxhenkel.voicechat.api.BukkitVoicechatService;
import de.moinmorni.network.common.HubClient;
import org.bukkit.plugin.java.JavaPlugin;

/** Eigene Klasse, damit Simple-Voice-Chat-Klassen nur geladen werden, wenn das Plugin wirklich da ist. */
final class VoiceSetup {

    private VoiceSetup() {
    }

    static Object register(JavaPlugin plugin, HubClient hub) {
        BukkitVoicechatService service = plugin.getServer().getServicesManager().load(BukkitVoicechatService.class);
        if (service == null) {
            return null;
        }
        org.bukkit.plugin.Plugin voicechat = plugin.getServer().getPluginManager().getPlugin("voicechat");
        java.nio.file.Path config = voicechat == null ? null
                : voicechat.getDataFolder().toPath().resolve("voicechat-server.properties");
        VoiceBridge bridge = new VoiceBridge(hub, plugin.getLogger(), config);
        service.registerPlugin(bridge);
        plugin.getLogger().info("Sprachchat-Brücke ist aktiv");
        return bridge;
    }

    static void apply(Object bridge, JsonObject config) {
        ((VoiceBridge) bridge).apply(config);
    }

    static void join(Object bridge, JsonObject message) {
        ((VoiceBridge) bridge).join(message);
    }
}
