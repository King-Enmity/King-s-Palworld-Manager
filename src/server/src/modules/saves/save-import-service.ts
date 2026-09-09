import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  createReadStream,
  createWriteStream,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats
} from "node:fs";

import path from "node:path";

import {
  Transform,
  type Readable
} from "node:stream";

import {
  pipeline
} from "node:stream/promises";

import * as tar from "tar";

import { z } from "zod";

import type {
  AppConfig
} from "../../config/app-config.js";

import {
  PRODUCT_VERSION
} from "../../config/product.js";

import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

const MAX_ARCHIVE_BYTES =
  1024 * 1024 * 1024;

const MAX_EXPANDED_BYTES =
  8 * 1024 * 1024 * 1024;

const MAX_FILES =
  100_000;

const MAX_ARCHIVE_ENTRIES =
  MAX_FILES * 2 + 2048;

const MAX_DEPTH =
  64;

const MAX_DECOMPRESSION_RATIO =
  100;

const MAX_MANIFEST_BYTES =
  4 * 1024 * 1024;

const MAX_META_ENTRY_BYTES =
  1024 * 1024;

const OPERATION_TTL_MS =
  24 * 60 * 60 * 1000;

const IDENTIFIER =
  /^[A-Za-z0-9._-]{1,128}$/;

const SHA256 =
  /^[a-f0-9]{64}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ManifestFileSchema =
  z.object({
    path:
      z.string()
        .min(1)
        .max(4096),

    sizeBytes:
      z.number()
        .int()
        .min(0)
        .max(
          MAX_EXPANDED_BYTES
        ),

    modifiedAt:
      z.string()
        .min(1)
        .max(64),

    sha256:
      z.string()
        .regex(
          SHA256
        )
  }).strict();

const ManifestSchema =
  z.object({
    format:
      z.literal(
        "kpm-palworld-save-export"
      ),

    schemaVersion:
      z.literal(1),

    kind:
      z.enum([
        "world",
        "player"
      ]),

    createdAt:
      z.string()
        .min(1)
        .max(64),

    managerVersion:
      z.string()
        .min(1)
        .max(64),

    palworldVersion:
      z.string()
        .min(1)
        .max(128)
        .nullable(),

    source:
      z.object({
        slotId:
          z.string()
            .regex(
              IDENTIFIER
            ),

        worldId:
          z.string()
            .regex(
              IDENTIFIER
            ),

        playerId:
          z.string()
            .regex(
              IDENTIFIER
            )
            .optional()
      }).strict(),

    layout:
      z.object({
        manifest:
          z.literal(
            "manifest.json"
          ),

        dataRoot:
          z.literal(
            "data"
          )
      }).strict(),

    files:
      z.array(
        ManifestFileSchema
      )
        .max(
          MAX_FILES
        ),

    summary:
      z.object({
        fileCount:
          z.number()
            .int()
            .min(0)
            .max(
              MAX_FILES
            ),

        totalBytes:
          z.number()
            .int()
            .min(0)
            .max(
              MAX_EXPANDED_BYTES
            )
      }).strict()
  }).strict();

export type SaveImportManifest =
  z.infer<
    typeof ManifestSchema
  >;

export interface SaveImportUpload {
  operationId: string;

  directory: string;
  archivePath: string;
  extractPath: string;
}

export interface SaveStoredArchive {
  archiveBytes: number;
  archiveSha256: string;
}

export interface SaveImportPreview {
  operationId: string;

  status:
    "ready";

  createdAt: string;
  expiresAt: string;

  originalFileName: string;

  archive: {
    sizeBytes: number;
    sha256: string;
  };

  source: {
    kind:
      "world" |
      "player";

    slotId: string;
    worldId: string;

    playerId:
      string | null;
  };

  manifest: {
    format:
      "kpm-palworld-save-export";

    schemaVersion:
      1;

    createdAt: string;

    managerVersion: string;

    palworldVersion:
      string | null;

    fileCount: number;
    totalBytes: number;
  };

  validation: {
    archiveEntryCount: number;
    archiveFileCount: number;

    expandedBytes: number;

    manifestFilesMatched:
      true;

    hashesVerified:
      true;

    archiveShapeVerified:
      true;
  };

  warnings:
    string[];
}

export interface SaveImportReadyOperation {
  operationId:
    string;

  directory:
    string;

  dataPath:
    string;

  archivePath:
    string;

  preview:
    SaveImportPreview;

  manifest:
    SaveImportManifest;
}

export class SaveImportError
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

interface InspectedArchive {
  entryCount: number;

  fileEntries:
    Map<
      string,
      number
    >;

  expandedBytes: number;
}

export class SaveImportService {
  public readonly maxArchiveBytes =
    MAX_ARCHIVE_BYTES;

  public readonly maxRequestBytes =
    MAX_ARCHIVE_BYTES +
    2 * 1024 * 1024;

  private readonly importRoot:
    string;

  public constructor(
    private readonly config:
      Readonly<AppConfig>,

    private readonly audit:
      AuditRepository
  ) {
    this.importRoot =
      path.join(
        this.config
          .dataPath,

        "imports"
      );

    mkdirSync(
      this.importRoot,
      {
        recursive:
          true
      }
    );

    this.cleanupExpired();
  }

  public beginUpload():
    SaveImportUpload {
    this.cleanupExpired();

    const operationId =
      randomUUID();

    const directory =
      path.join(
        this.importRoot,
        operationId
      );

    const extractPath =
      path.join(
        directory,
        "staging"
      );

    mkdirSync(
      directory,
      {
        recursive:
          false
      }
    );

    return {
      operationId,

      directory,

      archivePath:
        path.join(
          directory,
          "upload.tar.gz"
        ),

      extractPath
    };
  }

  public async storeArchive(
    upload:
      SaveImportUpload,

    stream:
      Readable
  ): Promise<SaveStoredArchive> {
    const hash =
      createHash(
        "sha256"
      );

    let bytes =
      0;

    const guard =
      new Transform({
        transform(
          chunk:
            Buffer,

          _encoding,

          callback
        ) {
          bytes +=
            chunk.length;

          if (
            bytes >
            MAX_ARCHIVE_BYTES
          ) {
            callback(
              new SaveImportError(
                "Save import archive exceeds the maximum allowed size.",
                413,
                "save-import-archive-too-large"
              )
            );

            return;
          }

          hash.update(
            chunk
          );

          callback(
            null,
            chunk
          );
        }
      });

    try {
      await pipeline(
        stream,
        guard,

        createWriteStream(
          upload.archivePath,
          {
            flags:
              "wx"
          }
        )
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        SaveImportError
      ) {
        throw error;
      }

      throw new SaveImportError(
        "Save import upload could not be quarantined.",
        400,
        "save-import-upload-failed"
      );
    }

    if (
      bytes ===
      0
    ) {
      throw new SaveImportError(
        "Save import archive is empty.",
        400,
        "save-import-empty-archive"
      );
    }

    this.assertGzip(
      upload.archivePath
    );

    return {
      archiveBytes:
        bytes,

      archiveSha256:
        hash.digest(
          "hex"
        )
    };
  }

  public async preview(
    upload:
      SaveImportUpload,

    stored:
      SaveStoredArchive,

    originalFileName:
      string
  ): Promise<SaveImportPreview> {
    try {
      const inspected =
        await this.inspectArchive(
          upload.archivePath
        );

      mkdirSync(
        upload.extractPath,
        {
          recursive:
            false
        }
      );

      await this.extractArchive(
        upload.archivePath,
        upload.extractPath
      );

      const manifest =
        this.readManifest(
          upload.extractPath
        );

      this.validateManifest(
        manifest
      );

      await this.verifyExtracted(
        upload.extractPath,
        inspected,
        manifest
      );

      const warnings:
        string[] =
          [];

      if (
        manifest.managerVersion !==
        PRODUCT_VERSION
      ) {
        warnings.push(
          "export-created-by-different-manager-version"
        );
      }

      if (
        manifest.palworldVersion ===
        null
      ) {
        warnings.push(
          "palworld-version-not-recorded"
        );
      }

      const createdAt =
        new Date()
          .toISOString();

      const expiresAt =
        new Date(
          Date.now() +
          OPERATION_TTL_MS
        ).toISOString();

      const preview:
        SaveImportPreview = {
          operationId:
            upload.operationId,

          status:
            "ready",

          createdAt,
          expiresAt,

          originalFileName:
            this.safeOriginalName(
              originalFileName
            ),

          archive: {
            sizeBytes:
              stored.archiveBytes,

            sha256:
              stored.archiveSha256
          },

          source: {
            kind:
              manifest.kind,

            slotId:
              manifest
                .source
                .slotId,

            worldId:
              manifest
                .source
                .worldId,

            playerId:
              manifest
                .source
                .playerId ??
              null
          },

          manifest: {
            format:
              manifest.format,

            schemaVersion:
              manifest.schemaVersion,

            createdAt:
              manifest.createdAt,

            managerVersion:
              manifest.managerVersion,

            palworldVersion:
              manifest.palworldVersion,

            fileCount:
              manifest
                .summary
                .fileCount,

            totalBytes:
              manifest
                .summary
                .totalBytes
          },

          validation: {
            archiveEntryCount:
              inspected
                .entryCount,

            archiveFileCount:
              inspected
                .fileEntries
                .size,

            expandedBytes:
              inspected
                .expandedBytes,

            manifestFilesMatched:
              true,

            hashesVerified:
              true,

            archiveShapeVerified:
              true
          },

          warnings
        };

      writeFileSync(
        path.join(
          upload.directory,
          "preview.json"
        ),

        JSON.stringify(
          preview,
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

      this.audit.record({
        category:
          "palworld-save",

        action:
          "import-preview",

        message:
          "Palworld save import archive validated and quarantined.",

        entityType:
          "save-import-operation",

        entityId:
          upload.operationId,

        metadata: {
          kind:
            manifest.kind,

          slotId:
            manifest
              .source
              .slotId,

          worldId:
            manifest
              .source
              .worldId,

          playerId:
            manifest
              .source
              .playerId ??
            null,

          fileCount:
            manifest
              .summary
              .fileCount,

          totalBytes:
            manifest
              .summary
              .totalBytes,

          archiveBytes:
            stored.archiveBytes,

          archiveSha256:
            stored.archiveSha256
        }
      });

      return preview;
    } catch (
      error
    ) {
      if (
        error instanceof
        SaveImportError
      ) {
        throw error;
      }

      throw new SaveImportError(
        "Save import archive could not be validated.",
        400,
        "save-import-validation-failed"
      );
    }
  }

  public async ready(
    operationId:
      string
  ): Promise<SaveImportReadyOperation> {
    this.cleanupExpired();

    if (
      !UUID.test(
        operationId
      )
    ) {
      throw new SaveImportError(
        "Save import operation ID is invalid.",
        400,
        "save-import-operation-invalid"
      );
    }

    const directory =
      path.join(
        this.importRoot,
        operationId
      );

    const previewPath =
      path.join(
        directory,
        "preview.json"
      );

    const appliedPath =
      path.join(
        directory,
        "applied.json"
      );

    const archivePath =
      path.join(
        directory,
        "upload.tar.gz"
      );

    const extractPath =
      path.join(
        directory,
        "staging"
      );

    if (
      existsSync(
        appliedPath
      )
    ) {
      throw new SaveImportError(
        "Save import operation has already been applied.",
        409,
        "save-import-already-applied"
      );
    }

    let preview:
      SaveImportPreview;

    try {
      const parsed:
        unknown =
          JSON.parse(
            readFileSync(
              previewPath,
              "utf8"
            )
          );

      if (
        typeof parsed !==
          "object" ||
        parsed ===
          null
      ) {
        throw new Error(
          "invalid-preview"
        );
      }

      const candidate =
        parsed as
          Partial<
            SaveImportPreview
          >;

      if (
        candidate.operationId !==
          operationId ||
        candidate.status !==
          "ready" ||
        typeof candidate.expiresAt !==
          "string" ||
        typeof candidate.archive !==
          "object" ||
        candidate.archive ===
          null ||
        typeof candidate.archive.sizeBytes !==
          "number" ||
        typeof candidate.archive.sha256 !==
          "string"
      ) {
        throw new Error(
          "invalid-preview"
        );
      }

      preview =
        candidate as
          SaveImportPreview;
    } catch {
      throw new SaveImportError(
        "Save import preview state could not be read.",
        404,
        "save-import-preview-not-found"
      );
    }

    const expiresAt =
      Date.parse(
        preview.expiresAt
      );

    if (
      Number.isNaN(
        expiresAt
      ) ||
      expiresAt <=
        Date.now()
    ) {
      this.discard(
        operationId
      );

      throw new SaveImportError(
        "Save import preview has expired.",
        410,
        "save-import-preview-expired"
      );
    }

    let archiveStat:
      Stats;

    try {
      archiveStat =
        lstatSync(
          archivePath
        );
    } catch {
      throw new SaveImportError(
        "Save import quarantine archive is missing.",
        409,
        "save-import-quarantine-missing"
      );
    }

    if (
      !archiveStat.isFile() ||
      archiveStat.isSymbolicLink() ||
      archiveStat.size !==
        preview.archive
          .sizeBytes
    ) {
      throw new SaveImportError(
        "Save import quarantine archive changed after preview.",
        409,
        "save-import-quarantine-changed"
      );
    }

    const archiveHash =
      await this.hashFile(
        archivePath
      );

    if (
      archiveHash !==
        preview.archive.sha256
    ) {
      throw new SaveImportError(
        "Save import quarantine archive hash changed after preview.",
        409,
        "save-import-quarantine-changed"
      );
    }

    const manifest =
      this.readManifest(
        extractPath
      );

    this.validateManifest(
      manifest
    );

    const inspected =
      await this.inspectArchive(
        archivePath
      );

    await this.verifyExtracted(
      extractPath,
      inspected,
      manifest
    );

    if (
      preview.source.kind !==
        manifest.kind ||
      preview.source.slotId !==
        manifest.source.slotId ||
      preview.source.worldId !==
        manifest.source.worldId ||
      preview.source.playerId !==
        (
          manifest.source
            .playerId ??
          null
        ) ||
      preview.manifest.fileCount !==
        manifest.summary.fileCount ||
      preview.manifest.totalBytes !==
        manifest.summary.totalBytes
    ) {
      throw new SaveImportError(
        "Save import preview no longer matches its validated manifest.",
        409,
        "save-import-preview-changed"
      );
    }

    return {
      operationId,

      directory,

      dataPath:
        path.join(
          extractPath,
          "data"
        ),

      archivePath,

      preview,

      manifest
    };
  }

  public markApplied(
    operationId:
      string,

    result:
      Record<
        string,
        unknown
      >
  ): void {
    if (
      !UUID.test(
        operationId
      )
    ) {
      throw new SaveImportError(
        "Save import operation ID is invalid.",
        400,
        "save-import-operation-invalid"
      );
    }

    const directory =
      path.join(
        this.importRoot,
        operationId
      );

    const previewPath =
      path.join(
        directory,
        "preview.json"
      );

    const appliedPath =
      path.join(
        directory,
        "applied.json"
      );

    if (
      !existsSync(
        previewPath
      )
    ) {
      throw new SaveImportError(
        "Save import preview was not found.",
        404,
        "save-import-preview-not-found"
      );
    }

    if (
      existsSync(
        appliedPath
      )
    ) {
      throw new SaveImportError(
        "Save import operation has already been applied.",
        409,
        "save-import-already-applied"
      );
    }

    try {
      writeFileSync(
        appliedPath,

        JSON.stringify(
          result,
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
    } catch {
      throw new SaveImportError(
        "Save import completion state could not be recorded.",
        500,
        "save-import-completion-write-failed"
      );
    }
  }

  public discard(
    operationId:
      string
  ): void {
    if (
      !UUID.test(
        operationId
      )
    ) {
      return;
    }

    rmSync(
      path.join(
        this.importRoot,
        operationId
      ),
      {
        recursive:
          true,

        force:
          true
      }
    );
  }

  private async inspectArchive(
    archivePath:
      string
  ): Promise<InspectedArchive> {
    let entryCount =
      0;

    let expandedBytes =
      0;

    const fileEntries =
      new Map<
        string,
        number
      >();

    const seen =
      new Set<string>();

    const seenCaseInsensitive =
      new Set<string>();

    const service =
      this;

    let policyError:
      SaveImportError | null =
        null;

    try {
      await tar.list({
        file:
          archivePath,

        strict:
          true,

        maxReadSize:
          4 * 1024 * 1024,

        maxMetaEntrySize:
          MAX_META_ENTRY_BYTES,

        maxDecompressionRatio:
          MAX_DECOMPRESSION_RATIO,

        filter: function (
          this: {
            abort(
              error: Error
            ): void;
          },

          entryPath,
          entry
        ) {
          if (
            policyError !==
            null
          ) {
            return false;
          }

          try {
            entryCount +=
              1;

            if (
              entryCount >
              MAX_ARCHIVE_ENTRIES
            ) {
              throw new SaveImportError(
                "Save import archive contains too many entries.",
                400,
                "save-import-entry-limit"
              );
            }

            const validatedPath =
              service
                .normalizeArchiveEntryPath(
                  entryPath
                );

            const key =
              validatedPath
                .toLocaleLowerCase(
                  "en-US"
                );

            if (
              seen.has(
                validatedPath
              ) ||
              seenCaseInsensitive
                .has(
                  key
                )
            ) {
              throw new SaveImportError(
                "Save import archive contains duplicate or colliding paths.",
                400,
                "save-import-duplicate-path"
              );
            }

            seen.add(
              validatedPath
            );

            seenCaseInsensitive
              .add(
                key
              );

            const depth =
              validatedPath
                .split(
                  "/"
                )
                .length;

            if (
              depth >
              MAX_DEPTH
            ) {
              throw new SaveImportError(
                "Save import archive exceeds the maximum directory depth.",
                400,
                "save-import-depth-limit"
              );
            }

            const entryType =
              "type" in entry &&
              typeof entry.type ===
                "string"
                ? entry.type
                : "isDirectory" in entry &&
                  typeof entry.isDirectory ===
                    "function" &&
                  entry.isDirectory()
                  ? "Directory"
                  : "isFile" in entry &&
                    typeof entry.isFile ===
                      "function" &&
                    entry.isFile()
                    ? "File"
                    : "Unsupported";

            if (
              service
                .isDirectoryType(
                  entryType
                )
            ) {
              service
                .validateArchiveShape(
                  validatedPath,
                  true
                );

              return true;
            }

            if (
              !service
                .isFileType(
                  entryType
                )
            ) {
              throw new SaveImportError(
                "Save import archive contains a link or unsupported filesystem entry.",
                400,
                "save-import-unsafe-entry"
              );
            }

            service
              .validateArchiveShape(
                validatedPath,
                false
              );

            const size =
              entry.size;

            if (
              !Number.isSafeInteger(
                size
              ) ||
              size <
                0
            ) {
              throw new SaveImportError(
                "Save import archive contains an invalid file size.",
                400,
                "save-import-invalid-size"
              );
            }

            if (
              validatedPath ===
                "manifest.json" &&
              size >
                MAX_MANIFEST_BYTES
            ) {
              throw new SaveImportError(
                "Save import manifest exceeds the maximum allowed size.",
                400,
                "save-import-manifest-too-large"
              );
            }

            expandedBytes +=
              size;

            if (
              expandedBytes >
              MAX_EXPANDED_BYTES
            ) {
              throw new SaveImportError(
                "Save import archive exceeds the maximum expanded size.",
                400,
                "save-import-expanded-size-limit"
              );
            }

            fileEntries.set(
              validatedPath,
              size
            );

            if (
              fileEntries.size >
              MAX_FILES +
              1
            ) {
              throw new SaveImportError(
                "Save import archive contains too many files.",
                400,
                "save-import-file-limit"
              );
            }

            return true;
          } catch (
            error
          ) {
            policyError =
              error instanceof
                SaveImportError
                ? error
                : new SaveImportError(
                    "Save import archive failed security inspection.",
                    400,
                    "save-import-invalid-archive"
                  );

            this.abort(
              policyError
            );

            return false;
          }
        }
      });
    } catch (
      error
    ) {
      if (
        policyError !==
        null
      ) {
        throw policyError;
      }

      if (
        error instanceof
        SaveImportError
      ) {
        throw error;
      }

      throw new SaveImportError(
        "Save import archive could not be safely inspected.",
        400,
        "save-import-invalid-archive"
      );
    }

    if (
      policyError !==
      null
    ) {
      throw policyError;
    }

    if (
      !fileEntries.has(
        "manifest.json"
      )
    ) {
      throw new SaveImportError(
        "Save import archive does not contain manifest.json.",
        400,
        "save-import-manifest-missing"
      );
    }

    return {
      entryCount,
      fileEntries,
      expandedBytes
    };
  }

  private async extractArchive(
    archivePath:
      string,

    extractPath:
      string
  ): Promise<void> {
    try {
      await tar.extract({
        file:
          archivePath,

        cwd:
          extractPath,

        strict:
          true,

        preservePaths:
          false,

        preserveOwner:
          false,

        chmod:
          false,

        noMtime:
          true,

        keep:
          true,

        maxDepth:
          MAX_DEPTH,

        maxMetaEntrySize:
          MAX_META_ENTRY_BYTES,

        maxDecompressionRatio:
          MAX_DECOMPRESSION_RATIO,

        filter:
          (
            entryPath,
            entry
          ) => {
            const validated =
              this.normalizeArchiveEntryPath(
                entryPath
              );

            const entryType =
              "type" in entry
                ? entry.type
                : entry.isDirectory()
                  ? "Directory"
                  : entry.isFile()
                    ? "File"
                    : "Unsupported";

            if (
              !this.isDirectoryType(
                entryType
              ) &&
              !this.isFileType(
                entryType
              )
            ) {
              throw new SaveImportError(
                "Save import archive contains an unsafe entry.",
                400,
                "save-import-unsafe-entry"
              );
            }

            this.validateArchiveShape(
              validated,
              this.isDirectoryType(
                entryType
              )
            );

            return true;
          }
      });
    } catch (
      error
    ) {
      if (
        error instanceof
        SaveImportError
      ) {
        throw error;
      }

      throw new SaveImportError(
        "Save import archive could not be safely extracted.",
        400,
        "save-import-extraction-failed"
      );
    }
  }

  private readManifest(
    extractPath:
      string
  ): SaveImportManifest {
    const manifestPath =
      path.join(
        extractPath,
        "manifest.json"
      );

    let stat:
      Stats;

    try {
      stat =
        lstatSync(
          manifestPath
        );
    } catch {
      throw new SaveImportError(
        "Save import manifest could not be read.",
        400,
        "save-import-manifest-missing"
      );
    }

    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size >
        MAX_MANIFEST_BYTES
    ) {
      throw new SaveImportError(
        "Save import manifest is not a valid regular file.",
        400,
        "save-import-manifest-invalid"
      );
    }

    let json:
      unknown;

    try {
      json =
        JSON.parse(
          readFileSync(
            manifestPath,
            "utf8"
          )
        );
    } catch {
      throw new SaveImportError(
        "Save import manifest is not valid JSON.",
        400,
        "save-import-manifest-invalid-json"
      );
    }

    const parsed =
      ManifestSchema
        .safeParse(
          json
        );

    if (!parsed.success) {
      throw new SaveImportError(
        "Save import manifest does not match the supported schema.",
        400,
        "save-import-manifest-schema"
      );
    }

    return parsed.data;
  }

  private validateManifest(
    manifest:
      SaveImportManifest
  ): void {
    if (
      Number.isNaN(
        Date.parse(
          manifest.createdAt
        )
      )
    ) {
      throw new SaveImportError(
        "Save import manifest creation timestamp is invalid.",
        400,
        "save-import-manifest-timestamp"
      );
    }

    if (
      manifest.kind ===
        "player" &&
      !manifest.source
        .playerId
    ) {
      throw new SaveImportError(
        "Player save import manifest is missing its player ID.",
        400,
        "save-import-player-id-missing"
      );
    }

    if (
      manifest.kind ===
        "world" &&
      manifest.source
        .playerId !==
        undefined
    ) {
      throw new SaveImportError(
        "World save import manifest contains an unexpected player ID.",
        400,
        "save-import-world-player-id"
      );
    }

    if (
      manifest.summary
        .fileCount !==
      manifest.files
        .length
    ) {
      throw new SaveImportError(
        "Save import manifest file count does not match its inventory.",
        400,
        "save-import-manifest-count-mismatch"
      );
    }

    const manifestPaths =
      new Set<string>();

    const caseInsensitive =
      new Set<string>();

    let totalBytes =
      0;

    for (
      const file
      of manifest.files
    ) {
      const validated =
        this.validateDataPath(
          file.path
        );

      if (
        validated !==
        file.path
      ) {
        throw new SaveImportError(
          "Save import manifest contains a non-canonical file path.",
          400,
          "save-import-manifest-path"
        );
      }

      const folded =
        validated
          .toLocaleLowerCase(
            "en-US"
          );

      if (
        manifestPaths.has(
          validated
        ) ||
        caseInsensitive
          .has(
            folded
          )
      ) {
        throw new SaveImportError(
          "Save import manifest contains duplicate or colliding file paths.",
          400,
          "save-import-manifest-duplicate"
        );
      }

      manifestPaths.add(
        validated
      );

      caseInsensitive
        .add(
          folded
        );

      if (
        Number.isNaN(
          Date.parse(
            file.modifiedAt
          )
        )
      ) {
        throw new SaveImportError(
          "Save import manifest contains an invalid file timestamp.",
          400,
          "save-import-file-timestamp"
        );
      }

      totalBytes +=
        file.sizeBytes;

      if (
        totalBytes >
        MAX_EXPANDED_BYTES
      ) {
        throw new SaveImportError(
          "Save import manifest exceeds the maximum expanded size.",
          400,
          "save-import-expanded-size-limit"
        );
      }
    }

    if (
      manifest.summary
        .totalBytes !==
      totalBytes
    ) {
      throw new SaveImportError(
        "Save import manifest byte total does not match its inventory.",
        400,
        "save-import-manifest-size-mismatch"
      );
    }

    if (
      manifest.kind ===
      "player"
    ) {
      const playerId =
        manifest.source
          .playerId;

      if (!playerId) {
        throw new SaveImportError(
          "Player save import manifest is missing its player ID.",
          400,
          "save-import-player-id-missing"
        );
      }

      const expected =
        `Players/${playerId}.sav`;

      if (
        manifest.files
          .length !==
          1 ||
        manifest.files[0]
          ?.path !==
          expected
      ) {
        throw new SaveImportError(
          "Player save import archive does not have the canonical player layout.",
          400,
          "save-import-player-layout"
        );
      }
    }

    if (
      manifest.kind ===
      "world"
    ) {
      const looksLikeWorld =
        manifest.files
          .some(
            file =>
              file.path ===
                "Level.sav" ||
              file.path ===
                "LevelMeta.sav" ||
              (
                file.path
                  .startsWith(
                    "Players/"
                  ) &&
                file.path
                  .endsWith(
                    ".sav"
                  )
              )
          );

      if (!looksLikeWorld) {
        throw new SaveImportError(
          "World save import archive does not contain recognizable Palworld save data.",
          400,
          "save-import-world-layout"
        );
      }
    }
  }

  private async verifyExtracted(
    extractPath:
      string,

    inspected:
      InspectedArchive,

    manifest:
      SaveImportManifest
  ): Promise<void> {
    const archiveDataFiles =
      [...inspected
        .fileEntries
        .entries()]
        .filter(
          ([entryPath]) =>
            entryPath
              .startsWith(
                "data/"
              )
        )
        .map(
          ([
            entryPath,
            size
          ]) => ({
            path:
              entryPath
                .slice(
                  "data/".length
                ),

            size
          })
        )
        .sort(
          (
            left,
            right
          ) =>
            left.path
              .localeCompare(
                right.path
              )
        );

    const manifestFiles =
      [...manifest.files]
        .sort(
          (
            left,
            right
          ) =>
            left.path
              .localeCompare(
                right.path
              )
        );

    if (
      archiveDataFiles
        .length !==
      manifestFiles
        .length
    ) {
      throw new SaveImportError(
        "Archive file inventory does not match manifest.json.",
        400,
        "save-import-inventory-mismatch"
      );
    }

    for (
      let index =
        0;

      index <
      manifestFiles.length;

      index +=
        1
    ) {
      const archiveFile =
        archiveDataFiles[
          index
        ];

      const manifestFile =
        manifestFiles[
          index
        ];

      if (
        !archiveFile ||
        !manifestFile ||
        archiveFile.path !==
          manifestFile.path ||
        archiveFile.size !==
          manifestFile.sizeBytes
      ) {
        throw new SaveImportError(
          "Archive file inventory does not match manifest.json.",
          400,
          "save-import-inventory-mismatch"
        );
      }

      const absolute =
        this.resolveInside(
          path.join(
            extractPath,
            "data"
          ),

          manifestFile
            .path
        );

      let stat:
        Stats;

      try {
        stat =
          lstatSync(
            absolute
          );
      } catch {
        throw new SaveImportError(
          "An expected save file is missing after extraction.",
          400,
          "save-import-extracted-file-missing"
        );
      }

      if (
        stat.isSymbolicLink() ||
        !stat.isFile()
      ) {
        throw new SaveImportError(
          "Extracted save data contains a non-regular file.",
          400,
          "save-import-extracted-file-invalid"
        );
      }

      if (
        stat.size !==
        manifestFile
          .sizeBytes
      ) {
        throw new SaveImportError(
          "Extracted save file size does not match manifest.json.",
          400,
          "save-import-file-size-mismatch"
        );
      }

      const hash =
        await this.hashFile(
          absolute
        );

      if (
        hash !==
        manifestFile
          .sha256
      ) {
        throw new SaveImportError(
          "Extracted save file SHA-256 does not match manifest.json.",
          400,
          "save-import-hash-mismatch"
        );
      }
    }
  }

  private normalizeArchiveEntryPath(
    value:
      string
  ): string {
    const normalized =
      value.endsWith(
        "/"
      )
        ? value.slice(
            0,
            -1
          )
        : value;

    return this.validateArchivePath(
      normalized
    );
  }

  private validateArchivePath(
    value:
      string
  ): string {
    if (
      value.length ===
        0 ||
      value.length >
        4096 ||
      value.includes(
        "\0"
      ) ||
      value.includes(
        "\\"
      ) ||
      value.startsWith(
        "/"
      ) ||
      /^[A-Za-z]:/.test(
        value
      )
    ) {
      throw new SaveImportError(
        "Save import archive contains an unsafe path.",
        400,
        "save-import-unsafe-path"
      );
    }

    const parts =
      value.split(
        "/"
      );

    if (
      parts.some(
        part =>
          part.length ===
            0 ||
          part ===
            "." ||
          part ===
            ".." ||
          part.length >
            255
      )
    ) {
      throw new SaveImportError(
        "Save import archive contains an unsafe path.",
        400,
        "save-import-unsafe-path"
      );
    }

    return value;
  }

  private validateDataPath(
    value:
      string
  ): string {
    const validated =
      this.validateArchivePath(
        value
      );

    const first =
      validated
        .split(
          "/"
        )[0]
        ?.toLocaleLowerCase(
          "en-US"
        );

    if (
      first ===
      "backup"
    ) {
      throw new SaveImportError(
        "Normal save imports may not contain Palworld backup-tree content.",
        400,
        "save-import-backup-content"
      );
    }

    return validated;
  }

  private validateArchiveShape(
    entryPath:
      string,

    directory:
      boolean
  ): void {
    if (
      entryPath ===
      "manifest.json"
    ) {
      if (directory) {
        throw new SaveImportError(
          "manifest.json must be a regular file.",
          400,
          "save-import-manifest-invalid"
        );
      }

      return;
    }

    if (
      entryPath ===
      "data"
    ) {
      if (!directory) {
        throw new SaveImportError(
          "The save import data root must be a directory.",
          400,
          "save-import-layout"
        );
      }

      return;
    }

    if (
      !entryPath
        .startsWith(
          "data/"
        )
    ) {
      throw new SaveImportError(
        "Save import archive contains files outside the canonical layout.",
        400,
        "save-import-layout"
      );
    }

    this.validateDataPath(
      entryPath
        .slice(
          "data/".length
        )
    );
  }

  private isFileType(
    type:
      string
  ): boolean {
    return (
      type ===
        "File" ||
      type ===
        "OldFile" ||
      type ===
        "ContiguousFile"
    );
  }

  private isDirectoryType(
    type:
      string
  ): boolean {
    return (
      type ===
      "Directory"
    );
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
      throw new SaveImportError(
        "Save import path escaped its quarantine directory.",
        400,
        "save-import-path-escape"
      );
    }

    return resolved;
  }

  private assertGzip(
    archivePath:
      string
  ): void {
    const descriptor =
      openSync(
        archivePath,
        "r"
      );

    try {
      const header =
        Buffer.alloc(
          2
        );

      const count =
        readSync(
          descriptor,
          header,
          0,
          2,
          0
        );

      if (
        count !==
          2 ||
        header[0] !==
          0x1f ||
        header[1] !==
          0x8b
      ) {
        throw new SaveImportError(
          "Save import must be a gzip-compressed tar archive.",
          400,
          "save-import-not-gzip"
        );
      }
    } finally {
      closeSync(
        descriptor
      );
    }
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

  private safeOriginalName(
    value:
      string
  ): string {
    const final =
      value
        .split(
          /[\\/]/
        )
        .pop()
        ?.replace(
          /[\x00-\x1F\x7F]/g,
          ""
        )
        .slice(
          0,
          255
        );

    return final ||
      "upload.tar.gz";
  }

  private cleanupExpired():
    void {
    if (
      !existsSync(
        this.importRoot
      )
    ) {
      return;
    }

    let entries:
      string[];

    try {
      entries =
        readdirSync(
          this.importRoot
        );
    } catch {
      return;
    }

    const cutoff =
      Date.now() -
      OPERATION_TTL_MS;

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

      const candidate =
        path.join(
          this.importRoot,
          name
        );

      let stat:
        Stats;

      try {
        stat =
          statSync(
            candidate
          );
      } catch {
        continue;
      }

      if (
        stat.mtimeMs <
        cutoff
      ) {
        rmSync(
          candidate,
          {
            recursive:
              true,

            force:
              true
          }
        );
      }
    }
  }
}