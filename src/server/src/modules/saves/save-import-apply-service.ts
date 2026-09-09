import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  utimesSync
} from "node:fs";

import {
  createHash
} from "node:crypto";

import path from "node:path";

import type {
  AppConfig
} from "../../config/app-config.js";

import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  getPalworldPaths
} from "../palworld/paths.js";

import type {
  PalworldRuntimeSnapshot
} from "../palworld/runtime-state.js";

import type {
  SaveImportManifest,
  SaveImportService
} from "./save-import-service.js";

import {
  SaveRollbackError,
  type SaveRollbackService,
  type SaveRollbackSummary
} from "./save-rollback-service.js";

import {
  SaveInventoryError,
  type SaveInventoryService
} from "./save-inventory-service.js";

const SAFE_IDENTIFIER =
  /^[A-Za-z0-9._-]{1,128}$/;

export interface SaveImportApplyResult {
  operationId:
    string;

  kind:
    "world" |
    "player";

  applied:
    true;

  appliedAt:
    string;

  target: {
    slotId:
      string;

    worldId:
      string;

    playerId:
      string |
      null;
  };

  rollback:
    SaveRollbackSummary;

  validation: {
    filesVerified:
      true;

    hashesVerified:
      true;
  };
}

export class SaveImportApplyError
  extends Error {
  public constructor(
    message:
      string,

    public readonly statusCode:
      number,

    public readonly code:
      string
  ) {
    super(
      message
    );
  }
}

export class SaveImportApplyService {
  public constructor(
    private readonly config:
      Readonly<AppConfig>,

    private readonly imports:
      SaveImportService,

    private readonly inventory:
      SaveInventoryService,

    private readonly rollbacks:
      SaveRollbackService,

    private readonly audit:
      AuditRepository,

    private readonly runtime:
      () => PalworldRuntimeSnapshot
  ) {}

  public async apply(
    operationId:
      string,

    targetSlotId:
      string,

    targetWorldId:
      string
  ): Promise<SaveImportApplyResult> {
    this.assertStopped();

    this.validateIdentifier(
      targetSlotId,
      "slot"
    );

    this.validateIdentifier(
      targetWorldId,
      "world"
    );

    const ready =
      await this.imports
        .ready(
          operationId
        );

    if (
      ready.manifest
        .source
        .worldId !==
      targetWorldId
    ) {
      throw new SaveImportApplyError(
        "V1 save imports must preserve the original Palworld world ID.",
        409,
        "save-import-world-id-mismatch"
      );
    }

    if (
      ready.manifest.kind ===
      "world"
    ) {
      return this.applyWorld(
        ready.operationId,
        ready.dataPath,
        ready.manifest,
        targetSlotId,
        targetWorldId
      );
    }

    return this.applyPlayer(
      ready.operationId,
      ready.dataPath,
      ready.manifest,
      targetSlotId,
      targetWorldId
    );
  }

  private applyWorld(
    operationId:
      string,

    dataPath:
      string,

    manifest:
      SaveImportManifest,

    targetSlotId:
      string,

    targetWorldId:
      string
  ): SaveImportApplyResult {
    const targetWorld =
      this.worldPath(
        targetSlotId,
        targetWorldId
      );

    if (
      existsSync(
        targetWorld
      )
    ) {
      let existing;

      try {
        existing =
          this.inventory
            .world(
              targetSlotId,
              targetWorldId
            );
      } catch (
        error
      ) {
        if (
          error instanceof
          SaveInventoryError
        ) {
          throw new SaveImportApplyError(
            "Existing import target is not a recognized Palworld world.",
            409,
            "save-import-target-not-world"
          );
        }

        throw error;
      }

      if (
        !existing.safe
      ) {
        throw new SaveImportApplyError(
          "Existing Palworld world contains unsafe filesystem entries.",
          409,
          "save-import-target-unsafe"
        );
      }
    }

    const rollback =
      this.rollbacks
        .snapshotWorld(
          targetSlotId,
          targetWorldId
        );

    try {
      mkdirSync(
        targetWorld,
        {
          recursive:
            true
        }
      );

      this.clearWorldData(
        targetWorld
      );

      this.copyManifestFiles(
        dataPath,
        targetWorld,
        manifest
      );

      this.verifyManifestFiles(
        targetWorld,
        manifest
      );

      const result:
        SaveImportApplyResult = {
          operationId,

          kind:
            "world",

          applied:
            true,

          appliedAt:
            new Date()
              .toISOString(),

          target: {
            slotId:
              targetSlotId,

            worldId:
              targetWorldId,

            playerId:
              null
          },

          rollback,

          validation: {
            filesVerified:
              true,

            hashesVerified:
              true
          }
        };

      this.imports
        .markApplied(
          operationId,
          result as unknown as
            Record<
              string,
              unknown
            >
        );

      this.audit.record({
        category:
          "palworld-save",

        action:
          "world-import-applied",

        message:
          "Palworld world save import was applied and verified.",

        entityType:
          "palworld-world",

        entityId:
          `${targetSlotId}/${targetWorldId}`,

        metadata: {
          operationId,

          rollbackId:
            rollback.id,

          fileCount:
            manifest.summary
              .fileCount,

          totalBytes:
            manifest.summary
              .totalBytes
        }
      });

      return result;
    } catch (
      error
    ) {
      this.rollbackAfterFailure(
        rollback.id,
        error
      );
    }
  }

  private applyPlayer(
    operationId:
      string,

    dataPath:
      string,

    manifest:
      SaveImportManifest,

    targetSlotId:
      string,

    targetWorldId:
      string
  ): SaveImportApplyResult {
    const playerId =
      manifest.source
        .playerId;

    if (!playerId) {
      throw new SaveImportApplyError(
        "Player save import does not contain a player ID.",
        400,
        "save-import-player-id-missing"
      );
    }

    const world =
      this.inventory
        .world(
          targetSlotId,
          targetWorldId
        );

    if (
      !world.safe
    ) {
      throw new SaveImportApplyError(
        "Target Palworld world contains unsafe filesystem entries.",
        409,
        "save-import-target-unsafe"
      );
    }

    const rollback =
      this.rollbacks
        .snapshotPlayer(
          targetSlotId,
          targetWorldId,
          playerId
        );

    const worldPath =
      this.worldPath(
        targetSlotId,
        targetWorldId
      );

    const relative =
      `Players/${playerId}.sav`;

    const manifestFile =
      manifest.files[0];

    if (
      !manifestFile ||
      manifestFile.path !==
        relative
    ) {
      throw new SaveImportApplyError(
        "Player save import layout is invalid.",
        400,
        "save-import-player-layout"
      );
    }

    try {
      const source =
        this.resolveInside(
          dataPath,
          relative
        );

      const destination =
        this.resolveInside(
          worldPath,
          relative
        );

      const sourceStat =
        lstatSync(
          source
        );

      if (
        sourceStat.isSymbolicLink() ||
        !sourceStat.isFile()
      ) {
        throw new SaveImportApplyError(
          "Validated player import source is no longer a regular file.",
          409,
          "save-import-staging-changed"
        );
      }

      mkdirSync(
        path.dirname(
          destination
        ),
        {
          recursive:
            true
        }
      );

      copyFileSync(
        source,
        destination
      );

      const modified =
        new Date(
          manifestFile.modifiedAt
        );

      utimesSync(
        destination,
        modified,
        modified
      );

      this.verifyFile(
        destination,
        manifestFile
      );

      const result:
        SaveImportApplyResult = {
          operationId,

          kind:
            "player",

          applied:
            true,

          appliedAt:
            new Date()
              .toISOString(),

          target: {
            slotId:
              targetSlotId,

            worldId:
              targetWorldId,

            playerId
          },

          rollback,

          validation: {
            filesVerified:
              true,

            hashesVerified:
              true
          }
        };

      this.imports
        .markApplied(
          operationId,
          result as unknown as
            Record<
              string,
              unknown
            >
        );

      this.audit.record({
        category:
          "palworld-save",

        action:
          "player-import-applied",

        message:
          "Palworld player save import was applied and verified.",

        entityType:
          "palworld-player-save",

        entityId:
          `${targetSlotId}/${targetWorldId}/${playerId}`,

        metadata: {
          operationId,

          rollbackId:
            rollback.id,

          totalBytes:
            manifestFile
              .sizeBytes
        }
      });

      return result;
    } catch (
      error
    ) {
      this.rollbackAfterFailure(
        rollback.id,
        error
      );
    }
  }

  private rollbackAfterFailure(
    rollbackId:
      string,

    originalError:
      unknown
  ): never {
    try {
      this.rollbacks
        .restore(
          rollbackId
        );
    } catch (
      rollbackError
    ) {
      this.audit.record({
        category:
          "palworld-save",

        action:
          "import-rollback-failed",

        severity:
          "error",

        message:
          "Save import failed and automatic rollback also failed.",

        entityType:
          "save-rollback",

        entityId:
          rollbackId,

        metadata: {
          originalErrorType:
            originalError instanceof
              Error
              ? originalError.name
              : typeof originalError,

          rollbackErrorType:
            rollbackError instanceof
              Error
              ? rollbackError.name
              : typeof rollbackError
        }
      });

      throw new SaveImportApplyError(
        `Save import failed and automatic rollback failed. Retained rollback snapshot: ${rollbackId}.`,
        500,
        "save-import-rollback-failed"
      );
    }

    this.audit.record({
      category:
        "palworld-save",

      action:
        "import-auto-rollback",

      severity:
        "warning",

      message:
        "Failed save import was rolled back automatically.",

      entityType:
        "save-rollback",

      entityId:
        rollbackId
    });

    if (
      originalError instanceof
      SaveImportApplyError
    ) {
      throw new SaveImportApplyError(
        `${originalError.message} Original save data was restored automatically.`,
        originalError.statusCode,
        originalError.code
      );
    }

    if (
      originalError instanceof
      SaveRollbackError
    ) {
      throw new SaveImportApplyError(
        `${originalError.message} Original save data was restored automatically.`,
        originalError.statusCode,
        originalError.code
      );
    }

    throw new SaveImportApplyError(
      "Save import could not be applied. Original save data was restored automatically.",
      500,
      "save-import-apply-failed"
    );
  }

  private copyManifestFiles(
    sourceRoot:
      string,

    targetRoot:
      string,

    manifest:
      SaveImportManifest
  ): void {
    for (
      const file
      of manifest.files
    ) {
      const source =
        this.resolveInside(
          sourceRoot,
          file.path
        );

      const destination =
        this.resolveInside(
          targetRoot,
          file.path
        );

      const sourceStat =
        lstatSync(
          source
        );

      if (
        sourceStat.isSymbolicLink() ||
        !sourceStat.isFile() ||
        sourceStat.size !==
          file.sizeBytes
      ) {
        throw new SaveImportApplyError(
          "Validated import staging data changed before apply.",
          409,
          "save-import-staging-changed"
        );
      }

      mkdirSync(
        path.dirname(
          destination
        ),
        {
          recursive:
            true
        }
      );

      copyFileSync(
        source,
        destination
      );

      const modified =
        new Date(
          file.modifiedAt
        );

      utimesSync(
        destination,
        modified,
        modified
      );
    }
  }

  private verifyManifestFiles(
    targetRoot:
      string,

    manifest:
      SaveImportManifest
  ): void {
    const actual =
      this.listWorldFiles(
        targetRoot
      );

    const expected =
      manifest.files
        .map(
          file =>
            file.path
        )
        .sort();

    if (
      actual.length !==
        expected.length ||
      actual.some(
        (
          value,
          index
        ) =>
          value !==
          expected[index]
      )
    ) {
      throw new SaveImportApplyError(
        "Applied world file inventory does not match the validated import.",
        500,
        "save-import-verification-failed"
      );
    }

    const byPath =
      new Map(
        manifest.files
          .map(
            file => [
              file.path,
              file
            ]
          )
      );

    for (
      const relative
      of actual
    ) {
      const expectedFile =
        byPath.get(
          relative
        );

      if (!expectedFile) {
        throw new SaveImportApplyError(
          "Applied world contains an unexpected file.",
          500,
          "save-import-verification-failed"
        );
      }

      this.verifyFile(
        this.resolveInside(
          targetRoot,
          relative
        ),
        expectedFile
      );
    }
  }

  private verifyFile(
    filePath:
      string,

    expected:
      SaveImportManifest[
        "files"
      ][number]
  ): void {
    const stat =
      lstatSync(
        filePath
      );

    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size !==
        expected.sizeBytes ||
      this.hashFile(
        filePath
      ) !==
        expected.sha256
    ) {
      throw new SaveImportApplyError(
        "Applied save file failed SHA-256 verification.",
        500,
        "save-import-verification-failed"
      );
    }
  }

  private clearWorldData(
    worldPath:
      string
  ): void {
    if (
      !existsSync(
        worldPath
      )
    ) {
      return;
    }

    const rootStat =
      lstatSync(
        worldPath
      );

    if (
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory()
    ) {
      throw new SaveImportApplyError(
        "Palworld import target is not a safe world directory.",
        409,
        "save-import-target-unsafe"
      );
    }

    for (
      const name
      of readdirSync(
        worldPath
      )
    ) {
      const absolute =
        path.join(
          worldPath,
          name
        );

      const stat =
        lstatSync(
          absolute
        );

      if (
        name.toLowerCase() ===
          "backup"
      ) {
        if (
          stat.isSymbolicLink() ||
          !stat.isDirectory()
        ) {
          throw new SaveImportApplyError(
            "Palworld Backup entry is unsafe.",
            409,
            "save-import-target-unsafe"
          );
        }

        continue;
      }

      if (
        stat.isSymbolicLink()
      ) {
        throw new SaveImportApplyError(
          "Palworld import target contains a symbolic link.",
          409,
          "save-import-target-unsafe"
        );
      }

      rmSync(
        absolute,
        {
          recursive:
            true,

          force:
            true
        }
      );
    }
  }

  private listWorldFiles(
    worldPath:
      string
  ): string[] {
    const result:
      string[] =
        [];

    const queue:
      Array<{
        absolute:
          string;

        parts:
          string[];
      }> = [
        {
          absolute:
            worldPath,

          parts:
            []
        }
      ];

    while (
      queue.length >
      0
    ) {
      const current =
        queue.shift();

      if (!current) {
        break;
      }

      for (
        const name
        of readdirSync(
          current.absolute
        ).sort()
      ) {
        const absolute =
          path.join(
            current.absolute,
            name
          );

        const parts = [
          ...current.parts,
          name
        ];

        const stat =
          lstatSync(
            absolute
          );

        if (
          current.parts.length ===
            0 &&
          name.toLowerCase() ===
            "backup"
        ) {
          continue;
        }

        if (
          stat.isSymbolicLink()
        ) {
          throw new SaveImportApplyError(
            "Applied world contains a symbolic link.",
            500,
            "save-import-verification-failed"
          );
        }

        if (
          stat.isDirectory()
        ) {
          queue.push({
            absolute,
            parts
          });

          continue;
        }

        if (
          !stat.isFile()
        ) {
          throw new SaveImportApplyError(
            "Applied world contains a non-regular filesystem entry.",
            500,
            "save-import-verification-failed"
          );
        }

        result.push(
          parts.join(
            "/"
          )
        );
      }
    }

    return result.sort();
  }

  private worldPath(
    slotId:
      string,

    worldId:
      string
  ): string {
    const root =
      this.config
        .palworldRoot;

    if (!root) {
      throw new SaveImportApplyError(
        "Palworld root is not configured.",
        409,
        "palworld-not-configured"
      );
    }

    return path.join(
      getPalworldPaths(
        root
      ).saveGames,
      slotId,
      worldId
    );
  }

  private validateIdentifier(
    value:
      string,

    kind:
      string
  ): void {
    if (
      !SAFE_IDENTIFIER.test(
        value
      ) ||
      value ===
        "." ||
      value ===
        ".."
    ) {
      throw new SaveImportApplyError(
        `Invalid ${kind} identifier.`,
        400,
        "invalid-save-identifier"
      );
    }
  }

  private resolveInside(
    root:
      string,

    relative:
      string
  ): string {
    const rootResolved =
      path.resolve(
        root
      );

    const resolved =
      path.resolve(
        rootResolved,
        ...relative.split(
          "/"
        )
      );

    if (
      resolved ===
        rootResolved ||
      !resolved.startsWith(
        rootResolved +
        path.sep
      )
    ) {
      throw new SaveImportApplyError(
        "Save import path escaped its allowed directory.",
        400,
        "save-import-path-escape"
      );
    }

    return resolved;
  }

  private hashFile(
    filePath:
      string
  ): string {
    const hash =
      createHash(
        "sha256"
      );

    const descriptor =
      openSync(
        filePath,
        "r"
      );

    try {
      const buffer =
        Buffer.allocUnsafe(
          1024 *
          1024
        );

      while (true) {
        const count =
          readSync(
            descriptor,
            buffer,
            0,
            buffer.length,
            null
          );

        if (
          count ===
          0
        ) {
          break;
        }

        hash.update(
          buffer.subarray(
            0,
            count
          )
        );
      }
    } finally {
      closeSync(
        descriptor
      );
    }

    return hash.digest(
      "hex"
    );
  }

  private assertStopped():
    void {
    if (
      this.runtime()
        .status !==
      "stopped"
    ) {
      throw new SaveImportApplyError(
        "Palworld must be stopped before importing save data.",
        409,
        "save-import-requires-stopped-server"
      );
    }
  }
}