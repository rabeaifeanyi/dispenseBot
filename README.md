# Kommissionierautomat

Kurzanleitung, um das System (API + UI + Postgres + Maschinencontroller) lokal oder per Docker zu starten.

## Projektstruktur

- `/api` NestJS-Backend (Port 3001)
- `/web` Next.js-Frontend (Port 3000)
- `/prisma` Schema, Migrations, Seed
- `/scripts` Docker-/Start-Helfer

## Voraussetzungen

- Git, Docker (Desktop/CE), optional Node.js >= 18 für lokale Entwicklung

```bash
git clone https://github.com/rabeaifeanyi/dispensebot.git
cd dispensebot
```

## Schnellstart mit Docker

```bash
docker compose pull
make up
```

UI erreichbar unter `http://localhost:3000`.

### Verbindung zum Automaten (ESP32)

- In `.env` die Adresse des MC setzen, z. B.:

```env
MC_API_URL=http://192.168.4.1
```

- Danach neu starten: `docker compose up -d --force-recreate app`.
- Falls der Container den Host nicht erreicht: in `docker-compose.yml` unter `app` temporär `network_mode: host` aktivieren (Linux freundlich, auf macOS nur falls nötig).

### Admin-Zugang sichern

- Standardpasswort `admin123` sofort ersetzen: `.env` anpassen, dann neu bauen/starten: `make build`.

## Lokale Entwicklung

1. Node.js >= 18 installieren
1. Abhängigkeiten installieren:

```bash
npm install
```

1. Nur Postgres via Docker starten:

```bash
docker compose up -d postgres
```

1. Env anlegen:

```bash
cp .env.example .env
```

1. Datenbank migrieren & Seed laden:

```bash
npx prisma migrate reset
npm run seed
```

1. Entwicklung starten (API + Web gemeinsam):

```bash
npm run dev
```

Oder getrennt: `npm run dev:api` und `npm run dev:web` in zwei Terminals.

## Nützliche Befehle

- Stack hochfahren: `make up`
- Neu bauen + starten: `make build`
- Logs ansehen: `make logs` (oder: `docker compose logs -f postgres`)
- Stack stoppen: `make down`
- Shell im Container: `make shell`
- DB zurücksetzen (löscht Daten!): `npx prisma migrate reset`
- Seed ausführen: `npm run seed`
- Prisma Studio (DB GUI): `npx prisma studio` (öffnet `http://localhost:5555`)

## Hinweise zur Hardware-Anbindung

- MC muss über `MC_API_URL` erreichbar sein (WLAN des Automaten oder LAN).
- Bei Verbindungsproblemen: MC einschalten, IP prüfen, ggf. `network_mode: host` testen.
