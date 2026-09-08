import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync
} from "node:fs";

import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  join
} from "node:path";

import type {
  AppConfig
} from "../../config/app-config.js";

import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  writeTextFileAtomic
} from "../../infrastructure/atomic-file.js";

import {
  getPalworldPaths
} from "./paths.js";

import {
  parsePalworldSettings,
  type PalworldSettingValue
} from "./settings-parser.js";

import {
  patchPalworldSettingsDocument
} from "./settings-document.js";

import {
  inferSettingType,
  isSensitiveSetting,
  validateSetting
} from "./settings-validation.js";

export interface SettingsWriteIssue {
  key: string | null;
  code: string;
  message: string;
}

export interface SettingsWriteChange {
  key: string;
  sensitive: boolean;

  beforeValue:
    | PalworldSettingValue
    | null;

  afterValue:
    | PalworldSettingValue
    | null;

  beforeSecretConfigured: boolean;
  afterSecretConfigured: boolean;
}

export interface SettingsWritePreview {
  valid: boolean;
  changed: boolean;
  restartRequired: boolean;

  sourceSha256: string | null;
  proposedSha256: string | null;

  errors: SettingsWriteIssue[];
  warnings: SettingsWriteIssue[];

  changes: SettingsWriteChange[];
}

export interface SettingsApplyResult
  extends SettingsWritePreview {
  applied: boolean;
  snapshotId: string | null;
}

export class SettingsWriteError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

function sha256(contents: string): string {
  return createHash("sha256")
    .update(contents, "utf8")
    .digest("hex");
}

function configured(
  value: PalworldSettingValue | undefined
): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  return true;
}

export class PalworldSettingsWriter {
  public constructor(
    private readonly config: Readonly<AppConfig>,
    private readonly audit: AuditRepository
  ) {}

  public preview(
    changes: Readonly<Record<string, PalworldSettingValue>>
  ): SettingsWritePreview {
    const errors: SettingsWriteIssue[] = [];
    const warnings: SettingsWriteIssue[] = [];
    const previewChanges: SettingsWriteChange[] = [];

    if (!this.config.palworldRoot) {
      return {
        valid: false,
        changed: false,
        restartRequired: false,
        sourceSha256: null,
        proposedSha256: null,
        errors: [{
          key: null,
          code: "palworld-not-configured",
          message: "Palworld root is not configured."
        }],
        warnings,
        changes: []
      };
    }

    const keys = Object.keys(changes);

    if (keys.length === 0) {
      errors.push({
        key: null,
        code: "empty-change-set",
        message: "At least one setting change is required."
      });
    }

    if (keys.length > 100) {
      errors.push({
        key: null,
        code: "too-many-changes",
        message: "No more than 100 settings may be changed at once."
      });
    }

    const paths = getPalworldPaths(
      this.config.palworldRoot
    );

    if (!existsSync(paths.defaultSettings)) {
      errors.push({
        key: null,
        code: "defaults-missing",
        message: "DefaultPalWorldSettings.ini does not exist."
      });
    }

    if (!existsSync(paths.liveSettings)) {
      errors.push({
        key: null,
        code: "live-settings-missing",
        message: "PalWorldSettings.ini does not exist."
      });
    }

    if (errors.length > 0) {
      return {
        valid: false,
        changed: false,
        restartRequired: false,
        sourceSha256: null,
        proposedSha256: null,
        errors,
        warnings,
        changes: []
      };
    }

    const defaultDocument =
      readFileSync(paths.defaultSettings, "utf8");

    const liveDocument =
      readFileSync(paths.liveSettings, "utf8");

    const defaults =
      parsePalworldSettings(defaultDocument);

    const live =
      parsePalworldSettings(liveDocument);

    if (
      !defaults.sectionFound ||
      !defaults.optionSettingsFound
    ) {
      errors.push({
        key: null,
        code: "invalid-defaults",
        message: "Installed default settings could not be parsed."
      });
    }

    if (
      !live.sectionFound ||
      !live.optionSettingsFound
    ) {
      errors.push({
        key: null,
        code: "invalid-live-settings",
        message: "Live settings could not be parsed."
      });
    }

    for (const [key, requestedValue] of Object.entries(changes)) {
      const defaultValue = defaults.settings[key];
      const currentValue = live.settings[key];

      if (defaultValue === undefined) {
        errors.push({
          key,
          code: "unknown-write-not-allowed",
          message:
            "Settings absent from the installed defaults are preserved but cannot be edited."
        });

        continue;
      }

      const expectedType =
        inferSettingType(defaultValue);

      const validation =
        validateSetting(
          key,
          requestedValue,
          expectedType,
          true
        );

      for (const error of validation.errors) {
        errors.push({
          key,
          code: error.code,
          message: error.message
        });
      }

      for (const warning of validation.warnings) {
        warnings.push({
          key,
          code: warning.code,
          message: warning.message
        });
      }

      const sensitive =
        isSensitiveSetting(key);

      previewChanges.push({
        key,
        sensitive,

        beforeValue:
          sensitive
            ? null
            : currentValue ?? null,

        afterValue:
          sensitive
            ? null
            : requestedValue,

        beforeSecretConfigured:
          sensitive &&
          configured(currentValue),

        afterSecretConfigured:
          sensitive &&
          configured(requestedValue)
      });
    }

    const sourceSha256 =
      sha256(liveDocument);

    if (errors.length > 0) {
      return {
        valid: false,
        changed: false,
        restartRequired: false,
        sourceSha256,
        proposedSha256: null,
        errors,
        warnings,
        changes: previewChanges
      };
    }

    let proposedDocument: string;

    try {
      proposedDocument =
        patchPalworldSettingsDocument(
          liveDocument,
          changes
        );
    } catch (error) {
      errors.push({
        key: null,
        code: "unsafe-document",
        message:
          error instanceof Error
            ? error.message
            : "Configuration document cannot be safely edited."
      });

      return {
        valid: false,
        changed: false,
        restartRequired: false,
        sourceSha256,
        proposedSha256: null,
        errors,
        warnings,
        changes: previewChanges
      };
    }

    const proposedSha256 =
      sha256(proposedDocument);

    const changed =
      proposedSha256 !== sourceSha256;

    return {
      valid: true,
      changed,
      restartRequired: changed,
      sourceSha256,
      proposedSha256,
      errors,
      warnings,
      changes: previewChanges
    };
  }

  public apply(
    changes: Readonly<Record<string, PalworldSettingValue>>,
    expectedSourceSha256: string
  ): SettingsApplyResult {
    const preview =
      this.preview(changes);

    if (!preview.valid) {
      throw new SettingsWriteError(
        "Requested settings are invalid.",
        400,
        "settings-validation-failed"
      );
    }

    if (
      !preview.sourceSha256 ||
      preview.sourceSha256 !== expectedSourceSha256
    ) {
      throw new SettingsWriteError(
        "PalWorldSettings.ini changed after the preview was created.",
        409,
        "settings-conflict"
      );
    }

    if (!preview.changed) {
      return {
        ...preview,
        applied: false,
        snapshotId: null
      };
    }

    if (!this.config.palworldRoot) {
      throw new SettingsWriteError(
        "Palworld root is not configured.",
        500,
        "palworld-not-configured"
      );
    }

    const paths =
      getPalworldPaths(
        this.config.palworldRoot
      );

    const currentDocument =
      readFileSync(
        paths.liveSettings,
        "utf8"
      );

    const actualHash =
      sha256(currentDocument);

    if (actualHash !== expectedSourceSha256) {
      throw new SettingsWriteError(
        "PalWorldSettings.ini changed before the write could be committed.",
        409,
        "settings-conflict"
      );
    }

    const proposedDocument =
      patchPalworldSettingsDocument(
        currentDocument,
        changes
      );

    const proposedHash =
      sha256(proposedDocument);

    const snapshotId =
      randomUUID();

    const snapshotDirectory =
      join(
        this.config.dataPath,
        "settings-snapshots"
      );

    mkdirSync(
      snapshotDirectory,
      {
        recursive: true
      }
    );

    const snapshotPath =
      join(
        snapshotDirectory,
        `${snapshotId}.PalWorldSettings.ini`
      );

    copyFileSync(
      paths.liveSettings,
      snapshotPath
    );

    try {
      writeTextFileAtomic(
        paths.liveSettings,
        proposedDocument
      );

      const verifiedDocument =
        readFileSync(
          paths.liveSettings,
          "utf8"
        );

      if (
        sha256(verifiedDocument) !==
        proposedHash
      ) {
        throw new Error(
          "Configuration verification failed after replacement."
        );
      }
    } catch (error) {
      copyFileSync(
        snapshotPath,
        paths.liveSettings
      );

      throw new SettingsWriteError(
        error instanceof Error
          ? error.message
          : "Configuration write failed.",
        500,
        "settings-write-failed"
      );
    }

    this.audit.record({
      category: "palworld-settings",
      action: "updated",
      message:
        "Palworld configuration settings were updated.",
      metadata: {
        keys:
          Object.keys(changes),
        snapshotId,
        sourceSha256:
          expectedSourceSha256,
        resultingSha256:
          proposedHash,
        restartRequired: true
      }
    });

    return {
      ...preview,
      applied: true,
      snapshotId,
      proposedSha256:
        proposedHash
    };
  }
}