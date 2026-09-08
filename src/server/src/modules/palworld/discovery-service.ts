import {
  existsSync,
  readFileSync,
  statSync
} from "node:fs";

import type { AppConfig } from "../../config/app-config.js";
import {
  getPalworldPaths,
  type PalworldPaths
} from "./paths.js";
import {
  parsePalworldSettings,
  type PalworldSettingValue
} from "./settings-parser.js";

const MAX_SETTINGS_FILE_SIZE =
  2 * 1024 * 1024;

const SAFE_PREVIEW_KEYS = new Set([
  "Difficulty",
  "ServerName",
  "ServerDescription",
  "ServerPlayerMaxNum",
  "PublicPort",
  "PublicIP",
  "Region",
  "RCONEnabled",
  "RCONPort",
  "RESTAPIEnabled",
  "RESTAPIPort"
]);

const SENSITIVE_KEYS = new Set([
  "AdminPassword",
  "ServerPassword"
]);

function exists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

export interface PalworldSettingsSummary {
  exists: boolean;

  validSection: boolean;
  optionSettingsFound: boolean;

  settingCount: number;

  safePreview: Record<
    string,
    PalworldSettingValue
  >;

  sensitiveSettingsPresent: string[];

  error: string | null;
}

export interface PalworldDiscoverySnapshot {
  configured: boolean;

  paths: PalworldPaths | null;

  installation: {
    rootExists: boolean;

    launchScriptExists: boolean;
    defaultSettingsExists: boolean;

    savedPathExists: boolean;
    liveSettingsExists: boolean;

    saveGamesPathExists: boolean;
    logsPathExists: boolean;
  };

  settings: PalworldSettingsSummary;
}

export class PalworldDiscoveryService {
  public constructor(
    private readonly config:
      Readonly<AppConfig>
  ) {}

  public snapshot():
    PalworldDiscoverySnapshot {
    if (!this.config.palworldRoot) {
      return {
        configured: false,

        paths: null,

        installation: {
          rootExists: false,
          launchScriptExists: false,
          defaultSettingsExists: false,
          savedPathExists: false,
          liveSettingsExists: false,
          saveGamesPathExists: false,
          logsPathExists: false
        },

        settings: {
          exists: false,
          validSection: false,
          optionSettingsFound: false,
          settingCount: 0,
          safePreview: {},
          sensitiveSettingsPresent: [],
          error: null
        }
      };
    }

    const paths =
      getPalworldPaths(
        this.config.palworldRoot
      );

    return {
      configured: true,

      paths,

      installation: {
        rootExists:
          exists(paths.root),

        launchScriptExists:
          exists(paths.launchScript),

        defaultSettingsExists:
          exists(paths.defaultSettings),

        savedPathExists:
          exists(paths.saved),

        liveSettingsExists:
          exists(paths.liveSettings),

        saveGamesPathExists:
          exists(paths.saveGames),

        logsPathExists:
          exists(paths.logs)
      },

      settings:
        this.readSettingsSummary(
          paths.liveSettings
        )
    };
  }

  private readSettingsSummary(
    settingsPath: string
  ): PalworldSettingsSummary {
    if (!exists(settingsPath)) {
      return {
        exists: false,
        validSection: false,
        optionSettingsFound: false,
        settingCount: 0,
        safePreview: {},
        sensitiveSettingsPresent: [],
        error: null
      };
    }

    try {
      const file = statSync(settingsPath);

      if (
        file.size >
        MAX_SETTINGS_FILE_SIZE
      ) {
        return {
          exists: true,
          validSection: false,
          optionSettingsFound: false,
          settingCount: 0,
          safePreview: {},
          sensitiveSettingsPresent: [],
          error:
            "PalWorldSettings.ini exceeds the allowed size."
        };
      }

      const contents =
        readFileSync(
          settingsPath,
          "utf8"
        );

      const parsed =
        parsePalworldSettings(contents);

      const safePreview: Record<
        string,
        PalworldSettingValue
      > = {};

      const sensitiveSettingsPresent:
        string[] = [];

      for (
        const [key, value]
        of Object.entries(
          parsed.settings
        )
      ) {
        if (SAFE_PREVIEW_KEYS.has(key)) {
          safePreview[key] = value;
        }

        if (SENSITIVE_KEYS.has(key)) {
          sensitiveSettingsPresent.push(
            key
          );
        }
      }

      return {
        exists: true,

        validSection:
          parsed.sectionFound,

        optionSettingsFound:
          parsed.optionSettingsFound,

        settingCount:
          Object.keys(
            parsed.settings
          ).length,

        safePreview,

        sensitiveSettingsPresent,

        error: null
      };
    } catch {
      return {
        exists: true,
        validSection: false,
        optionSettingsFound: false,
        settingCount: 0,
        safePreview: {},
        sensitiveSettingsPresent: [],
        error:
          "PalWorldSettings.ini could not be read."
      };
    }
  }
}