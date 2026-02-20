#!/usr/bin/env bash
# Sync secrets from .env to Fly.io
# Usage: ./scripts/fly-secrets-sync.sh [app-name]
#
# Skips lines that are comments, empty, or contain placeholder values (...).
# Only syncs variables that have actual values.

set -euo pipefail

APP="${1:-ai-tech-radar}"
ENV_FILE="$(dirname "$0")/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Keys that should NOT be synced to Fly (local-only)
SKIP_KEYS=("DB_PATH")

args=()

while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue

  # Strip inline comments
  line="${line%%#*}"
  line="${line%% }"

  # Must be KEY=VALUE format
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # Skip keys with no value or placeholder
  [[ -z "$value" || "$value" == "..." || "$value" == "re_..." || "$value" == "sk-ant-..." ]] && continue

  # Skip local-only keys
  skip=false
  for k in "${SKIP_KEYS[@]}"; do
    [[ "$key" == "$k" ]] && skip=true && break
  done
  $skip && continue

  args+=("${key}=${value}")
done < "$ENV_FILE"

if [[ ${#args[@]} -eq 0 ]]; then
  echo "No secrets to sync."
  exit 0
fi

echo "Syncing ${#args[@]} secrets to Fly app: $APP"
for arg in "${args[@]}"; do
  echo "  → ${arg%%=*}"
done
echo ""

fly secrets set "${args[@]}" --app "$APP"
echo "Done."
