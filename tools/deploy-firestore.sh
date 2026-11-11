#!/usr/bin/env bash
# Deploy Firestore composite indexes + security rules for Annaadhya.
#
# Sources: firestore.indexes.json + firestore.rules (repo root), wired via firebase.json.
# The repo uses pnpm — the script prefers the globally installed firebase binary,
# then falls back to `pnpm dlx` / `npx` (no install needed, downloads on first run).
#
# Usage:
#   ./tools/deploy-firestore.sh <FIREBASE_PROJECT_ID>                # indexes + rules
#   ./tools/deploy-firestore.sh <FIREBASE_PROJECT_ID> --indexes-only
#   ./tools/deploy-firestore.sh <FIREBASE_PROJECT_ID> --rules-only
#   FIREBASE_PROJECT=<id> ./tools/deploy-firestore.sh                # id via env instead
#
# Login first (once per machine):  pnpm dlx firebase-tools login
# Headless server:                 pnpm dlx firebase-tools login --no-localhost
set -euo pipefail

PROJECT="${1:-${FIREBASE_PROJECT:-}}"
MODE="${2:-both}"

if [[ -z "$PROJECT" ]]; then
  echo "ERROR: no Firebase project id given." >&2
  echo "Usage: $0 <FIREBASE_PROJECT_ID> [--indexes-only|--rules-only]" >&2
  exit 1
fi

# Pick a runner: global firebase binary → pnpm dlx → npx
if command -v firebase >/dev/null 2>&1; then
  FB="firebase"
elif command -v pnpm >/dev/null 2>&1; then
  FB="pnpm dlx firebase-tools"
elif command -v npx >/dev/null 2>&1; then
  FB="npx --yes firebase-tools"
else
  echo "ERROR: need firebase-tools. Install once: pnpm add -g firebase-tools" >&2
  exit 1
fi

# Always run from the repo root (where firebase.json lives)
cd "$(dirname "$0")/.."

for f in firebase.json firestore.indexes.json firestore.rules; do
  [[ -f "$f" ]] || { echo "ERROR: $f not found in $(pwd)" >&2; exit 1; }
done

case "$MODE" in
  --indexes-only) TARGETS="firestore:indexes" ;;
  --rules-only)   TARGETS="firestore:rules" ;;
  both|"")        TARGETS="firestore:indexes,firestore:rules" ;;
  *) echo "ERROR: unknown mode '$MODE' (use --indexes-only or --rules-only)" >&2; exit 1 ;;
esac

echo ">> Runner:      $FB"
echo ">> Project:     $PROJECT"
echo ">> Targets:     $TARGETS"
echo ">> Deploying from: $(pwd)"
echo ""

$FB deploy --only "$TARGETS" --project "$PROJECT" --non-interactive --force

echo ""
echo ">> Deploy accepted."
echo ">> Composite index builds continue server-side (a few minutes for a fresh project)."
echo ">> Until an index finishes building, its queries fail with FAILED_PRECONDITION."
echo ">> Progress: Firebase console → Firestore Database → Indexes."
echo ">> Rerunning this script is safe — it upserts, existing identical indexes are kept."
