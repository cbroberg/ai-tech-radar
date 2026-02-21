#!/usr/bin/env bash
# Sync local keywords and custom sources to the live Fly.io site.
# Usage: bash scripts/sync-to-live.sh
# Requires: ADMIN_TOKEN in .env, live site at ai-tech-radar.fly.dev

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "change-me-to-random-secret" ]; then
  echo "Error: ADMIN_TOKEN not set or still placeholder in .env"
  exit 1
fi

LIVE_URL="https://ai-tech-radar.fly.dev"
AUTH="Authorization: Bearer $ADMIN_TOKEN"

echo "── Syncing keywords to $LIVE_URL ──"

# Get local keywords from local API
LOCAL_KEYWORDS=$(curl -sf "http://localhost:3000/api/admin/keywords" -H "$AUTH")
if [ -z "$LOCAL_KEYWORDS" ]; then
  echo "Error: Could not fetch local keywords. Is the local server running?"
  exit 1
fi

# Get live keywords
LIVE_KEYWORDS=$(curl -sf "$LIVE_URL/api/admin/keywords" -H "$AUTH")

added=0
skipped=0
count=$(echo "$LOCAL_KEYWORDS" | jq length)
for i in $(seq 0 $(($count - 1))); do
  kw=$(echo "$LOCAL_KEYWORDS" | jq -r ".[$i].keyword")
  cat=$(echo "$LOCAL_KEYWORDS" | jq -r ".[$i].category")
  pri=$(echo "$LOCAL_KEYWORDS" | jq -r ".[$i].priority")

  # Check if keyword already exists on live
  exists=$(echo "$LIVE_KEYWORDS" | jq -r --arg k "$kw" '[.[] | select(.keyword == $k)] | length')
  if [ "$exists" -gt 0 ]; then
    skipped=$((skipped + 1))
    continue
  fi

  resp=$(curl -sf -X POST "$LIVE_URL/api/admin/keywords" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"keyword\":\"$kw\",\"category\":\"$cat\",\"priority\":$pri}" 2>&1) && {
    echo "  + keyword: $kw ($cat, priority $pri)"
    added=$((added + 1))
  } || {
    echo "  ! failed: $kw — $resp"
  }
done
echo "Keywords: $added added, $skipped already existed"

echo ""
echo "── Syncing custom sources to $LIVE_URL ──"

LOCAL_SOURCES=$(curl -sf "http://localhost:3000/api/admin/sources" -H "$AUTH")
LIVE_SOURCES=$(curl -sf "$LIVE_URL/api/admin/sources" -H "$AUTH")

added=0
skipped=0
count=$(echo "$LOCAL_SOURCES" | jq length)
for i in $(seq 0 $(($count - 1))); do
  name=$(echo "$LOCAL_SOURCES" | jq -r ".[$i].name")
  url=$(echo "$LOCAL_SOURCES" | jq -r ".[$i].feed_url")

  exists=$(echo "$LIVE_SOURCES" | jq -r --arg n "$name" '[.[] | select(.name == $n)] | length')
  if [ "$exists" -gt 0 ]; then
    skipped=$((skipped + 1))
    continue
  fi

  resp=$(curl -sf -X POST "$LIVE_URL/api/admin/sources" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"feedUrl\":\"$url\"}" 2>&1) && {
    echo "  + source: $name ($url)"
    added=$((added + 1))
  } || {
    echo "  ! failed: $name — $resp"
  }
done
echo "Sources: $added added, $skipped already existed"

echo ""
echo "Done!"
