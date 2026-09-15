#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/compose.yaml"

APP_URL="http://localhost:8080"
HEALTH_URL="${APP_URL}/api/health"
MAX_ATTEMPTS=30
WAIT_SECONDS=2

fail() {
  printf 'Erreur: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 ||
  fail "Docker est introuvable."

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose est indisponible."

command -v curl >/dev/null 2>&1 ||
  fail "curl est introuvable."

docker info >/dev/null 2>&1 ||
  fail "Docker n'est pas démarré ou n'est pas accessible."

printf 'Démarrage de JobTracker...\n'

docker compose \
  -f "${COMPOSE_FILE}" \
  up -d --build

printf 'Attente de JobTracker'

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
  if curl \
    --silent \
    --show-error \
    --fail \
    --max-time 2 \
    "${HEALTH_URL}" >/dev/null 2>&1; then
    printf '\nJobTracker est prêt : %s\n' "${APP_URL}"

    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "${APP_URL}" >/dev/null 2>&1 || true
    fi

    exit 0
  fi

  printf '.'
  sleep "${WAIT_SECONDS}"
done

printf '\n' >&2

docker compose \
  -f "${COMPOSE_FILE}" \
  ps >&2 || true

fail "JobTracker n'est pas devenu disponible après $((MAX_ATTEMPTS * WAIT_SECONDS)) secondes."
