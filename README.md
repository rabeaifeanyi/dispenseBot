# DispenseBot

DispenseBot is a 3D-printed dispensing machine we built to automatically dispense pen components. The entire machine can be built for around €100 in parts. The machine is controlled by an ESP32 microcontroller and managed through a web interface that runs on any device in the same network.

> 🇩🇪 [Deutsche Version](README_DE.md)

<!-- Add images here -->
<!-- ![Machine front view](images/automat-front.jpg) -->
<!-- ![Web interface](images/webinterface.jpg) -->

---

## Overview

| Component          | Technology | Port |
| ------------------ | ---------- | ---- |
| Frontend           | Next.js    | 3000 |
| Backend (API)      | NestJS     | 3001 |
| Database           | PostgreSQL | 5432 |
| Machine controller | ESP32      | –    |

```
/api      NestJS backend
/web      Next.js frontend
/prisma   Database schema, migrations, seed
/esp32    ESP32 firmware
/scripts  Helper scripts
```

---

## Quick Start with the GitHub Image

The pre-built Docker image is published automatically — no local build required.

**Step 1 – Clone the repository**

```bash
git clone https://github.com/rabeaifeanyi/dispensebot.git
cd dispensebot
```

**Step 2 – Create `.env` and set a password**

```bash
cp .env.example .env
```

At minimum, change the admin password in `.env`:

```env
ADMIN_PASSWORD=your-secure-password
```

Optionally, set the ESP32 controller address if it differs from the default:

```env
MC_API_URL=http://192.168.178.1
```

**Step 3 – Start the stack**

```bash
make up
```

This pulls the latest image from `ghcr.io/rabeaifeanyi/dispensebot:latest` and starts all services. The web interface is then available at `http://localhost:3000`.

---

## Build Locally with Docker

If you want to include your own changes in the image, build it locally:

```bash
git clone https://github.com/rabeaifeanyi/dispensebot.git
cd dispensebot
cp .env.example .env
make build
```

`make build` builds the image from local source and starts the stack. The first build takes a few minutes.

---

## Local Development (without Docker)

For active development, API and frontend can run directly on your machine — only the database runs in Docker.

**Prerequisites:** Node.js >= 18, Docker

```bash
# 1. Install dependencies
npm install

# 2. Start only Postgres
docker compose up -d postgres

# 3. Create env file
cp .env.example .env

# 4. Set up database and load demo data
npx prisma migrate reset
npm run seed

# 5. Start development servers (API + frontend together)
npm run dev
```

API runs at `http://localhost:3001`, frontend at `http://localhost:3000`.

Alternatively, in two separate terminals:

```bash
npm run dev:api   # Terminal 1
npm run dev:web   # Terminal 2
```

---

## Running over Wi-Fi

The ESP32 opens its own Wi-Fi access point (`Kommisionierautomat`, password: `DCPS-WiSe2526`) with the fixed IP `192.168.178.1`. To run the full system over Wi-Fi so other devices can reach the web interface, follow these steps:

**1. Connect the server machine to the ESP32's network**

Connect the computer running Docker to the `Kommisionierautomat` Wi-Fi. The server will then be reachable at its assigned IP on that network (e.g. `192.168.178.42`).

**2. Set the API URL to the server's local IP**

In `.env`, set `NEXT_PUBLIC_API_URL` to the server's IP on the ESP32 network:

```env
NEXT_PUBLIC_API_URL=http://192.168.178.42:3001
MC_API_URL=http://192.168.178.1
```

Then rebuild and start:

```bash
make build
```

The web interface is now accessible from any device connected to the same Wi-Fi at `http://192.168.178.42:3000`.

**Adjusting the ESP32 firmware**

The ESP32's network settings are defined at the top of `esp32/FINAL/FINAL.ino`:

```cpp
static const char* AP_SSID = "Kommisionierautomat";
static const char* AP_PASS = "DCPS-WiSe2526";

IPAddress apIP(192, 168, 178, 1);
```

Change `AP_SSID` and `AP_PASS` to rename the network or set a new password. Change `apIP` if you need a different IP range. After editing, flash the firmware to the ESP32 via Arduino IDE or PlatformIO.

---

## Useful Commands

| Command                    | Action                                  |
| -------------------------- | --------------------------------------- |
| `make up`                  | Start the stack (no rebuild)            |
| `make build`               | Rebuild image and start                 |
| `make down`                | Stop the stack                          |
| `make logs`                | Live logs of the app                    |
| `make shell`               | Shell inside the running container      |
| `npx prisma migrate reset` | Reset the database (deletes all data)   |
| `npm run seed`             | Load demo data                          |
| `npx prisma studio`        | Database GUI at `http://localhost:5555` |
