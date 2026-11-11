#!/usr/bin/env bash
# Isolated end-to-end verification of the self-contained dist (Hostinger runtime shape).
# Copies apps/api/dist OUT of the repo into a temp dir and boots it four ways,
# asserting the instant-listen contract and the boot-report oracle. 24 checks;
# exits 1 on any failure. Run after `pnpm --filter @annaadhya/api run build`.
#
# Cases:
#   A  production env WITHOUT Firebase creds -> instant 200, body flips to
#      bootFailed JSON, report says FAILED           (failure-path oracle)
#   B  node src/boot.js  + full env -> instant 200 then real routes
#   C  node main.js      + full env -> instant 200 then real routes
#   D  npm start         + full env -> instant 200 then real routes
set -u

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_SRC="$API_DIR/dist"
WORK="$(mktemp -d /tmp/annaadhya-verify.XXXXXX)"
# Random port base per run: a stale server from an earlier session squatting a
# fixed port (seen twice already in this project) would silently answer the
# probes and poison the case. Verify ports are never reused across runs.
BASE_PORT=$(( (RANDOM % 1500) + 4300 ))
PASS=0
FAIL=0
PIDS=()

cleanup() {
  for p in "${PIDS[@]:-}"; do
    kill -- -"$p" 2>/dev/null || kill "$p" 2>/dev/null
    pkill -P "$p" 2>/dev/null
  done
}
trap cleanup EXIT

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS + 1)); say "PASS: $1"; }
bad()  { FAIL=$((FAIL + 1)); say "FAIL: $1"; }
check(){ if [ "$1" -eq 0 ]; then ok "$2"; else bad "$2"; fi; }

FULL_ENV=(
  NODE_ENV=production
  DATA_PROVIDER=firestore
  FIREBASE_PROJECT_ID=verify-project
  FIREBASE_CLIENT_EMAIL=verify@verify-project.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\nMIIBverify\n-----END PRIVATE KEY-----\n'
  FIRESTORE_DATABASE_ID=verify-db
  ADMIN_SETUP_KEY=verify-setup-key-12345
  CORS_ORIGINS=https://staging.annaadhya.com
)

# Elapsed ms until the FIRST successful HTTP response, or 99999 on timeout.
first_200_ms() { # $1=port $2=budget_ms
  local port="$1" t0 t1 code
  t0=$(date +%s%3N)
  for _ in $(seq 1 200); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null)
    code=${code:-000}
    if [ "$code" != "000" ]; then
      t1=$(date +%s%3N)
      echo $((t1 - t0))
      return 0
    fi
    sleep 0.05
  done
  echo 99999
}

# Poll a path until the body (whitespace-stripped) matches a regex; echoes body.
poll_body() { # $1=port $2=path $3=regex $4=timeout_s
  local port="$1" path="$2" pattern="$3" timeout="${4:-30}" i body
  for _ in $(seq 1 $((timeout * 4))); do
    body=$(curl -s --max-time 2 "http://127.0.0.1:${port}${path}" 2>/dev/null)
    if [ -n "$body" ] && printf '%s' "$body" | tr -d ' \n' | rg -q "$pattern"; then
      printf '%s' "$body"
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_report() { # $1=file $2=regex $3=timeout_s
  local file="$1" pattern="$2" timeout="${3:-15}" i
  for _ in $(seq 1 $((timeout * 2))); do
    if [ -f "$file" ] && rg -q "$pattern" "$file" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  return 1
}

start_case() { # $1=name $2=port $3=command...
  local name="$1" port="$2"; shift 2
  local dir="$WORK/$name"
  if ss -ltn 2>/dev/null | rg -q ":${port} "; then
    bad "case $name precondition: port ${port} already occupied before launch"
    return 1
  fi
  cp -r "$DIST_SRC" "$dir"
  (
    cd "$dir" || exit 1
    # setsid: $! becomes the session leader; `kill -- -PID` later wipes the
    # whole tree (npm start spawns sh -> node, which plain kill misses).
    setsid env "${CASE_ENV[@]}" PORT="$port" "$@" >stdout.log 2>stderr.log &
    echo $! >pid
  )
  PIDS+=("$(cat "$dir/pid")")
}

fail_case_report() { # diagnostics on failure
  local dir="$1"
  say "  --- stderr tail ---"; tail -5 "$dir/stderr.log" 2>/dev/null | sed 's/^/  /'
  say "  --- last body ---"; say "  ${LAST_BODY:-<none>}"
}

# ---------------- Case A: failure-path oracle (no Firebase creds) ----------------
say "=== Case A: prod env without Firebase creds -> bootFailed JSON + FAILED report ==="
CASE_ENV=(NODE_ENV=production DATA_PROVIDER=firestore)
A_DIR="$WORK/A"
A_PORT=$((BASE_PORT + 1))
start_case A "$A_PORT" node src/boot.js

ms=$(first_200_ms "$A_PORT" 2000)
check "$([ "$ms" -le 2000 ] && echo 0 || echo 1)" "A1 instant HTTP 200 within 2s (got ${ms}ms)"

LAST_BODY=$(poll_body "$A_PORT" / 'bootFailed' 30 || true)
check "$([ -n "$LAST_BODY" ] && echo 0 || echo 1)" "A2 body flips to bootFailed explanation"
check "$(printf '%s' "$LAST_BODY" | rg -q 'Production requires Firebase' && echo 0 || echo 1)" \
  "A3 body names the exact missing configuration"
check "$([ -f "$A_DIR/annaadhya-boot-report.txt" ] && echo 0 || echo 1)" "A4 boot report file exists in cwd"
check "$(wait_report "$A_DIR/annaadhya-boot-report.txt" 'boot report - FAILED' 10 && echo 0 || echo 1)" \
  "A5 report says FAILED"
check "$(rg -q 'published directory census' "$A_DIR/annaadhya-boot-report.txt" 2>/dev/null && echo 0 || echo 1)" \
  "A6 report carries the published-directory census"
[ "$FAIL" -gt 0 ] && fail_case_report "$A_DIR"

# ---------------- Cases B/C/D: success path via the three entry conventions ----------------
for CASE in B C D; do
  case "$CASE" in
    B) ENTRY_CMD=(node src/boot.js); PORT=$((BASE_PORT + 2)) ;;
    C) ENTRY_CMD=(node main.js);     PORT=$((BASE_PORT + 3)) ;;
    D) ENTRY_CMD=(npm start);        PORT=$((BASE_PORT + 4)) ;;
  esac
  say "=== Case $CASE: full prod env via ${ENTRY_CMD[*]} ==="
  CASE_ENV=("${FULL_ENV[@]}")
  DIR="$WORK/$CASE"
  start_case "$CASE" "$PORT" "${ENTRY_CMD[@]}"

  ms=$(first_200_ms "$PORT" 2000)
  check "$([ "$ms" -le 2000 ] && echo 0 || echo 1)" "$CASE 1 instant HTTP 200 within 2s (got ${ms}ms)"

  LAST_BODY=$(poll_body "$PORT" /api/v1/health '"ok":true' 30 || true)
  check "$([ -n "$LAST_BODY" ] && echo 0 || echo 1)" "$CASE 2 /api/v1/health returns ok:true"
  check "$(printf '%s' "$LAST_BODY" | tr -d ' \n' | rg -q '"provider":"firestore"' && echo 0 || echo 1)" \
    "$CASE 3 health: provider=firestore"
  check "$(printf '%s' "$LAST_BODY" | tr -d ' \n' | rg -q '"auth":"firebase"' && echo 0 || echo 1)" \
    "$CASE 4 health: auth=firebase"
  check "$(wait_report "$DIR/annaadhya-boot-report.txt" 'boot report - ok' 15 && echo 0 || echo 1)" \
    "$CASE 5 boot report ends with ok"
  check "$(rg -q 'node_modules: PRESENT' "$DIR/annaadhya-boot-report.txt" 2>/dev/null && echo 0 || echo 1)" \
    "$CASE 6 report census: node_modules PRESENT"
done

say "=== Summary: $PASS passed, $FAIL failed (workdir $WORK) ==="
[ "$FAIL" -eq 0 ] || exit 1
