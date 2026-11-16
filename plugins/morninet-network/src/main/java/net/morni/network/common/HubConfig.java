package net.morni.network.common;

import com.google.gson.Gson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Wo der Hub steht und wer wir sind – morni.net schreibt das über den Motor in plugins/morninet/hub.json.
 * Der Schlüssel gehört nur diesem Server.
 */
public record HubConfig(String url, String server, String kind, String key) {

    public static final String FILE = "hub.json";

    public static HubConfig load(Path dir) throws IOException {
        Path file = dir.resolve(FILE);
        HubConfig config = new Gson().fromJson(Files.readString(file, StandardCharsets.UTF_8), HubConfig.class);
        if (config == null || config.url == null || config.server == null || config.key == null || config.kind == null) {
            throw new IOException(file + " ist unvollständig (url, server, kind, key)");
        }
        return config;
    }
}
