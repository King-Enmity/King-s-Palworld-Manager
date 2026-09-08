import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  createReadStream,
  createWriteStream,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";

import path from "node:path";

import {
  PassThrough
} from "node:stream";

import {
  pipeline
} from "node:stream/promises";

import * as tar from "tar";

import type {
  AppConfig
} from "../../config/app-config.js";

import {
  PRODUCT_VERSION
} from "../../config/product.js";

import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  getPalworldPaths
} from "../palworld/paths.js";

import type {
  PalworldRuntimeSnapshot
} from "../palworld/runtime-state.js";

import {
  SaveInventoryError,
  type SaveInventoryService
} from "./save-inventory-service.js";

export type SaveExportKind =
  | "world"
  | "player";

export interface SaveExportManifestFile {
  path: string;

  sizeBytes: number;

  modifiedAt: string;

  sha256: string;
}

export interface SaveExportManifest {
  format:
    "kpm-palworld-save-export";

  schemaVersion:
    1;

  kind:
    SaveExportKind;

  createdAt:
    string;

  managerVersion:
    string;

  palworldVersion:
    string | null;

  source: {
    slotId: string;
    worldId: string;

    playerId?:
      string;
  };

  layout: {
    manifest:
      "manifest.json";

    dataRoot:
      "data";
  };

  files:
    SaveExportManifestFile[];

  summary: {
    fileCount: number;
    totalBytes: number;
  };
}

export interface SaveExportArtifact {
  filePath: string;
  fileName: string;

  contentType:
    "application/gzip";

  archiveSha256:
    string;

  manifest:
    SaveExportManifest;

  cleanup():
    void;
}

export class SaveExportError
  extends Error {
  public constructor(
    message: string,

    public readonly statusCode:
      number,

    public readonly code:
      string
  ) {
    super(message);
  }
}

interface CopyResult {
  path: string;

  sizeBytes: number;

  modifiedAt: string;

  sha256: string;
}

export class SaveExportService {
  public constructor(
    private readonly config:
      Readonly<AppConfig>,

    private readonly inventory:
      SaveInventoryService,

    private readonly audit:
      AuditRepository,

    private readonly runtime:
      () => PalworldRuntimeSnapshot
  ) {}

  public world(
    slotId: string,
    worldId: string
  ): Promise<SaveExportArtifact> {
    this.assertStopped();

    const world =
      this.inventory
        .world(
          slotId,
          worldId
        );

    if (!world.safe) {
      throw new SaveExportError(
        "Palworld world contains unsafe filesystem entries.",
        409,
        "save-world-unsafe"
      );
    }

    const worldPath =
      this.worldPath(
        slotId,
        worldId
      );

    const files =
      this.listWorldFiles(
        worldPath
      );

    if (
      files.length !==
      world.fileCount
    ) {
      throw new SaveExportError(
        "Palworld world changed while preparing the export.",
        409,
        "save-world-inventory-changed"
      );
    }

    return this.createExport(
      "world",
      slotId,
      worldId,
      null,
      worldPath,
      files
    );
  }

  public player(
    slotId: string,
    worldId: string,
    playerId: string
  ): Promise<SaveExportArtifact> {
    this.assertStopped();

    const world =
      this.inventory
        .world(
          slotId,
          worldId
        );

    if (!world.safe) {
      throw new SaveExportError(
        "Palworld world contains unsafe filesystem entries.",
        409,
        "save-world-unsafe"
      );
    }

    const player =
      world.players
        .find(
          candidate =>
            candidate.playerId ===
            playerId
        );

    if (!player) {
      throw new SaveInventoryError(
        "Palworld player save was not found.",
        404,
        "save-player-not-found"
      );
    }

    return this.createExport(
      "player",
      slotId,
      worldId,
      player.playerId,
      this.worldPath(
        slotId,
        worldId
      ),
      [
        `Players/${player.fileName}`
      ]
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
      throw new SaveExportError(
        "Palworld must be stopped before exporting save data.",
        409,
        "save-export-requires-stopped-server"
      );
    }
  }

  private worldPath(
    slotId: string,
    worldId: string
  ): string {
    const root =
      this.config
        .palworldRoot;

    if (!root) {
      throw new SaveExportError(
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

  private listWorldFiles(
    worldPath: string
  ): string[] {
    const files:
      string[] =
        [];

    const queue:
      Array<{
        absolute: string;
        parts: string[];
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

      let names:
        string[];

      try {
        names =
          readdirSync(
            current.absolute
          )
            .sort();
      } catch {
        throw new SaveExportError(
          "Palworld save directory could not be read.",
          409,
          "save-export-source-unreadable"
        );
      }

      for (
        const name
        of names
      ) {
        const parts = [
          ...current.parts,
          name
        ];

        if (
          parts.length ===
            1 &&
          name.toLowerCase() ===
            "backup"
        ) {
          continue;
        }

        const absolute =
          path.join(
            current.absolute,
            name
          );

        let stat:
          ReturnType<
            typeof lstatSync
          >;

        try {
          stat =
            lstatSync(
              absolute
            );
        } catch {
          throw new SaveExportError(
            "Palworld save entry changed during export preparation.",
            409,
            "save-export-source-changed"
          );
        }

        if (
          stat.isSymbolicLink()
        ) {
          throw new SaveExportError(
            "Symbolic links are not allowed in save exports.",
            409,
            "save-export-symbolic-link"
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

        if (!stat.isFile()) {
          throw new SaveExportError(
            "Non-regular filesystem entries are not allowed in save exports.",
            409,
            "save-export-special-file"
          );
        }

        files.push(
          parts.join(
            "/"
          )
        );
      }
    }

    return files.sort();
  }

  private async createExport(
    kind:
      SaveExportKind,

    slotId:
      string,

    worldId:
      string,

    playerId:
      string | null,

    worldPath:
      string,

    files:
      string[]
  ): Promise<SaveExportArtifact> {
    const exportRoot =
      path.join(
        this.config
          .dataPath,

        "exports"
      );

    mkdirSync(
      exportRoot,
      {
        recursive:
          true
      }
    );

    const operationDirectory =
      path.join(
        exportRoot,
        randomUUID()
      );

    const dataDirectory =
      path.join(
        operationDirectory,
        "data"
      );

    mkdirSync(
      dataDirectory,
      {
        recursive:
          true
      }
    );

    try {
      const copied:
        CopyResult[] =
          [];

      for (
        const relative
        of files
      ) {
        copied.push(
          await this.copyAndHash(
            worldPath,
            dataDirectory,
            relative
          )
        );
      }

      if (
        kind ===
        "world"
      ) {
        const after =
          this.listWorldFiles(
            worldPath
          );

        if (
          after.length !==
            files.length ||
          after.some(
            (
              value,
              index
            ) =>
              value !==
              files[index]
          )
        ) {
          throw new SaveExportError(
            "Palworld world changed while the export was being created.",
            409,
            "save-export-source-changed"
          );
        }
      }

      const createdAt =
        new Date()
          .toISOString();

      const source:
        SaveExportManifest[
          "source"
        ] = {
          slotId,
          worldId
        };

      if (
        playerId !==
        null
      ) {
        source.playerId =
          playerId;
      }

      const manifest:
        SaveExportManifest = {
          format:
            "kpm-palworld-save-export",

          schemaVersion:
            1,

          kind,

          createdAt,

          managerVersion:
            PRODUCT_VERSION,

          palworldVersion:
            null,

          source,

          layout: {
            manifest:
              "manifest.json",

            dataRoot:
              "data"
          },

          files:
            copied,

          summary: {
            fileCount:
              copied.length,

            totalBytes:
              copied.reduce(
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

      writeFileSync(
        path.join(
          operationDirectory,
          "manifest.json"
        ),

        JSON.stringify(
          manifest,
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

      const timestamp =
        createdAt
          .replace(
            /[:.]/g,
            "-"
          );

      const fileName =
        kind ===
        "world"
          ? `kpm-world-${slotId}-${worldId}-${timestamp}.tar.gz`
          : `kpm-player-${slotId}-${worldId}-${playerId ?? "unknown"}-${timestamp}.tar.gz`;

      const archivePath =
        path.join(
          operationDirectory,
          fileName
        );

      await tar.create(
        {
          cwd:
            operationDirectory,

          file:
            archivePath,

          gzip:
            true,

          portable:
            true,

          strict:
            true
        },

        [
          "manifest.json",
          "data"
        ]
      );

      const archiveSha256 =
        await this.hashFile(
          archivePath
        );

      this.audit.record({
        category:
          "palworld-save",

        action:
          kind ===
          "world"
            ? "world-export"
            : "player-export",

        message:
          kind ===
          "world"
            ? "Palworld world save export created."
            : "Palworld player save export created.",

        entityType:
          kind ===
          "world"
            ? "palworld-world"
            : "palworld-player-save",

        entityId:
          kind ===
          "world"
            ? `${slotId}/${worldId}`
            : `${slotId}/${worldId}/${playerId ?? "unknown"}`,

        metadata: {
          fileCount:
            manifest
              .summary
              .fileCount,

          totalBytes:
            manifest
              .summary
              .totalBytes,

          archiveSha256
        }
      });

      let cleaned =
        false;

      return {
        filePath:
          archivePath,

        fileName,

        contentType:
          "application/gzip",

        archiveSha256,

        manifest,

        cleanup:
          () => {
            if (cleaned) {
              return;
            }

            cleaned =
              true;

            rmSync(
              operationDirectory,
              {
                recursive:
                  true,

                force:
                  true
              }
            );
          }
      };
    } catch (
      error
    ) {
      rmSync(
        operationDirectory,
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

  private async copyAndHash(
    worldPath:
      string,

    dataDirectory:
      string,

    relative:
      string
  ): Promise<CopyResult> {
    const source =
      this.resolveInside(
        worldPath,
        relative
      );

    const destination =
      this.resolveInside(
        dataDirectory,
        relative
      );

    let before:
      ReturnType<
        typeof lstatSync
      >;

    try {
      before =
        lstatSync(
          source
        );
    } catch {
      throw new SaveExportError(
        "Palworld save file disappeared during export.",
        409,
        "save-export-source-changed"
      );
    }

    if (
      before.isSymbolicLink() ||
      !before.isFile()
    ) {
      throw new SaveExportError(
        "Palworld save export source is not a regular file.",
        409,
        "save-export-source-invalid"
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

    const hash =
      createHash(
        "sha256"
      );

    const tap =
      new PassThrough();

    tap.on(
      "data",
      (
        chunk:
          Buffer
      ) => {
        hash.update(
          chunk
        );
      }
    );

    await pipeline(
      createReadStream(
        source
      ),

      tap,

      createWriteStream(
        destination,
        {
          flags:
            "wx"
        }
      )
    );

    let after:
      ReturnType<
        typeof lstatSync
      >;

    try {
      after =
        lstatSync(
          source
        );
    } catch {
      throw new SaveExportError(
        "Palworld save file changed during export.",
        409,
        "save-export-source-changed"
      );
    }

    if (
      before.size !==
        after.size ||
      before.mtimeMs !==
        after.mtimeMs
    ) {
      throw new SaveExportError(
        "Palworld save file changed during export.",
        409,
        "save-export-source-changed"
      );
    }

    return {
      path:
        relative,

      sizeBytes:
        before.size,

      modifiedAt:
        before.mtime
          .toISOString(),

      sha256:
        hash.digest(
          "hex"
        )
    };
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

        ...relative
          .split(
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
      throw new SaveExportError(
        "Save export path escaped the expected directory.",
        400,
        "invalid-save-export-path"
      );
    }

    return resolved;
  }

  private async hashFile(
    filePath:
      string
  ): Promise<string> {
    const hash =
      createHash(
        "sha256"
      );

    for await (
      const chunk
      of createReadStream(
        filePath
      )
    ) {
      hash.update(
        chunk
      );
    }

    return hash.digest(
      "hex"
    );
  }
}