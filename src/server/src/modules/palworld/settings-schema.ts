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