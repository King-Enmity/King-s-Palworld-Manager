import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";

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

const SAFE_IDENTIFIER =
  /^[A-Za-z0-9._-]{1,128}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ROLLBACK_FILES =
  500_000;

export type SaveRollbackKind =
  | "world"
  | "player";

interface SaveRollbackFile {
  path:
    string;

  sizeBytes:
    number;

  modifiedAt:
    string;

  sha256:
    string;
}

interface SaveRollbackMetadata {
  id:
    string;

  kind:
    SaveRollbackKind;

  createdAt:
    string;

  lastRestoredAt:
    string |
    null;

  target: {
    slotId:
      string;

    worldId:
      string;

    playerId:
      string |
      null;
  };

  sourceExisted:
    boolean;

  files:
    SaveRollbackFile[];

  summary: {
    fileCount:
      number;

    totalBytes:
      number;
  };
}

export interface SaveRollbackSummary {
  id:
    string;

  kind:
    SaveRollbackKind;

  createdAt:
    string;

  lastRestoredAt:
    string |
    null;

  target: {
    slotId:
      string;

    worldId:
      string;

    playerId:
      string |
      null;
  };

  sourceExisted:
    boolean;

  fileCount:
    number;

  totalBytes:
    number;
}

export class SaveRollbackError
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

export class SaveRollbackService {
  private readonly rollbackRoot:
    string;

  public constructor(
    private readonly config:
      Readonly<AppConfig>,

    private readonly audit:
      AuditRepository,

    private readonly runtime:
      () => PalworldRuntimeSnapshot
  ) {
    this.rollbackRoot =
      path.join(
        config.dataPath,
        "save-rollbacks"
      );

    mkdirSync(
      this.rollbackRoot,
      {
        recursive:
          true
      }
    );
  }

  public list():
    SaveRollbackSummary[] {
    let entries:
      string[];

    try {
      entries =
        readdirSync(
          this.rollbackRoot
        );
    } catch {
      return [];
    }

    const result:
      SaveRollbackSummary[] =
        [];

    for (
      const name
      of entries
    ) {
      if (
        !UUID.test(
          name
        )
      ) {
        continue;
      }

      try {
        result.push(
          this.toSummary(
            this.readMetadata(
              name
            )
          )
        );
      } catch {
        // A corrupt rollback directory is not exposed
        // as an apparently usable snapshot.
      }
    }

    result.sort(
      (
        left,
        right
      ) =>
        right.createdAt
          .localeCompare(
            left.createdAt
          )
    );

    return result;
  }

  public snapshotWorld(
    slotId:
      string,

    worldId:
      string
  ): SaveRollbackSummary {
    this.assertStopped();

    this.validateIdentifier(
      slotId,
      "slot"
    );

    this.validateIdentifier(
      worldId,
      "world"
    );

    const target =
      this.worldPath(
        slotId,
        worldId
      );

    const sourceExisted =
      existsSync(
        target
      );

    let files:
      string[] =
        [];

    if (
      sourceExisted
    ) {
      const stat =
        lstatSync(
          target
        );

      if (
        stat.isSymbolicLink() ||
        !stat.isDirectory()
      ) {
        throw new SaveRollbackError(
          "Rollback source world is not a safe directory.",
          409,
          "save-rollback-world-unsafe"
        );
      }

      files =
        this.listWorldFiles(
          target
        );
    }

    return this.createSnapshot(
      "world",
      slotId,
      worldId,
      null,
      target,
      sourceExisted,
      files
    );
  }

  public snapshotPlayer(
    slotId:
      string,

    worldId:
      string,

    playerId:
      string
  ): SaveRollbackSummary {
    this.assertStopped();

    this.validateIdentifier(
      slotId,
      "slot"
    );

    this.validateIdentifier(
      worldId,
      "world"
    );

    this.validateIdentifier(
      playerId,
      "player"
    );

    const worldPath =
      this.worldPath(
        slotId,
        worldId
      );

    if (
      !existsSync(
        worldPath
      )
    ) {
      throw new SaveRollbackError(
        "Rollback target world does not exist.",
        404,
        "save-rollback-world-missing"
      );
    }

    const relative =
      `Players/${playerId}.sav`;

    const playerPath =
      path.join(
        worldPath,
        "Players",
        `${playerId}.sav`
      );

    const sourceExisted =
      existsSync(
        playerPath
      );

    if (
      sourceExisted
    ) {
      const stat =
        lstatSync(
          playerPath
        );

      if (
        stat.isSymbolicLink() ||
        !stat.isFile()
      ) {
        throw new SaveRollbackError(
          "Rollback player save is not a safe regular file.",
          409,
          "save-rollback-player-unsafe"
        );
      }
    }

    return this.createSnapshot(
      "player",
      slotId,
      worldId,
      playerId,
      worldPath,
      sourceExisted,
      sourceExisted
        ? [
            relative
          ]
        : []
    );
  }

  public restore(
    rollbackId:
      string
  ): SaveRollbackSummary {
    this.assertStopped();

    const metadata =
      this.readMetadata(
        rollbackId
      );

    const worldPath =
      this.worldPath(
        metadata.target
          .slotId,

        metadata.target
          .worldId
      );

    if (
      metadata.kind ===
      "world"
    ) {
      if (
        metadata.sourceExisted
      ) {
        mkdirSync(
          worldPath,
          {
            recursive:
              true
          }
        );

        this.clearWorldData(
          worldPath
        );

        this.restoreFiles(
          rollbackId,
          worldPath,
          metadata.files
        );

        this.verifyFiles(
          worldPath,
          metadata.files
        );
      }

      if (
        !metadata.sourceExisted
      ) {
        rmSync(
          worldPath,
          {
            recursive:
              true,

            force:
              true
          }
        );
      }
    }

    if (
      metadata.kind ===
      "player"
    ) {
      if (
        !existsSync(
          worldPath
        )
      ) {
        throw new SaveRollbackError(
          "Rollback target world no longer exists.",
          409,
          "save-rollback-world-missing"
        );
      }

      const playerId =
        metadata.target
          .playerId;

      if (!playerId) {
        throw new SaveRollbackError(
          "Rollback player metadata is invalid.",
          500,
          "save-rollback-metadata-invalid"
        );
      }

      const playerPath =
        path.join(
          worldPath,
          "Players",
          `${playerId}.sav`
        );

      if (
        metadata.sourceExisted
      ) {
        this.restoreFiles(
          rollbackId,
          worldPath,
          metadata.files
        );

        this.verifyFiles(
          worldPath,
          metadata.files
        );
      }

      if (
        !metadata.sourceExisted
      ) {
        rmSync(
          playerPath,
          {
            force:
              true
          }
        );
      }
    }

    metadata.lastRestoredAt =
      new Date()
        .toISOString();

    this.writeMetadata(
      rollbackId,
      metadata,
      false
    );

    this.audit.record({
      category:
        "palworld-save",

      action:
        "rollback-restored",

      message:
        "Palworld save rollback snapshot was restored.",

      entityType:
        "save-rollback",

      entityId:
        rollbackId,

      metadata: {
        kind:
          metadata.kind,

        slotId:
          metadata.target
            .slotId,

        worldId:
          metadata.target
            .worldId,

        playerId:
          metadata.target
            .playerId
      }
    });

    return this.toSummary(
      metadata
    );
  }

  public delete(
    rollbackId:
      string
  ): void {
    const metadata =
      this.readMetadata(
        rollbackId
      );

    rmSync(
      path.join(
        this.rollbackRoot,
        rollbackId
      ),
      {
        recursive:
          true,

        force:
          true
      }
    );

    this.audit.record({
      category:
        "palworld-save",

      action:
        "rollback-deleted",

      message:
        "Palworld save rollback snapshot was deleted.",

      entityType:
        "save-rollback",

      entityId:
        rollbackId,

      metadata: {
        kind:
          metadata.kind,

        slotId:
          metadata.target
            .slotId,

        worldId:
          metadata.target
            .worldId,

        playerId:
          metadata.target
            .playerId
      }
    });
  }

  private createSnapshot(
    kind:
      SaveRollbackKind,

    slotId:
      string,

    worldId:
      string,

    playerId:
      string |
      null,

    sourceRoot:
      string,

    sourceExisted:
      boolean,

    relativeFiles:
      string[]
  ): SaveRollbackSummary {
    const id =
      randomUUID();

    const directory =
      path.join(
        this.rollbackRoot,
        id
      );

    const dataRoot =
      path.join(
        directory,
        "data"
      );

    mkdirSync(
      dataRoot,
      {
        recursive:
          true
      }
    );

    try {
      const files:
        SaveRollbackFile[] =
          [];

      for (
        const relative
        of relativeFiles
      ) {
        if (
          files.length >=
          MAX_ROLLBACK_FILES
        ) {
          throw new SaveRollbackError(
            "Rollback snapshot contains too many files.",
            409,
            "save-rollback-file-limit"
          );
        }

        const source =
          this.resolveInside(
            sourceRoot,
            relative
          );

        const stat =
          lstatSync(
            source
          );

        if (
          stat.isSymbolicLink() ||
          !stat.isFile()
        ) {
          throw new SaveRollbackError(
            "Rollback snapshot encountered an unsafe filesystem entry.",
            409,
            "save-rollback-source-unsafe"
          );
        }

        const destination =
          this.resolveInside(
            dataRoot,
            relative
          );

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

        utimesSync(
          destination,
          stat.atime,
          stat.mtime
        );

        const copiedStat =
          lstatSync(
            destination
          );

        files.push({
          path:
            relative,

          sizeBytes:
            copiedStat.size,

          modifiedAt:
            stat.mtime
              .toISOString(),

          sha256:
            this.hashFile(
              destination
            )
        });
      }

      const metadata:
        SaveRollbackMetadata = {
          id,

          kind,

          createdAt:
            new Date()
              .toISOString(),

          lastRestoredAt:
            null,

          target: {
            slotId,
            worldId,
            playerId
          },

          sourceExisted,

          files,

          summary: {
            fileCount:
              files.length,

            totalBytes:
              files.reduce(
                (
                  total,
                  file
                ) =>
                  total +
                  file.sizeBytes,
                0
              )
          }
        };

      this.writeMetadata(
        id,
        metadata,
        true
      );

      this.audit.record({
        category:
          "palworld-save",

        action:
          "rollback-created",

        message:
          "Palworld save rollback snapshot was created.",

        entityType:
          "save-rollback",

        entityId:
          id,

        metadata: {
          kind,

          slotId,
          worldId,
          playerId,

          sourceExisted,

          fileCount:
            metadata.summary
              .fileCount,

          totalBytes:
            metadata.summary
              .totalBytes
        }
      });

      return this.toSummary(
        metadata
      );
    } catch (
      error
    ) {
      rmSync(
        directory,
        {
          recursive:
            true,

          force:
            true
        }
      );

      throw error;
    }
  }

  private restoreFiles(
    rollbackId:
      string,

    targetRoot:
      string,

    files:
      SaveRollbackFile[]
  ): void {
    const dataRoot =
      path.join(
        this.rollbackRoot,
        rollbackId,
        "data"
      );

    for (
      const file
      of files
    ) {
      const source =
        this.resolveInside(
          dataRoot,
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
          file.sizeBytes ||
        this.hashFile(
          source
        ) !==
          file.sha256
      ) {
        throw new SaveRollbackError(
          "Rollback snapshot failed integrity verification.",
          409,
          "save-rollback-integrity-failed"
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

  private verifyFiles(
    root:
      string,

    files:
      SaveRollbackFile[]
  ): void {
    for (
      const file
      of files
    ) {
      const target =
        this.resolveInside(
          root,
          file.path
        );

      const stat =
        lstatSync(
          target
        );

      if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.size !==
          file.sizeBytes ||
        this.hashFile(
          target
        ) !==
          file.sha256
      ) {
        throw new SaveRollbackError(
          "Rollback restore verification failed.",
          500,
          "save-rollback-restore-verification-failed"
        );
      }
    }
  }

  private listWorldFiles(
    worldPath:
      string
  ): string[] {
    const files:
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

      const names =
        readdirSync(
          current.absolute
        )
          .sort();

      for (
        const name
        of names
      ) {
        const parts = [
          ...current.parts,
          name
        ];

        const absolute =
          path.join(
            current.absolute,
            name
          );

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
          if (
            stat.isSymbolicLink() ||
            !stat.isDirectory()
          ) {
            throw new SaveRollbackError(
              "Palworld Backup entry is unsafe.",
              409,
              "save-rollback-backup-unsafe"
            );
          }

          continue;
        }

        if (
          stat.isSymbolicLink()
        ) {
          throw new SaveRollbackError(
            "Palworld world contains a symbolic link.",
            409,
            "save-rollback-world-unsafe"
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
          throw new SaveRollbackError(
            "Palworld world contains a non-regular filesystem entry.",
            409,
            "save-rollback-world-unsafe"
          );
        }

        files.push(
          parts.join(
            "/"
          )
        );

        if (
          files.length >
          MAX_ROLLBACK_FILES
        ) {
          throw new SaveRollbackError(
            "Palworld world exceeds the rollback file limit.",
            409,
            "save-rollback-file-limit"
          );
        }
      }
    }

    return files.sort();
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

    const stat =
      lstatSync(
        worldPath
      );

    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory()
    ) {
      throw new SaveRollbackError(
        "Palworld world target is unsafe.",
        409,
        "save-rollback-world-unsafe"
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

      const entry =
        lstatSync(
          absolute
        );

      if (
        name.toLowerCase() ===
          "backup"
      ) {
        if (
          entry.isSymbolicLink() ||
          !entry.isDirectory()
        ) {
          throw new SaveRollbackError(
            "Palworld Backup entry is unsafe.",
            409,
            "save-rollback-backup-unsafe"
          );
        }

        continue;
      }

      if (
        entry.isSymbolicLink()
      ) {
        throw new SaveRollbackError(
          "Palworld world contains a symbolic link.",
          409,
          "save-rollback-world-unsafe"
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

  private readMetadata(
    rollbackId:
      string
  ): SaveRollbackMetadata {
    if (
      !UUID.test(
        rollbackId
      )
    ) {
      throw new SaveRollbackError(
        "Save rollback ID is invalid.",
        400,
        "save-rollback-id-invalid"
      );
    }

    const metadataPath =
      path.join(
        this.rollbackRoot,
        rollbackId,
        "metadata.json"
      );

    let parsed:
      unknown;

    try {
      parsed =
        JSON.parse(
          readFileSync(
            metadataPath,
            "utf8"
          )
        );
    } catch {
      throw new SaveRollbackError(
        "Save rollback snapshot was not found.",
        404,
        "save-rollback-not-found"
      );
    }

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null
    ) {
      throw new SaveRollbackError(
        "Save rollback metadata is invalid.",
        500,
        "save-rollback-metadata-invalid"
      );
    }

    const metadata =
      parsed as
        Partial<
          SaveRollbackMetadata
        >;

    if (
      metadata.id !==
        rollbackId ||
      (
        metadata.kind !==
          "world" &&
        metadata.kind !==
          "player"
      ) ||
      typeof metadata.createdAt !==
        "string" ||
      typeof metadata.sourceExisted !==
        "boolean" ||
      !Array.isArray(
        metadata.files
      ) ||
      typeof metadata.target !==
        "object" ||
      metadata.target ===
        null ||
      typeof metadata.summary !==
        "object" ||
      metadata.summary ===
        null
    ) {
      throw new SaveRollbackError(
        "Save rollback metadata is invalid.",
        500,
        "save-rollback-metadata-invalid"
      );
    }

    return metadata as
      SaveRollbackMetadata;
  }

  private writeMetadata(
    rollbackId:
      string,

    metadata:
      SaveRollbackMetadata,

    create:
      boolean
  ): void {
    const directory =
      path.join(
        this.rollbackRoot,
        rollbackId
      );

    mkdirSync(
      directory,
      {
        recursive:
          true
      }
    );

    const metadataPath =
      path.join(
        directory,
        "metadata.json"
      );

    if (
      create
    ) {
      writeFileSync(
        metadataPath,

        JSON.stringify(
          metadata,
          null,
          2
        ) + "\n",

        {
          encoding:
            "utf8",

          flag:
            "wx"
        }
      );

      return;
    }

    const temporary =
      path.join(
        directory,
        "metadata.json.tmp"
      );

    writeFileSync(
      temporary,

      JSON.stringify(
        metadata,
        null,
        2
      ) + "\n",

      {
        encoding:
          "utf8",

        flag:
          "w"
      }
    );

    renameSync(
      temporary,
      metadataPath
    );
  }

  private toSummary(
    metadata:
      SaveRollbackMetadata
  ): SaveRollbackSummary {
    return {
      id:
        metadata.id,

      kind:
        metadata.kind,

      createdAt:
        metadata.createdAt,

      lastRestoredAt:
        metadata.lastRestoredAt,

      target: {
        ...metadata.target
      },

      sourceExisted:
        metadata.sourceExisted,

      fileCount:
        metadata.summary
          .fileCount,

      totalBytes:
        metadata.summary
          .totalBytes
    };
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
      throw new SaveRollbackError(
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
      throw new SaveRollbackError(
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
      throw new SaveRollbackError(
        "Save rollback path escaped its allowed directory.",
        400,
        "save-rollback-path-escape"
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
    const runtime =
      this.runtime();

    if (
      runtime.status !==
      "stopped"
    ) {
      throw new SaveRollbackError(
        "Palworld must be stopped before restoring or creating save rollback snapshots.",
        409,
        "save-rollback-requires-stopped-server"
      );
    }
  }
}