# Discord einrichten

MoinMorni hat einen eigenen Bot. Discord erlaubt Bots seit 2025 nicht mehr, selbst Server anzulegen – darum legst
du den Server einmal leer an und holst den Bot dazu. Den Rest macht der Bot. Alles geht im Panel unter **Discord**;
dort steht dieselbe Anleitung Schritt für Schritt, und die Seite prüft alle 10 Sekunden, was schon geklappt hat.

## 1. Bot anlegen (einmal, im Developer Portal)

1. Öffne <https://discord.com/developers/applications> → **New Application** → Name „MoinMorni“.
2. Links **Bot** → **Reset Token** → Token kopieren. **Nie** in einen Chat, eine Nachricht oder ins Repo.
3. Auf derselben Seite unter **Privileged Gateway Intents** den Schalter **Server Members Intent** einschalten
   (sonst kann der Bot neue Mitglieder nicht begrüßen – alles andere geht trotzdem).
4. Ebenfalls unter **Bot**: **Public Bot** ausschalten. Dann kann nur du ihn auf einen Server holen. (Lädt ihn
   trotzdem jemand woanders ein, verlässt er diesen Server von selbst wieder – er gehört genau zu deinem.)
5. Unten auf **Save Changes**.

## 2. Token eintragen

Im Panel unter **Discord → Schritt 1** den Token einfügen und **Prüfen und speichern** drücken (nur der Owner).
MoinMorni fragt sofort bei Discord nach, wer der Bot ist – ein falscher Token wird gar nicht erst gespeichert, das
Panel sagt freundlich, was nicht stimmt. Gespeichert wird er **verschlüsselt** (mit `MM_SECRET`), danach zeigt das
Panel nur noch „gesetzt“ mit **Ersetzen** und **Entfernen** – den Wert selbst nie wieder, auch nicht in Antworten,
Protokollen oder Fehlermeldungen. Der Bot verbindet sich gleich danach neu.

Alternativ geht der Token wie bisher in die `.env` (`MM_DISCORD_TOKEN=…`, `install.sh` fragt danach). **Ein Wert in
der `.env` gilt immer**: Das Panel zeigt dann „aus der .env“ und lässt das Feld gesperrt – ändern oder entfernen
geht nur in der Datei (danach `docker compose up -d`).

## 3. Server anlegen und Bot einladen

1. In Discord links auf **+** → **Eigenen erstellen** – einen neuen, leeren Server.
2. Im Panel unter **Discord → Schritt 4** auf **Bot auf deinen Discord-Server holen** klicken und den neuen
   Server wählen.

Die Einladung fragt **nicht** nach Administrator, sondern genau nach den Rechten, die der Bot braucht:
Einladungen erstellen, Mitglieder bannen, Kanäle verwalten, **Server verwalten** (für das Server-Bild),
Reaktionen hinzufügen, Kanäle ansehen, Nachrichten senden, Nachrichten verwalten, Links einbetten, Verlauf lesen,
Sprachkanälen beitreten, Sprechen, Rollen verwalten, Threads verwalten, Private Threads erstellen, In Threads
schreiben, Mitglieder timeouten. Das Panel listet sie in Schritt 4 auf. Fehlt später ein Recht, sagt die Einrichtung
welches – einfach noch einmal über den Knopf einladen, Discord fragt dann nach den fehlenden.

**Wichtig:** Die Rolle des Bots (sie heißt wie der Bot) muss in Discord unter Servereinstellungen → Rollen **über**
allen Rängen stehen, die er vergeben soll. Rollen, die der Bot selbst anlegt, landen von allein darunter.

## 4. Server einrichten

Im Panel **Server einrichten** klicken (Schritt 5). Der Bot arbeitet die Schritte nacheinander ab, das Panel zeigt
jeden mit Häkchen und Zähler: Rechte prüfen → Rollen → Kategorien und Kanäle → Nachrichten → Befehle →
Community-Modus → Server-Bild. Bremst Discord (zu viele Änderungen pro Minute), wartet der Bot genau so lange, wie
Discord sagt, und das Panel zählt die Sekunden herunter.

Was der Bot anlegt:

- **Rollen** – aus der Rollen-Vorlage des Panels, in Reihenfolge und Farbe der Ränge, mit Symbol im Namen (Discord
  zeigt Rollen-Symbole erst ab Boost-Stufe 2): ♛ Owner, ✦ Admin, ⚔ Moderator, ✚ Supporter, ⚒ Builder, ▶ Media,
  ★ VIP – kommt eine Rolle in der Vorlage dazu, legt der nächste Abgleich sie an. Dazu 🤖 Bot, ✔ Verbunden,
  🔇 Stumm und ⛓ Gefängnis. Die Rechte passen zu den Rängen (Moderator: Nachrichten verwalten und Timeouts,
  Team-Bereich …). Das Recht „Administrator“ darf ein Bot nicht vergeben – das Panel erinnert daran, es der
  Owner-Rolle einmal selbst zu geben.
- **📢 Info** – 👋・willkommen (Bild aus `https://<Domain>/bilder/…`, Adresse für Java und Bedrock so, wie das
  Netzwerk gerade erreichbar ist), 📜・regeln (aus dem Panel, Einstellungen → Webseite), 📣・ankündigungen,
  📰・news (News von der Webseite), 🟢・status (eine Live-Nachricht je Modus), 🎮・spielmodi (mit Link zur
  Webseite). Nur lesen.
- **💬 Community** – 💬・chat, 📸・bilder-und-clips, 💡・vorschläge.
- **🎫 Hilfe** – ❓・hilfe (/hilfe und Knöpfe), 🎫・tickets (ein Knopf öffnet ein privates Gespräch – einen Thread – nur für die Person und das Team),
  📝・bewerbungen (Knöpfe fürs Team und für MorniCraft).
- **🔊 Sprache** – die gemeinsamen Sprachkanäle aus den Sprachchat-Einstellungen (Dorfplatz, Biergarten, Turnier …).
- **★ VIP**, **⚒ Bauteam** und **🛡 Team** (🛡・team-chat, 📋・team-log, 📥・bewerbungs-eingang, ⚖・strafen-log,
  Sprachkanal) – nur für die passenden Ränge.
- **⛓ Gefängnis** – wer eingesperrt ist, sieht nur noch diesen Kanal.
- **Befehle** `/verbinden`, `/hilfe`, `/bewerben`, `/status`, den **Community-Modus** und als **Server-Bild** das
  MoinMorni-Logo (nur, wenn es noch keins gibt – ein eigenes Bild bleibt).

**Nochmal abgleichen** geht jederzeit (z. B. nach neuen Rollen oder Sprachkanälen) und ist sicher:

- Der Bot merkt sich die IDs von allem, was er angelegt hat, und legt nichts doppelt an. Vorhandene Rollen und
  Kanäle gleichen Namens übernimmt er beim ersten Mal.
- Was du in Discord selbst umbenannt, umgefärbt oder verschoben hast, bleibt so (das Panel nennt es „so gelassen“).
- Was er nicht selbst angelegt hat, ändert und löscht er nie. Eigene Rechte-Einträge an Kanälen bleiben stehen.

## 5. Aussehen

Unter **Discord → Aussehen**:

- **Server-Bild** – Bild hochladen (PNG, JPG oder GIF bis 10 MB), im Browser auf ein Quadrat zuschneiden,
  übernehmen – oder **MoinMorni-Logo** für zurück. Bewegte GIFs gehen erst ab Boost-Stufe 1, sonst wird ein GIF
  zum stehenden Bild (das Panel sagt es vorher).
- **Server-Banner** (16:9) – erst ab Boost-Stufe 2; vorher ist der Bereich ausgegraut und sagt, welche Stufe der
  Server hat.
- **Profil des Bots** – eigenes Profilbild und Name. Discord erlaubt Änderungen am Bot nur ein paar Mal pro Stunde
  (den Namen sogar nur zweimal) – darum setzt MoinMorni das Logo als Profilbild nur einmal von selbst und sonst nur,
  wenn du hier etwas änderst.

## 6. Mit Discord anmelden (Webseite, optional)

Wer sich auf der Webseite bewirbt (Team oder MorniCraft), meldet sich mit Discord an (nur Name und ID, sonst
nichts). Dafür einmal im [Developer Portal](https://discord.com/developers/applications) bei deiner Anwendung:

1. **OAuth2 → Redirects → Add Redirect**: `https://<deine Domain>/api/public/apply/callback` eintragen und
   **Save Changes** (das Panel zeigt die Adresse in Schritt 6 zum Kopieren).
2. **OAuth2 → Client Secret → Reset Secret**, kopieren und im Panel in **Schritt 6** einfügen (nur der Owner).
   MoinMorni prüft bei Discord, ob es zu diesem Bot gehört, und speichert es verschlüsselt wie den Token. Auch hier
   gilt ein Wert aus der `.env` (`MM_DISCORD_CLIENT_SECRET=…`) vor dem Panel.

Ohne Client Secret geht Bewerben trotzdem – im Discord mit `/bewerben` oder dem Knopf in 📝・bewerbungen.

## 7. Bewerbungen

### Stellen im Team

Welche Stellen es gibt, kommt aus den **Rollen des Panels**: jede Rolle der Vorlage mit einer Stellen-Vorgabe –
Moderator, Supporter (gute Einstiegsstelle), Builder und Media sind von Anfang an offen, Admin ist zu und **nur der
Owner** öffnet sie. **Owner und VIP gibt es nie per Bewerbung** (und nie in einem Shop). Fehlt eine Rolle in der
Vorlage, gibt es auch die Stelle nicht.

Einstellen unter **Einstellungen → Team-Bewerbungen** (oder im Spiel mit `/teamsuche …`): je Stelle offen/zu,
Beschreibung und Fragen auf Deutsch und Englisch; dazu die Regeln **eine offene Bewerbung pro Person**, **Wartezeit
nach einer Absage** (Standard 14 Tage) und **nur mit verbundenem Discord-Konto** (Minecraft-Konto über `/discord` im
Spiel und `/verbinden` im Discord verbunden – dann gehört der Minecraft-Name sicher der Person).

Bewerben geht

- auf der Webseite unter **Team → Bewerben** (`/team/bewerben`): mit Discord anmelden, Stelle wählen, Fragen
  beantworten; dort sieht man auch den Stand der eigenen Bewerbungen und die Antwort des Teams. Die Team-Seite zeigt
  „Wir suchen …“, solange eine Stelle offen ist.
- im Discord mit `/bewerben` oder dem Knopf in 📝・bewerbungen: erst Stelle (oder MorniCraft) wählen, dann das
  Formular – bei mehr als fünf Fragen in Schritten.

Neue Bewerbungen landen im **📥・bewerbungs-eingang** (Knöpfe **Annehmen**, **Ablehnen**, **Im Panel ansehen**) und
im Panel unter **Bewerbungen**: Filter nach Stelle und Stand, alle Antworten, **Daumen** und **Notizen** fürs Team
(die Person sieht beides nie), Entscheidung mit Nachricht.

Entscheiden darf nur, wer die Rolle auch vergeben darf – dieselben Regeln wie bei `/rang`: Recht „Ränge vergeben“,
nie eine Rolle so hoch wie die eigene oder höher, Admin nur der Owner. Geprüft wird immer auf dem Server (Panel und
Discord-Knöpfe). Eine Zusage gibt den Rang im ganzen Netzwerk, die Discord-Rolle (mit verbundenem Konto), eine
Direktnachricht und eine Nachricht im Spiel. Auf Wunsch legt das Panel gleich ein **Team-Konto** an (Startpasswort,
beim ersten Anmelden muss die Person ein eigenes setzen). Eine Absage schickt die Nachricht per Direktnachricht;
neu bewerben geht nach der Wartezeit.

### MorniCraft

Auf `https://<deine Domain>/mornicraft/bewerben` (oder `/bewerben` im Discord) bewerben sich Leute für MorniCraft.
Eine Zusage setzt den Namen auf die Whitelist; die Person bekommt eine Direktnachricht (und im Spiel, wenn sie online
ist). Ob Bewerbungen offen sind und die Nachricht bei Zusage stellst du im Panel unter **Einstellungen → MorniCraft**
ein; die Bewerbungen selbst stehen dort und unter **Bewerbungen**.

## Was der Bot danach macht

- **Status**: Im Kanal 🟢・status steht immer, wer gerade spielt und welche Modi offen sind (jede Minute neu).
- **Konto verbinden**: Im Spiel `/discord` eingeben, dann in Discord `/verbinden <code>`. Danach hat man seinen Rang
  auch in Discord (ändert sich der Rang, zieht Discord nach).
- **Strafen gelten überall**: Bann im Spiel = Bann in Discord, Stumm = Timeout (über 28 Tage oder für immer: Rolle
  🔇 Stumm), Gefängnis = Rolle ⛓ Gefängnis, **Sprachchat-Stumm** (`/voicemute` oder im Panel) = Server-Stummschaltung im
  Discord-Sprachkanal, solange die Strafe läuft – sitzt die Person gerade in keinem, dann beim nächsten Betreten
  (dafür braucht der Bot „Mitglieder stummschalten“; ohne gilt die Strafe nur im Spiel). Alles landet im
  ⚖・strafen-log bzw. 📋・team-log.
- **Tickets**: Der Knopf in 🎫・tickets öffnet ein privates Gespräch (Thread) nur für die Person und das Team.
- **Begrüßung** neuer Mitglieder in 👋・willkommen.
