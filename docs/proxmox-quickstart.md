# MoinMorni installieren

So kommt MoinMorni auf einen Rechner – am einfachsten in einen eigenen Container auf deinem Proxmox.

## Was du brauchst

- Einen Proxmox-Container (LXC) oder eine VM mit **Debian 12/13 oder Ubuntu 24.04**.
  - Empfehlung: **32 GB RAM, 8 Kerne, 100 GB Festplatte** (leere Spielmodi schlafen und brauchen dann kaum etwas).
  - Beim LXC unter *Optionen → Features* **„Nesting“ und „keyctl“** anhaken – sonst läuft Docker darin nicht.
- Deine Domain (z. B. `moinmorni.net`) – DNS bei INWX, Verkehr über NetBird.
- Optional: den Token deines Discord-Bots (geht auch später im Panel).

> Der Proxmox-Einzeiler, der den Container gleich mit anlegt, kommt noch (Baustein „Proxmox-Quick-Start“).

## Installieren

In der Konsole des Containers (als root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/moinmorni.net/main/install.sh)"
```

Das Skript fragt nur zwei Dinge: die **Domain** und den **Token des Discord-Bots** (Eingabe bleibt unsichtbar,
leer lassen geht). Danach passiert alles von selbst:

1. Docker wird installiert (falls noch nicht da).
2. MoinMorni landet in `/opt/moinmorni`, zusammen mit dem **Motor** (MorniHosting, legt die Minecraft-Server an).
3. Die Einstellungen kommen in `/opt/moinmorni/.env` – mit zufälligen Geheimnissen, **nur für root lesbar**.
4. Motor und MoinMorni starten, MoinMorni bekommt seinen eigenen Schlüssel für den Motor.
5. Am Ende steht dein **Einrichtungs-Code** da.

## Erstes Konto anlegen

Öffne `https://<deine Domain>/panel/einrichtung` (oder zu Hause `http://<IP>:8080/panel/einrichtung`), gib den
Einrichtungs-Code ein und leg dein Konto an – es wird automatisch **Owner**. Den Code kannst du jederzeit nochmal
anzeigen lassen:

```bash
docker exec moinmorni cat /data/setup-code
```

Nach der Einrichtung gilt der Code nicht mehr, und niemand kann sich selbst registrieren – Team-Konten legst du im
Panel an.

## HTTPS über NetBird

Lege in NetBird einen **HTTP-Dienst** für deine Domain an, Ziel `http://<IP des Containers>:8080`, mit
**„Pass Host Header“** (sonst gehen Passkeys nicht). Die Minecraft-Adressen richtet MoinMorni später selbst ein.

## Was von außen erreichbar ist

Nur die Webseite (Port 8080, HTTPS macht NetBird) und der Proxy der Minecraft-Server. Der Motor, der Zugang zu
Docker (nur über einen Socket-Proxy) und der Hub für die Plugins bleiben im Container.

## Nützliche Befehle

```bash
cd /opt/moinmorni && docker compose ps
```

```bash
cd /opt/moinmorni && docker compose logs -f moinmorni
```

```bash
docker exec moinmorni-motor node /app/server/dist/cli.js list-users
```
