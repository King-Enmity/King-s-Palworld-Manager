#!/usr/bin/env bash
set -Eeuo pipefail

PAL_ROOT="${KPM_PALWORLD_ROOT:-/pal/Package}"
DATA_ROOT="${KPM_DATA_PATH:-/manager/data}"

STEAMCMD_ROOT="/opt/steamcmd"
STEAMCMD="${STEAMCMD_ROOT}/steamcmd.sh"

PALWORLD_APP_ID="2394010"

export HOME="/home/kpm"

run_as_kpm() {
    if [ "$(id -u)" -eq 0 ]; then
        exec_as_user=(
            gosu
            kpm
        )

        "${exec_as_user[@]}" "$@"
        return
    fi

    "$@"
}

mkdir -p \
    /pal \
    /manager \
    "${PAL_ROOT}" \
    "${DATA_ROOT}"

if [ "$(id -u)" -eq 0 ]; then
    chown kpm:kpm \
        /pal \
        /manager \
        "${PAL_ROOT}" \
        "${DATA_ROOT}"
fi

INSTALL_REQUIRED="0"

if [ ! -x "${PAL_ROOT}/PalServer.sh" ]; then
    INSTALL_REQUIRED="1"
fi

UPDATE_REQUESTED="${KPM_STEAM_UPDATE_ON_START:-1}"

if [ "${INSTALL_REQUIRED}" = "1" ] || [ "${UPDATE_REQUESTED}" = "1" ]; then
    echo "[KPM] Installing/updating Palworld Dedicated Server..."

    run_as_kpm \
        "${STEAMCMD}" \
        +force_install_dir "${PAL_ROOT}" \
        +login anonymous \
        +app_update "${PALWORLD_APP_ID}" validate \
        +quit

    echo "[KPM] SteamCMD operation completed."
fi

if [ ! -f "${PAL_ROOT}/PalServer.sh" ]; then
    echo "[KPM] PalServer.sh was not found after SteamCMD completed." >&2
    exit 1
fi

run_as_kpm \
    chmod +x \
    "${PAL_ROOT}/PalServer.sh"

LIVE_SETTINGS="${PAL_ROOT}/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
DEFAULT_SETTINGS="${PAL_ROOT}/DefaultPalWorldSettings.ini"

if [ ! -f "${LIVE_SETTINGS}" ] && [ -f "${DEFAULT_SETTINGS}" ]; then
    echo "[KPM] Creating initial PalWorldSettings.ini from Pocketpair defaults..."

    run_as_kpm \
        mkdir -p \
        "$(dirname "${LIVE_SETTINGS}")"

    run_as_kpm \
        cp \
        "${DEFAULT_SETTINGS}" \
        "${LIVE_SETTINGS}"
fi

if [ -f "${STEAMCMD_ROOT}/linux64/steamclient.so" ]; then
    run_as_kpm \
        mkdir -p \
        /home/kpm/.steam/sdk64

    run_as_kpm \
        ln -sf \
        "${STEAMCMD_ROOT}/linux64/steamclient.so" \
        /home/kpm/.steam/sdk64/steamclient.so
fi

echo "[KPM] Starting King's Palworld Manager..."

if [ "$(id -u)" -eq 0 ]; then
    exec gosu kpm "$@"
fi

exec "$@"