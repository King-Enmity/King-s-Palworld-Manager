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
  parsePalworldSettings
} from "./settings-parser.js";

const MAX_SETTINGS_FILE_SIZE =
  2 * 1024 * 1024;

export interface PalworldRestConfigurationSnapshot {
  configured: boolean;

  liveSettingsPresent: boolean;
  liveSettingsValid: boolean;

  enabled: boolean;

  port: number;

  usernameConfigured: boolean;
  adminPasswordConfigured: boolean;

  errors: string[];
}

interface ResolvedPalworldRestConfiguration {
  snapshot:
    PalworldRestConfigurationSnapshot;

  username: string;
  password: string | null;
}

export class PalworldRestConfigurationProvider {
  public constructor(
    private readonly config:
      Readonly<AppConfig>
  ) {}

  public snapshot():
    PalworldRestConfigurationSnapshot {
    return this.resolve()
      .snapshot;
  }

  public resolve():
    ResolvedPalworldRestConfiguration {
    const snapshot:
      PalworldRestConfigurationSnapshot = {
        configured:
          Boolean(
            this.config.palworldRoot
          ),

        liveSettingsPresent:
          false,

        liveSettingsValid:
          false,

        enabled:
          false,

        port:
          this.config
            .palworldRestPort,

        usernameConfigured:
          this.config
            .palworldRestUsername
            .length > 0,

        adminPasswordConfigured:
          false,

        errors:
          []
      };

    if (!this.config.palworldRoot) {
      snapshot.errors.push(
        "Palworld root is not configured."
      );

      return {
        snapshot,

        username:
          this.config
            .palworldRestUsername,

        password:
          null
      };
    }

    const paths =
      getPalworldPaths(
        this.config
          .palworldRoot
      );

    if (
      !existsSync(
        paths.liveSettings
      )
    ) {
      snapshot.errors.push(
        "Live Palworld settings do not exist."
      );

      return {
        snapshot,

        username:
          this.config
            .palworldRestUsername,

        password:
          null
      };
    }

    snapshot.liveSettingsPresent =
      true;

    let document:
      string;

    try {
      const stat =
        statSync(
          paths.liveSettings
        );

      if (
        stat.size >
        MAX_SETTINGS_FILE_SIZE
      ) {
        snapshot.errors.push(
          "Live Palworld settings exceed the allowed size."
        );

        return {
          snapshot,

          username:
            this.config
              .palworldRestUsername,

          password:
            null
        };
      }

      document =
        readFileSync(
          paths.liveSettings,
          "utf8"
        );
    } catch {
      snapshot.errors.push(
        "Live Palworld settings could not be read."
      );

      return {
        snapshot,

        username:
          this.config
            .palworldRestUsername,

        password:
          null
      };
    }

    const parsed =
      parsePalworldSettings(
        document
      );

    if (
      !parsed.sectionFound ||
      !parsed.optionSettingsFound
    ) {
      snapshot.errors.push(
        "Live Palworld settings could not be parsed."
      );

      return {
        snapshot,

        username:
          this.config
            .palworldRestUsername,

        password:
          null
      };
    }

    snapshot.liveSettingsValid =
      true;

    const enabled =
      parsed.settings
        .RESTAPIEnabled;

    if (
      enabled !== undefined &&
      typeof enabled !==
        "boolean"
    ) {
      snapshot.errors.push(
        "RESTAPIEnabled has an invalid type."
      );
    }

    if (
      typeof enabled ===
      "boolean"
    ) {
      snapshot.enabled =
        enabled;
    }

    const configuredPort =
      parsed.settings
        .RESTAPIPort;

    if (
      configuredPort !== undefined
    ) {
      if (
        typeof configuredPort !==
          "number" ||
        !Number.isInteger(
          configuredPort
        ) ||
        configuredPort < 1 ||
        configuredPort > 65535
      ) {
        snapshot.errors.push(
          "RESTAPIPort is invalid."
        );
      }

      if (
        typeof configuredPort ===
          "number" &&
        Number.isInteger(
          configuredPort
        ) &&
        configuredPort >= 1 &&
        configuredPort <= 65535
      ) {
        snapshot.port =
          configuredPort;
      }
    }

    const adminPassword =
      parsed.settings
        .AdminPassword;

    let password:
      string | null =
        null;

    if (
      adminPassword !== undefined &&
      typeof adminPassword !==
        "string"
    ) {
      snapshot.errors.push(
        "AdminPassword has an invalid type."
      );
    }

    if (
      typeof adminPassword ===
        "string" &&
      adminPassword.length > 0
    ) {
      password =
        adminPassword;

      snapshot.adminPasswordConfigured =
        true;
    }

    return {
      snapshot,

      username:
        this.config
          .palworldRestUsername,

      password
    };
  }
}