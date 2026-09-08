#!/bin/sh
set -eu

MANAGER_BIN="/manager/app/KingPalworldManager.Api"
PALWORLD_BIN="/pal/Package/PalServer.sh"

if [ ! -x "$MANAGER_BIN" ]; then
  echo "[kpm] manager binary not found or not executable: $MANAGER_BIN" >&2
  exit 70
fi

if [ ! -f "$PALWORLD_BIN" ]; then
  echo "[kpm] Palworld server launcher not found: $PALWORLD_BIN" >&2
  exit 70
fi

mkdir -p /manager/data

shutdown_children() {
  trap - INT TERM

  if [ -n "${PALWORLD_PID:-}" ] && kill -0 "$PALWORLD_PID" 2>/dev/null; then
    kill -TERM "$PALWORLD_PID" 2>/dev/null || true
  fi

  if [ -n "${MANAGER_PID:-}" ] && kill -0 "$MANAGER_PID" 2>/dev/null; then
    kill -TERM "$MANAGER_PID" 2>/dev/null || true
  fi
}

trap shutdown_children INT TERM

printf '%s\n' "[kpm] starting King's Palworld Manager"
"$MANAGER_BIN" &
MANAGER_PID=$!

printf '%s\n' "[kpm] starting Palworld dedicated server"
/bin/sh "$PALWORLD_BIN" "$@" &
PALWORLD_PID=$!

while :; do
  if ! kill -0 "$MANAGER_PID" 2>/dev/null; then
    wait "$MANAGER_PID" || STATUS=$?
    STATUS=${STATUS:-1}
    echo "[kpm] manager process exited; stopping Palworld" >&2
    shutdown_children
    wait "$PALWORLD_PID" 2>/dev/null || true
    exit "$STATUS"
  fi

  if ! kill -0 "$PALWORLD_PID" 2>/dev/null; then
    wait "$PALWORLD_PID" || STATUS=$?
    STATUS=${STATUS:-1}
    echo "[kpm] Palworld process exited; stopping manager" >&2
    shutdown_children
    wait "$MANAGER_PID" 2>/dev/null || true
    exit "$STATUS"
  fi

  sleep 1
done
