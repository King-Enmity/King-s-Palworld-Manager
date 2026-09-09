import type {
  PalworldSettingValue
} from "./settings-parser.js";

export type PalworldSettingType =
  | "boolean"
  | "integer"
  | "number"
  | "string";

export type PalworldSettingOrigin =
  | "default"
  | "live-only";

export type PalworldSettingCategory =
  | "General"
  | "World & Progression"
  | "Pals"
  | "Players"
  | "Building & Bases"
  | "Guilds & PvP"
  | "Server & Network"
  | "Admin & API"
  | "Performance & Logging"
  | "Advanced";

export interface PalworldValidationIssue {
  code: string;
  message: string;
}

export interface PalworldSettingValidation {
  valid: boolean;

  errors: PalworldValidationIssue[];
  warnings: PalworldValidationIssue[];
}

export interface PalworldSettingDescriptor {
  key: string;

  label: string;

  description:
    string |
    null;

  category:
    PalworldSettingCategory;

  type: PalworldSettingType;
  origin: PalworldSettingOrigin;

  knownByInstalledDefaults: boolean;
  sensitive: boolean;

  defaultPresent: boolean;
  currentPresent: boolean;

  defaultValue:
    | PalworldSettingValue
    | null;

  currentValue:
    | PalworldSettingValue
    | null;

  secretConfigured: boolean;

  modified: boolean;

  validation:
    PalworldSettingValidation;
}

export interface PalworldSettingsSnapshot {
  configured: boolean;

  defaultFileExists: boolean;
  liveFileExists: boolean;

  defaultFileValid: boolean;
  liveFileValid: boolean;

  errors: string[];

  summary: {
    total: number;
    modified: number;
    invalid: number;
    unknown: number;
    sensitive: number;
  };

  settings:
    PalworldSettingDescriptor[];
}