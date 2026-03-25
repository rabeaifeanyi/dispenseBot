# Kommissionierautomat

DispenseBot ist ein 3D-gedruckter Kommissionierautomat, den wir entwickelt haben, um Stiftteile automatisiert auszugeben. Der gesamte Automat lässt sich mit einem Materialbudget von rund 100 € nachbauen. Der Automat wird von einem ESP32-Microcontroller gesteuert und über ein Webinterface bedient, das auf jedem Gerät im selben Netzwerk erreichbar ist.

> 🇬🇧 [English version](README.md)

---

## Anforderungen

- **Docker** & **Docker Compose**

### macOS Docker Desktop Setup

Wenn du macOS mit Docker Desktop nutzt, musst du "Host Networking" aktivieren:

1. Öffne **Docker Desktop Settings**
2. Gehe zu **Resources** → **Network**
3. Aktiviere **"Enable host networking"**
4. Starte Docker Desktop neu

---

## Übersicht

| Komponente          | Technologie | Port |
| ------------------- | ----------- | ---- |
| Frontend            | Next.js     | 3000 |
| Backend (API)       | NestJS      | 3001 |
| Datenbank           | PostgreSQL  | 5432 |
| Maschinencontroller | ESP32       | –    |

```
/api      NestJS-Backend
/web      Next.js-Frontend
/prisma   Datenbankschema, Migrationen, Seed
/esp32    Firmware für den ESP32
/scripts  Hilfsskripte
```

---

## Schnellstart mit GitHub Image

**`.env` anlegen und Passwort setzen**

```bash
cp .env.example .env
```

In `.env` mindestens das Admin-Passwort ändern:

```env
ADMIN_PASSWORD=mein-sicheres-passwort
```

Optional: Adresse des ESP32-Controllers eintragen, falls abweichend vom Standard:

```env
MC_API_URL=http://192.168.178.1
```

**Stack starten**

```bash
make up
```

Das lädt das aktuelle Image von `ghcr.io/rabeaifeanyi/dispensebot:latest` und startet alle Dienste. Das Webinterface ist danach unter `http://localhost:3000` erreichbar.

---

## Docker lokal selbst bauen

Falls du eigene Änderungen im Image haben möchtest, kannst du es lokal bauen:

```bash
git clone https://github.com/rabeaifeanyi/dispensebot.git
cd dispensebot
cp .env.example .env
make build
```

`make build` baut das Image aus dem lokalen Quellcode und startet danach den Stack. Das dauert beim ersten Mal einige Minuten.

---

## Lokal entwickeln ohne Docker

**Voraussetzungen:** Node.js >= 18, Docker

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Nur Postgres starten
docker compose up -d postgres

# 3. Env anlegen
cp .env.example .env

# 4. Datenbank einrichten und Demodaten laden
npx prisma migrate reset
npm run seed

# 5. Entwicklungsserver starten (API + Frontend gemeinsam)
npm run dev
```

API läuft unter `http://localhost:3001`, Frontend unter `http://localhost:3000`.

Alternativ in zwei separaten Terminals:

```bash
npm run dev:api   # Terminal 1
npm run dev:web   # Terminal 2
```

---

## Übers WLAN betreiben

Der ESP32 spannt ein eigenes WLAN-Netz auf (`Kommisionierautomat`, Passwort: `DCPS-WiSe2526`) mit der festen IP `192.168.178.1`. Damit das Webinterface von anderen Geräten erreichbar ist, sind folgende Schritte nötig:

**1. Server-Rechner mit dem ESP32-Netz verbinden**

Den Rechner, auf dem Docker läuft, mit dem WLAN `Kommisionierautomat` verbinden. Der Rechner bekommt dann eine IP im Netz des ESP32 (z. B. `192.168.178.42`).

**2. API-URL auf die lokale IP des Rechners setzen**

In `.env` eintragen:

```env
NEXT_PUBLIC_API_URL=http://192.168.178.42:3001
MC_API_URL=http://192.168.178.1
```

Danach neu bauen und starten:

```bash
make build
```

Das Frontend ist jetzt unter `http://192.168.178.42:3000` von jedem Gerät im selben WLAN erreichbar.

> **Hinweis:** `NEXT_PUBLIC_API_URL` wird beim Docker-Build ins Frontend eingebacken, daher ist nach jeder Änderung ein Rebuild nötig.

**ESP32-Firmware anpassen**

Die Netzwerkeinstellungen des ESP32 stehen ganz oben in `esp32/FINAL/FINAL.ino`:

```cpp
static const char* AP_SSID = "Kommisionierautomat";
static const char* AP_PASS = "DCPS-WiSe2526";

IPAddress apIP(192, 168, 178, 1);
```

`AP_SSID` und `AP_PASS` ändern, um das Netz umzubenennen oder ein neues Passwort zu setzen. `apIP` anpassen, falls ein anderer IP-Bereich gewünscht ist. Nach dem Bearbeiten die Firmware per Arduino IDE oder PlatformIO auf den ESP32 flashen.

---

## Teile-Konfiguration (`api/config.json`)

Die Datei `api/config.json` legt fest, welche Teile der Automat kennt. Jeder Eintrag entspricht einem physischen Magazinschacht.

```jsonc
{
  "version": 1,

  // Reihenfolge, in der die Teile im Webinterface angezeigt werden
  "order": ["PART1", "PART2", "PART3", "PART4", "PART5"],

  "parts": {
    "PART1": {
      // Name, der im Webinterface angezeigt wird
      "displayName": "Drücker",

      // Beschriftung des physischen Magazins (hilft beim Erkennen im Automaten)
      "magazineLabel": "grünes Magazin",

      // Farbe, mit der dieses Teil im UI hervorgehoben wird
      "tint": {
        "base": "#bfe3d0", // Hintergrundfarbe
        "overlay": "#4fa37f" // Akzentfarbe
      },

      // Basis-Dateiname für Teilbilder (ohne Dateiendung)
      "images": {
        "fileBase": "druecker"
      },

      // Indizes für die Kommunikation mit dem ESP32-Controller.
      // Müssen mit der Verkabelung des zugehörigen Servos/Schachts am Automaten übereinstimmen.
      "mc": {
        "wertIndex": 1, // Wert, der an den Controller gesendet wird
        "antwortIndex": 1, // erwarteter Antwortindex
        "magazinIndex": 1 // physische Magazinposition (1–5)
      }
    }
  }
}
```

---

## Nützliche Befehle

| Befehl                     | Aktion                                      |
| -------------------------- | ------------------------------------------- |
| `make up`                  | Stack starten (ohne Rebuild)                |
| `make build`               | Image neu bauen + starten                   |
| `make down`                | Stack stoppen                               |
| `make logs`                | Live-Logs der App                           |
| `make shell`               | Shell im laufenden Container                |
| `npx prisma migrate reset` | Datenbank zurücksetzen (löscht alle Daten)  |
| `npm run seed`             | Startdaten laden                            |
| `npx prisma studio`        | Datenbank-GUI unter `http://localhost:5555` |
