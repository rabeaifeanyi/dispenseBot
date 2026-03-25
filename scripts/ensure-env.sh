#!/usr/bin/env bash
# Erstellt .env aus .env.example, falls nicht vorhanden.
# Synchronisiert ADMIN_PASSWORD in .env.docker.

set -e
cd "$(dirname "$0")/.."

WARNED=false

# --- .env ---
if [ ! -f .env ]; then
  echo ""
  echo "Keine .env gefunden – erstelle aus .env.example …"
  cp .env.example .env
  WARNED=true
fi

# --- ADMIN_PASSWORD aus .env lesen ---
ADMIN_PASSWORD_VALUE=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$ADMIN_PASSWORD_VALUE" ]; then
  ADMIN_PASSWORD_VALUE="admin123"
  WARNED=true
elif [ "$ADMIN_PASSWORD_VALUE" = "admin123" ]; then
  WARNED=true
fi

# --- ADMIN_PASSWORD in .env.docker setzen / aktualisieren ---
if [ -f .env.docker ]; then
  if grep -q '^ADMIN_PASSWORD=' .env.docker; then
    # Vorhandenen Wert ersetzen
    if [[ "$(uname)" = "Darwin" ]]; then
      sed -i '' "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}|" .env.docker
    else
      sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}|" .env.docker
    fi
  else
    # Zeile anhängen
    echo "ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}" >> .env.docker
  fi
fi

if [ "$WARNED" = true ]; then
  echo ""
  echo ""
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!  ACHTUNG: Es wurde das Standard-Passwort 'admin123' gesetzt.                        !!"
  echo "!!  Das ist EXTREM UNSICHER! Für echten Einsatz in .env ein starkes Passwort setzen    !!"
  echo "!!  und danach neu bauen: docker-compose build --no-cache app && docker-compose up -d  !!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
fi
