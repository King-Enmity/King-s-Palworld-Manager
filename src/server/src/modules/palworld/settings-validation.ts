import type {
  PalworldSettingValue
} from "./settings-parser.js";

import type {
  PalworldSettingType,
  PalworldSettingValidation,
  PalworldValidationIssue
} from "./settings-schema.js";

interface NumericRule {
  min?: number;
  max?: number;
}

const SENSITIVE_SETTINGS =
  new Set([
    "AdminPassword",
    "ServerPassword"
  ]);

const PORT_SETTINGS =
  new Set([
    "PublicPort",
    "RCONPort",
    "RESTAPIPort"
  ]);

const OFFICIAL_NUMERIC_RULES:
  Readonly<
    Record<string, NumericRule>
  > = {
    BaseCampMaxNumInGuild: {
      max: 10
    },

    BaseCampWorkerMaxNum: {
      max: 50
    },

    ServerReplicatePawnCullDistance: {
      min: 5000,
      max: 15000
    }
  };

export function isSensitiveSetting(
  key: string
): boolean {
  return SENSITIVE_SETTINGS.has(key);
}

export function inferSettingType(
  value: PalworldSettingValue
): PalworldSettingType {
  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return "integer";
    }

    return "number";
  }

  return "string";
}

function matchesExpectedType(
  value: PalworldSettingValue,
  expected: PalworldSettingType
): boolean {
  if (expected === "boolean") {
    return typeof value === "boolean";
  }

  if (expected === "string") {
    return typeof value === "string";
  }

  if (expected === "integer") {
    return (
      typeof value === "number" &&
      Number.isInteger(value)
    );
  }

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function issue(
  code: string,
  message: string
): PalworldValidationIssue {
  return {
    code,
    message
  };
}

export function validateSetting(
  key: string,
  value: PalworldSettingValue,
  expectedType: PalworldSettingType,
  knownByInstalledDefaults: boolean
): PalworldSettingValidation {
  const errors:
    PalworldValidationIssue[] = [];

  const warnings:
    PalworldValidationIssue[] = [];

  if (
    !matchesExpectedType(
      value,
      expectedType
    )
  ) {
    errors.push(
      issue(
        "type-mismatch",
        `Expected ${expectedType}.`
      )
    );

    return {
      valid: false,
      errors,
      warnings
    };
  }

  if (
    PORT_SETTINGS.has(key) &&
    typeof value === "number"
  ) {
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > 65535
    ) {
      errors.push(
        issue(
          "invalid-port",
          "Port must be an integer from 1 through 65535."
        )
      );
    }
  }

  const numericRule =
    OFFICIAL_NUMERIC_RULES[key];

  if (
    numericRule &&
    typeof value === "number"
  ) {
    if (
      numericRule.min !== undefined &&
      value < numericRule.min
    ) {
      errors.push(
        issue(
          "below-minimum",
          `Value must be at least ${numericRule.min}.`
        )
      );
    }

    if (
      numericRule.max !== undefined &&
      value > numericRule.max
    ) {
      errors.push(
        issue(
          "above-maximum",
          `Value must not exceed ${numericRule.max}.`
        )
      );
    }
  }

  if (!knownByInstalledDefaults) {
    warnings.push(
      issue(
        "unknown-setting",
        "Setting is not present in the installed DefaultPalWorldSettings.ini."
      )
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}