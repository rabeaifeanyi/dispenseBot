#!/usr/bin/env bash
# Legt bei Bedarf .env an und startet Docker.
# Nutzung: ./scripts/docker-up.sh [docker compose Argumente, z.B. --build oder -d]

set -e
cd "$(dirname "$0")/.."
SCRIPT_DIR="$(pwd)"

"$SCRIPT_DIR/scripts/ensure-env.sh"
exec docker compose up "$@"
