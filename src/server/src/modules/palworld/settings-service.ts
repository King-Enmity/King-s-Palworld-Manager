import {
  existsSync,
  readFileSync,
  statSync
} from "node:fs";

import type {
  AppConfig
} from "../../config/app-config.js";

import {
  getPalworldPaths
} from "./paths.js";

import {
  parsePalworldSettings,
  type ParsedPalworldSettings,
  type PalworldSettingValue
} from "./settings-parser.js";

import type {
  PalworldSettingDescriptor,
  PalworldSettingsSnapshot
} from "./settings-schema.js";

import {
  inferSettingType,
  isSensitiveSetting,
  validateSetting
} from "./settings-validation.js";

const MAX_SETTINGS_FILE_SIZE =
  2 * 1024 * 1024;

interface ReadResult {
  exists: boolean;

  parsed:
    | ParsedPalworldSettings
    | null;

  error:
    | string
    | null;
}

function valuesEqual(
  left: PalworldSettingValue,
  right: PalworldSettingValue
): boolean {
  return left === right;
}

function secretConfigured(
  value:
    | PalworldSettingValue
    | undefined
): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  return true;
}

export class PalworldSettingsService {
  public constructor(
    private readonly config:
      Readonly<AppConfig>
  ) {}

  public snapshot():
    PalworldSettingsSnapshot {
    if (!this.config.palworldRoot) {
      return {
        configured: false,

        defaultFileExists: false,
        liveFileExists: false,

        defaultFileValid: false,
        liveFileValid: false,

        errors: [],

        summary: {
          total: 0,
          modified: 0,
          invalid: 0,
          unknown: 0,
          sensitive: 0
        },

        settings: []
      };
    }

    const paths =
      getPalworldPaths(
        this.config.palworldRoot
      );

    const defaults =
      this.readFile(
        paths.defaultSettings
      );

    const live =
      this.readFile(
        paths.liveSettings
      );

    const errors: string[] = [];

    if (defaults.error) {
      errors.push(defaults.error);
    }

    if (live.error) {
      errors.push(live.error);
    }

    const defaultSettings =
      defaults.parsed?.settings ??
      {};

    const liveSettings =
      live.parsed?.settings ??
      {};

    const keys = new Set<string>([
      ...Object.keys(defaultSettings),
      ...Object.keys(liveSettings)
    ]);

    const descriptors:
      PalworldSettingDescriptor[] = [];

    for (const key of keys) {
      const defaultValue =
        defaultSettings[key];

      const currentValue =
        liveSettings[key];

      const defaultPresent =
        defaultValue !== undefined;

      const currentPresent =
        currentValue !== undefined;

      const knownByInstalledDefaults =
        defaultPresent;

      const sourceValue =
        defaultValue ??
        currentValue;

      if (sourceValue === undefined) {
        continue;
      }

      const type =
        inferSettingType(
          sourceValue
        );

      const sensitive =
        isSensitiveSetting(key);

      const validation =
        currentValue !== undefined
          ? validateSetting(
              key,
              currentValue,
              type,
              knownByInstalledDefaults
            )
          : {
              valid: true,
              errors: [],
              warnings: []
            };

      let modified = false;

      if (
        defaultValue !== undefined &&
        currentValue !== undefined
      ) {
        modified =
          !valuesEqual(
            defaultValue,
            currentValue
          );
      }

      if (
        defaultValue === undefined &&
        currentValue !== undefined
      ) {
        modified = true;
      }

      descriptors.push({
        key,

        type,

        origin:
          knownByInstalledDefaults
            ? "default"
            : "live-only",

        knownByInstalledDefaults,
        sensitive,

        defaultPresent,
        currentPresent,

        defaultValue:
          sensitive
            ? null
            : defaultValue ?? null,

        currentValue:
          sensitive
            ? null
            : currentValue ?? null,

        secretConfigured:
          sensitive &&
          secretConfigured(
            currentValue
          ),

        modified,

        validation
      });
    }

    descriptors.sort(
      (left, right) =>
        left.key.localeCompare(
          right.key
        )
    );

    return {
      configured: true,

      defaultFileExists:
        defaults.exists,

      liveFileExists:
        live.exists,

      defaultFileValid:
        defaults.parsed !== null &&
        defaults.parsed.sectionFound &&
        defaults.parsed.optionSettingsFound,

      liveFileValid:
        live.parsed !== null &&
        live.parsed.sectionFound &&
        live.parsed.optionSettingsFound,

      errors,

      summary: {
        total:
          descriptors.length,

        modified:
          descriptors.filter(
            setting =>
              setting.modified
          ).length,

        invalid:
          descriptors.filter(
            setting =>
              !setting.validation.valid
          ).length,

        unknown:
          descriptors.filter(
            setting =>
              !setting
                .knownByInstalledDefaults
          ).length,

        sensitive:
          descriptors.filter(
            setting =>
              setting.sensitive
          ).length
      },

      settings:
        descriptors
    };
  }

  private readFile(
    path: string
  ): ReadResult {
    try {
      if (!existsSync(path)) {
        return {
          exists: false,
          parsed: null,
          error: null
        };
      }

      const stats =
        statSync(path);

      if (
        stats.size >
        MAX_SETTINGS_FILE_SIZE
      ) {
        return {
          exists: true,
          parsed: null,
          error:
            `${path} exceeds the allowed configuration file size.`
        };
      }

      const document =
        readFileSync(
          path,
          "utf8"
        );

      const parsed =
        parsePalworldSettings(
          document
        );

      return {
        exists: true,
        parsed,
        error: null
      };
    } catch {
      return {
        exists: true,
        parsed: null,
        error:
          "A Palworld configuration file could not be read."
      };
    }
  }
}