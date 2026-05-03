#!/bin/bash
# Hot-push a file to production (austintxhomes.co) instantly.
# Called automatically by Claude Code hook after file edits.
# Usage: hot-push.sh <absolute-file-path>

FILE="$1"
if [ -z "$FILE" ]; then exit 0; fi

# Only push files in allowed directories or specific allowed root files
SITE_DIR="/Users/lukeallen/VS Studio/austintxhomes/public/site"
JS_DIR="/Users/lukeallen/VS Studio/austintxhomes/public/js"
TMPL_DIR="/Users/lukeallen/VS Studio/austintxhomes/templates"
DATA_DIR="/Users/lukeallen/VS Studio/austintxhomes/data"
CSS_DIR="/Users/lukeallen/VS Studio/austintxhomes/public/css"
PUBLIC_DIR="/Users/lukeallen/VS Studio/austintxhomes/public"

REL_PATH=""
case "$FILE" in
  "$SITE_DIR"/*) REL_PATH="public/site/$(basename "$FILE")" ;;
  "$JS_DIR"/*)   REL_PATH="public/js/$(basename "$FILE")" ;;
  "$CSS_DIR"/*)  REL_PATH="public/css/$(basename "$FILE")" ;;
  "$TMPL_DIR"/*) REL_PATH="templates/$(basename "$FILE")" ;;
  "$DATA_DIR"/*) REL_PATH="data/$(basename "$FILE")" ;;
  "$PUBLIC_DIR/sitemap.xml") REL_PATH="public/sitemap.xml" ;;
  "$PUBLIC_DIR/robots.txt")  REL_PATH="public/robots.txt" ;;
  *) exit 0 ;;  # Not a pushable file - skip silently
esac

TOKEN_FILE="$HOME/.config/austintxhomes-admin-token"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "[hot-push] No token file at $TOKEN_FILE — skipping"
  exit 0
fi
TOKEN=$(cat "$TOKEN_FILE")

CONTENT=$(cat "$FILE")
PROD_URL="https://austintxhomes.co/api/admin-cms/push-file"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- <<PAYLOAD
$(node -e "console.log(JSON.stringify({filePath:'$REL_PATH',content:require('fs').readFileSync('$FILE','utf8')}))")
PAYLOAD
)

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "[hot-push] ✓ $REL_PATH → production (instant)"
else
  echo "[hot-push] ✗ $REL_PATH failed ($HTTP_CODE): $BODY"
fi
