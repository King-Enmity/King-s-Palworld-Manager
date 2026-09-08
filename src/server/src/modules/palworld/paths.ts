import path from "node:path";

export interface PalworldPaths {
  root: string;

  launchScript: string;
  defaultSettings: string;

  saved: string;
  liveSettings: string;

  saveGames: string;
  logs: string;
}

export function getPalworldPaths(
  root: string
): PalworldPaths {
  return {
    root,

    launchScript:
      path.join(root, "PalServer.sh"),

    defaultSettings:
      path.join(
        root,
        "DefaultPalWorldSettings.ini"
      ),

    saved:
      path.join(
        root,
        "Pal",
        "Saved"
      ),

    liveSettings:
      path.join(
        root,
        "Pal",
        "Saved",
        "Config",
        "LinuxServer",
        "PalWorldSettings.ini"
      ),

    saveGames:
      path.join(
        root,
        "Pal",
        "Saved",
        "SaveGames"
      ),

    logs:
      path.join(
        root,
        "Pal",
        "Saved",
        "Logs"
      )
  };
}