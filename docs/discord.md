# Discord einrichten

MoinMorni hat einen eigenen Bot. Discord erlaubt Bots seit 2025 nicht mehr, selbst Server anzulegen – darum legst
du den Server einmal leer an und holst den Bot dazu. Den Rest macht der Bot.

## 1. Bot anlegen (einmal)

1. Öffne <https://discord.com/developers/applications> → **New Application** → Name „MoinMorni“.
2. Links **Bot** → **Reset Token** → Token kopieren. Er kommt in `install.sh` (Frage nach dem Bot-Token) oder
   später in die `.env` als `MM_DISCORD_TOKEN`. **Nie** in einen Chat oder ins Repo.
3. Auf derselben Seite unter **Privileged Gateway Intents** den Schalter **Server Members Intent** einschalten
   (sonst kann der Bot neue Mitglieder nicht begrüßen – alles andere geht trotzdem).
4. Ebenfalls unter **Bot**: **Public Bot** ausschalten. Dann kann nur du ihn auf einen Server holen. (Lädt ihn
   trotzdem jemand woanders ein, verlässt er diesen Server von selbst wieder – er gehört genau zu deinem.)

## 2. Server anlegen und Bot holen

1. In Discord einen neuen, leeren Server erstellen.
2. Im Panel unter **Discord** auf **Bot einladen** klicken (Link mit Administrator-Rechten) und den neuen Server
   wählen.
3. Im Panel **Server einrichten** klicken.

Der Bot legt dann an (vorhandene Rollen und Kanäle gleichen Namens werden übernommen, nichts doppelt):

- **Rollen** aus der Rollen-Vorlage (♛ Owner, ✦ Admin, ⚔ Moderator, ✚ Supporter, ⚒ Builder, ▶ Media, ★ VIP) mit Farbe und
  Rechten, dazu ✔ Verbunden, 🔇 Stumm und ⛓ Gefängnis.
- **Kanäle**: Info (Willkommen, Regeln, Ankündigungen, Status), Community, Hilfe mit Ticket-Knopf, Sprachkanäle wie
  im Spiel (Dorfplatz, Biergarten, Turnier), VIP-Lounge, Bauteam, Team (Chat, Log, Bewerbungen), Gefängnis.
- **Befehle** `/verbinden`, `/hilfe`, `/bewerben`, `/status` und den **Community-Modus** (Regel- und Update-Kanal).

## 3. Bewerben für MorniCraft mit Discord-Anmeldung (Webseite)

Auf `https://<deine Domain>/mornicraft/bewerben` melden sich Bewerber mit Discord an (nur Name und ID, sonst
nichts). Dafür einmal im [Developer Portal](https://discord.com/developers/applications) bei deiner Anwendung:

1. **OAuth2 → Redirects**: `https://<deine Domain>/api/public/apply/callback` eintragen und speichern.
2. **OAuth2 → Client Secret** zurücksetzen/kopieren und auf dem Rechner in die `.env` schreiben:
   `MM_DISCORD_CLIENT_SECRET=…` (nie in den Chat oder ins Repo), dann `docker compose up -d`.

Ohne das Geheimnis geht Bewerben trotzdem – im Discord mit `/bewerben` oder dem Knopf im Hilfe-Kanal.

Neue Bewerbungen landen in **#bewerbungen** mit den Knöpfen **Annehmen** und **Ablehnen** (dürfen alle aus dem
Team mit verbundenem Minecraft-Konto) und im Panel unter **Spieler → Bewerbungen**. Eine Zusage setzt den Namen auf
die Whitelist; die Person bekommt eine Direktnachricht (und im Spiel, wenn sie online ist). Ob Bewerbungen offen
sind und die Nachricht bei Zusage stellst du im Panel unter **Einstellungen → MorniCraft** ein.

## Was der Bot danach macht

- **Status**: Im Kanal 🟢・status steht immer, wer gerade spielt und welche Modi offen sind (jede Minute neu).
- **Konto verbinden**: Im Spiel `/discord` eingeben, dann in Discord `/verbinden <code>`. Danach hat man seinen Rang
  auch in Discord (ändert sich der Rang, zieht Discord nach).
- **Strafen gelten überall**: Bann im Spiel = Bann in Discord, Stumm = Timeout (über 28 Tage oder für immer: Rolle
  🔇 Stumm), alles landet im 📋・team-log.
- **Tickets**: Knopf in 🎫・hilfe öffnet einen privaten Thread nur für die Person und das Team.
- **Begrüßung** neuer Mitglieder in 👋・willkommen.
