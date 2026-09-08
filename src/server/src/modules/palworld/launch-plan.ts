import type {
  AppConfig
} from "../../config/app-config.js";

import {
  getPalworldPaths
} from "./paths.js";

export interface PalworldProcessSpec {
  executable: string;

  args: readonly string[];

  cwd: string;
}

export function createPalworldProcessSpec(
  config: Readonly<AppConfig>
): PalworldProcessSpec | null {
  if (!config.palworldRoot) {
    return null;
  }

  const paths =
    getPalworldPaths(
      config.palworldRoot
    );

  return {
    executable:
      paths.launchScript,

    args: [
      `-port=${config.palworldGamePort}`
    ],

    cwd:
      config.palworldRoot
  };
}