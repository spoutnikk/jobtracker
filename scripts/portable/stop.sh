#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yaml"

fail() {
  printf 'Erreur: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 ||
  fail "Docker est introuvable."

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose est indisponible."

docker info >/dev/null 2>&1 ||
  fail "Docker n'est pas démarré ou n'est pas accessible."

printf 'Arrêt de JobTracker...\n'

docker compose \
  -f "${COMPOSE_FILE}" \
  down

printf 'JobTracker est arrêté. Les données ont été conservées.\n'
