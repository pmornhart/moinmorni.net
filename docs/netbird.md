# Erreichbarkeit: MoinMorni über NetBird

MoinMorni läuft bei dir zu Hause (Proxmox) – erreichbar ist es trotzdem unter `https://moinmorni.net`, und Spieler tippen
nur `moinmorni.net`. Das erledigt der Reverse Proxy von [NetBird](https://netbird.io) auf deinem NetBird-Server (z. B. bei
IONOS):

- **Rein:** Besucher und Spieler kommen beim NetBird-Server an, NetBird reicht sie durch einen verschlüsselten Tunnel
  zu dir nach Hause weiter. Am Router zu Hause gibt es keine Portfreigabe.
- **Raus:** Alles, was MoinMorni selbst aufruft (Mojang, Modrinth, GitHub, Discord …), geht über den NetBird-Server
  ins Internet (Ausgang, englisch „Exit-Node“).
- So taucht die IP deines Hausanschlusses nirgends auf – weder bei Besuchern noch bei Diensten im Internet.

Eingerichtet wird alles im Panel unter **Einstellungen → Erreichbarkeit**. Die Karten dort kommen aus MorniHosting
(dem eingebauten Motor, siehe [Architektur](architektur.md)) – MoinMorni baut nichts davon doppelt.

## Was du einmal vorbereitest

1. **NetBird im Container.** Beim [Proxmox-Einzeiler](proxmox-quickstart.md) mit Setup-Key passiert das von selbst
   (der Rechner heißt in NetBird `moinmorni`). Sonst im Container: NetBird installieren und `netbird up`.
2. **Deine Domain bei NetBird:** im NetBird-Dashboard **Reverse Proxy → Custom Domains → Add Domain** `moinmorni.net`.
   Bei INWX zeigen `moinmorni.net` und `*.moinmorni.net` auf deinen NetBird-Server (die genauen Werte zeigt NetBird nach dem
   Speichern an). MoinMorni braucht seine **eigene** Domain in NetBird – nicht dieselbe wie dein MorniHosting.
3. **Ein Schlüssel für NetBird:** **Team → Service Users → Create Service User** (Rolle „Admin“) → **Create Token**.
   Den Schlüssel (`nbp_…`) kopieren – er wird im Motor verschlüsselt gespeichert und nie wieder angezeigt.
4. **NetBird auf dem NetBird-Server** (nur für „Hausanschluss verstecken“): Dort läuft neben dem NetBird-Proxy auch
   der normale NetBird-Agent (`netbird up`), damit er als Ausgang dienen kann. Läuft das für MorniHosting schon,
   musst du nichts tun – beide nutzen denselben Ausgang.

## Im Panel: Einstellungen → Erreichbarkeit

Nur der **Owner** richtet das ein (er ist im Motor Admin). Alle anderen sehen einen Hinweis.

1. **NetBird verbinden:** Die Adresse deines NetBird-Servers steht schon drin (`install.sh` und `update.sh` lesen sie
   aus `netbird status`). Schlüssel einfügen → **Verbinden** → Domain `moinmorni.net` und Rechner `moinmorni` wählen →
   **Speichern**.
2. **Webseite auf der Domain:** Name leer lassen (= `moinmorni.net` selbst), Port `8080` → **Einrichten**. NetBird legt
   einen HTTPS-Dienst mit „Pass Host Header“ an, der zur Webseite von MoinMorni führt (nicht zum Motor). Passkeys
   gehen dann über `moinmorni.net`. Auch `www.moinmorni.net` führt hin (den Dienst dafür legt der Motor an):
   MoinMorni leitet den Namen dauerhaft (301) auf `https://moinmorni.net` um, mit gleichem Pfad. Bei INWX darf es
   dafür keinen eigenen `www`-Eintrag geben – er überdeckt den Platzhalter `*.moinmorni.net` (ein alter zeigt meist
   noch auf die Parkseite).
3. **Spiel auf der Domain:** Der Proxy des Netzwerks ist schon vorgeschlagen → **Übernehmen**. Dann gilt:

   | Was                         | Spieler tippen                    | In NetBird                     |
   | --------------------------- | --------------------------------- | ------------------------------ |
   | Java (jede Version ab 1.17) | `moinmorni.net`                   | TCP 25565                      |
   | Bedrock (Handy, Konsole …)  | `moinmorni.net`, Port 19132       | UDP 19132 + TCP 19132 (Finden) |
   | Sprachchat (Mod)            | verbindet sich beim Joinen selbst | UDP 25565                      |

4. **Hausanschluss verstecken:** den NetBird-Server als „Ausgang über“ wählen → **Anschluss verstecken**. Danach prüft
   der Motor, mit welcher IP er ins Internet geht: grün = versteckt. Zeigt die Karte Namen, die noch auf deinen
   Hausanschluss zeigen, lösch diese Einträge bei INWX.

## Was NetBird erlaubt – und was das für MoinMorni heißt

Geprüft im Quelltext von NetBird (Reverse Proxy und Routen), nachgestellt in den Tests von MorniHosting:

- **Ein Dienst pro Name.** HTTP und TCP/UDP teilen sich keinen Namen. Die Webseite bekommt darum `moinmorni.net` selbst,
  die Spiel-Dienste stehen in NetBird unter eigenen Namen (`moinmorni-proxy.moinmorni.net`, `…-bedrock`, `…-voice`).
- **TCP und UDP gehen nach dem Port, nicht nach dem Namen.** Wer `moinmorni.net` eintippt, landet beim NetBird-Server –
  Port 25565 geht zum Java-Dienst, egal unter welchem Namen er in NetBird steht. Darum klappt `moinmorni.net` ohne Port.
- **Ein Dienst pro Port** auf einem NetBird-Proxy. Hat schon jemand 25565 oder 19132 (z. B. der Adress-Verteiler
  deines MorniHosting im selben NetBird), nimmt MoinMorni ihm nichts weg: Der Proxy bekommt die nächste Nummer, die in
  TCP und UDP frei ist (z. B. 25566), die Karte sagt, wer den Port hat, und alle fünf Minuten probiert der Motor, ob er
  frei geworden ist. Bis dahin geht Java ohne Port mit einem SRV-Eintrag bei INWX (die Karte nennt ihn); Bedrock
  braucht solange die Portnummer.
- **Bedrock ohne Port über den Verteiler von MorniHosting:** Trag in MorniHosting unter „Weitere Domains über diesen
  Verteiler“ `moinmorni.net` mit den Ports aus der Karte ein. Der Verteiler auf 19132 erkennt dann an der Adresse, dass
  der Spieler zu MoinMorni will, und reicht ihn weiter. Danach in MoinMorni unter Einstellungen → Erreichbarkeit → „Für
  Spieler“ den Bedrock-Port auf 19132 stellen – dann zeigen Webseite, Discord und Lobby 19132, und Bedrock-Spieler
  lassen den vorausgefüllten Port einfach stehen. Die eigene Nummer (z. B. 19134) geht weiter.
- **NetBird Cloud** vergibt Ports selbst – dann steht die Nummer in der Adresse. Ohne Port geht es nur mit einem selbst
  betriebenen NetBird, dessen Proxy eigene Ports erlaubt.
- **Zwei Produkte, ein Ausgang:** MoinMorni legt seine eigene Gruppe „MoinMorni Ausgang“ (nur der Rechner
  `moinmorni`) und eine eigene Route über den NetBird-Server an. NetBird nimmt mehrere solcher Routen über denselben
  Rechner an; sollte es eine einmal ablehnen, fährt MoinMorni in der Route von MorniHosting mit (die Karte sagt das).
  Ausschalten nimmt nur die eigene Gruppe heraus – MorniHosting merkt davon nichts.

Alles, was MoinMorni in NetBird anlegt, heißt „MoinMorni …“ (Netzwerk, Gruppe, Resources, Ausgang) – der Motor läuft
dafür mit `MH_BRAND=MoinMorni` (`docker-compose.yml`). Dinge von MorniHosting fasst er nie an.

## Wächter

`install.sh` und `update.sh` richten im Container den Wächter aus MorniHosting ein
(`vendor/mornihosting/scripts/guard.sh`, Timer `moinmorni-guard.timer`). Er prüft jede Minute und repariert selbst:
Internet weg über den Ausgang (dann geht es kurz direkt raus, bis der Ausgang wieder antwortet), DNS, NetBird getrennt,
Docker oder ein Container von MoinMorni hängt, Platte voll.

```bash
sudo moinmorni-guard status    # was er sieht und zuletzt getan hat
sudo moinmorni-guard exit      # nur den Ausgang prüfen
```

Protokoll: `/var/log/moinmorni-guard.log`. Während eines Updates hält er still.

Auf dem Proxmox-Host richtet der Einzeiler dazu den **Host-Wächter** ein (`moinmorni-host-guard`, aus MorniHosting
`proxmox/dauerbetrieb.sh`, mit eigenem Namen neben einem MorniHosting auf demselben Host): Ist der Container aus, ohne
dass du ihn gestoppt hast, startet er ihn wieder, hängt er, startet er ihn neu – und meldet es über den Wächter im
Container. Status auf dem Host: `moinmorni-host-guard status`. Für ältere Container siehe
[Proxmox-Anleitung](proxmox-quickstart.md#nützliche-befehle).

**Selbst betriebenes NetBird:** Der Proxy braucht neben TCP auch UDP auf dem Java-Port (Sprachchat am Proxy). Das
Port-Skript aus MorniHosting (`scripts/netbird-proxy-ports.sh`, einmal auf dem NetBird-Server) gibt das seit dem
16.11. mit frei – wer es vorher ausgeführt hat, startet es einfach noch einmal.

## Meldungen im Discord-Team-Log

Was der Motor oder sein Wächter bemerkt, steht im Team-Log von Discord – mit „behebt sich selbst?“ und, wenn nicht,
was zu tun ist (mit dem passenden Befehl). Ist es behoben, kommt eine kurze Entwarnung. Abschalten: **Einstellungen →
Erreichbarkeit → Probleme im Discord-Team-Log melden**.

Technisch hört MoinMorni dem Motor über dessen Live-Verbindung zu (`/api/ws`, Kanal „alerts“) und merkt sich die
letzte Meldung in `motor-alerts.json` im Datenordner. Nach einem Neustart kommt nach, was dazwischen kam – nichts
doppelt. Dieselbe Meldung kommt höchstens alle 30 Minuten.

## Wenn etwas nicht klappt

- **„NetBird ist gerade nicht erreichbar“:** `sudo moinmorni-guard status` zeigt, ob der Container den NetBird-Server
  erreicht. Bei verstecktem Hausanschluss sorgt der Wächter für einen direkten Weg zum eigenen NetBird-Server.
- **Bedrock findet den Server nicht:** Seit Bedrock 26.60 braucht es TCP **und** UDP auf dem Bedrock-Port – die Karte
  legt beide an. Steht dort eine andere Nummer als 19132, muss sie im Spiel ins Feld „Port“.
- **Java will einen Port:** Siehe oben („Ein Dienst pro Port“) – SRV-Eintrag bei INWX oder den Port freigeben lassen.

## Was nur nachgebaut geprüft ist

NetBird selbst ist in den Tests nachgebaut (Regeln aus dem Quelltext von NetBird). Gegen ein echtes NetBird, mit
echten Spielern über NetBird, mit Bedrock, mit dem Wächter unter systemd auf dem echten Rechner und mit dem
Host-Wächter auf echtem Proxmox ist es noch nicht geprüft.
