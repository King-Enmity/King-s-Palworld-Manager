import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  DatabaseBackup,
  Download,
  FileArchive,
  FileCheck2,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState
} from "react";

interface SavePlayer {
  playerId: string;

  fileName: string;

  sizeBytes: number;

  modifiedAt: string;
}

interface SaveWorld {
  slotId: string;
  worldId: string;

  fileCount: number;
  totalBytes: number;

  modifiedAt:
    string |
    null;

  playerCount: number;

  players:
    SavePlayer[];

  hasLevelSav: boolean;
  hasLevelMetaSav: boolean;
  hasWorldOptionSav: boolean;

  backupDirectoryPresent:
    boolean;

  safe: boolean;

  warnings:
    string[];
}

interface SaveInventory {
  configured: boolean;

  saveGamesPresent:
    boolean;

  worlds:
    SaveWorld[];

  summary: {
    worldCount: number;
    playerCount: number;
    totalBytes: number;
  };

  warnings:
    string[];
}

interface ImportPreview {
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
      string |
      null;
  };

  manifest: {
    format:
      "kpm-palworld-save-export";

    schemaVersion:
      1;

    createdAt: string;

    managerVersion: string;

    palworldVersion:
      string |
      null;

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

interface SavesPageProps {
  runtimeStatus:
    | "unknown"
    | "stopped"
    | "starting"
    | "running"
    | "stopping"
    | "crashed";

  managerApiError:
    string |
    null;
}

interface Notice {
  type:
    "success" |
    "error" |
    "working";

  message:
    string;
}

function formatBytes(
  value:
    number
): string {
  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {
    return "—";
  }

  if (
    value <
    1024
  ) {
    return `${value} B`;
  }

  const units = [
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  let size =
    value /
    1024;

  let unitIndex =
    0;

  while (
    size >=
      1024 &&
    unitIndex <
      units.length -
      1
  ) {
    size /=
      1024;

    unitIndex +=
      1;
  }

  return `${size.toFixed(
    size >= 100
      ? 0
      : size >= 10
        ? 1
        : 2
  )} ${units[unitIndex]}`;
}

function formatDate(
  value:
    string |
    null
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date
    .toLocaleString();
}

async function errorMessage(
  response:
    Response
): Promise<string> {
  const text =
    await response.text();

  if (!text) {
    return `HTTP ${response.status}`;
  }

  try {
    const parsed =
      JSON.parse(
        text
      ) as {
        message?: unknown;
      };

    if (
      typeof parsed.message ===
        "string"
    ) {
      return parsed.message;
    }
  } catch {
    return text;
  }

  return text;
}

function downloadName(
  response:
    Response,

  fallback:
    string
): string {
  const disposition =
    response.headers
      .get(
        "content-disposition"
      );

  if (!disposition) {
    return fallback;
  }

  const match =
    /filename="([^"]+)"/i
      .exec(
        disposition
      );

  return match?.[1] ??
    fallback;
}

export function SavesPage({
  runtimeStatus,
  managerApiError
}: SavesPageProps) {
  const [
    inventory,
    setInventory
  ] =
    useState<
      SaveInventory |
      null
    >(
      null
    );

  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );

  const [
    pageError,
    setPageError
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    notice,
    setNotice
  ] =
    useState<
      Notice |
      null
    >(
      null
    );

  const [
    busy,
    setBusy
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    expandedWorld,
    setExpandedWorld
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    importFile,
    setImportFile
  ] =
    useState<
      File |
      null
    >(
      null
    );

  const [
    importPreview,
    setImportPreview
  ] =
    useState<
      ImportPreview |
      null
    >(
      null
    );

  const loadInventory =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await fetch(
              "/api/v1/saves",
              {
                headers: {
                  Accept:
                    "application/json"
                }
              }
            );

          if (!response.ok) {
            throw new Error(
              await errorMessage(
                response
              )
            );
          }

          const payload =
            await response
              .json() as
                SaveInventory;

          setInventory(
            payload
          );

          setPageError(
            null
          );
        } catch (
          error
        ) {
          setPageError(
            error instanceof
              Error
              ? error.message
              : "Save inventory could not be loaded."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(
    () => {
      void loadInventory();
    },
    [
      loadInventory
    ]
  );

  const exportsAllowed =
    runtimeStatus !==
      "running" &&
    runtimeStatus !==
      "starting" &&
    runtimeStatus !==
      "stopping";

  const exportArchive =
    async (
      label:
        string,

      endpoint:
        string,

      fallbackName:
        string
    ): Promise<void> => {
      setBusy(
        label
      );

      setNotice({
        type:
          "working",

        message:
          `${label} is being prepared…`
      });

      try {
        const response =
          await fetch(
            endpoint,
            {
              headers: {
                Accept:
                  "application/gzip"
              }
            }
          );

        if (!response.ok) {
          throw new Error(
            await errorMessage(
              response
            )
          );
        }

        const blob =
          await response
            .blob();

        const objectUrl =
          URL.createObjectURL(
            blob
          );

        const anchor =
          document.createElement(
            "a"
          );

        anchor.href =
          objectUrl;

        anchor.download =
          downloadName(
            response,
            fallbackName
          );

        document.body
          .appendChild(
            anchor
          );

        anchor.click();
        anchor.remove();

        URL.revokeObjectURL(
          objectUrl
        );

        const archiveHash =
          response.headers
            .get(
              "x-kpm-archive-sha256"
            );

        setNotice({
          type:
            "success",

          message:
            archiveHash
              ? `${label} downloaded. SHA-256 ${archiveHash}`
              : `${label} downloaded successfully.`
        });
      } catch (
        error
      ) {
        setNotice({
          type:
            "error",

          message:
            error instanceof
              Error
              ? error.message
              : `${label} failed.`
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const previewImport =
    async (): Promise<void> => {
      if (!importFile) {
        setNotice({
          type:
            "error",

          message:
            "Choose a KPM .tar.gz save export first."
        });

        return;
      }

      setBusy(
        "Import preview"
      );

      setImportPreview(
        null
      );

      setNotice({
        type:
          "working",

        message:
          "Uploading to quarantine and verifying archive…"
      });

      try {
        const form =
          new FormData();

        form.append(
          "archive",
          importFile
        );

        const response =
          await fetch(
            "/api/v1/saves/import/preview",
            {
              method:
                "POST",

              headers: {
                Accept:
                  "application/json"
              },

              body:
                form
            }
          );

        if (!response.ok) {
          throw new Error(
            await errorMessage(
              response
            )
          );
        }

        const preview =
          await response
            .json() as
              ImportPreview;

        setImportPreview(
          preview
        );

        setNotice({
          type:
            "success",

          message:
            "Archive passed quarantine validation. No live save files were changed."
        });
      } catch (
        error
      ) {
        setNotice({
          type:
            "error",

          message:
            error instanceof
              Error
              ? error.message
              : "Import preview failed."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            SAVE MANAGEMENT
          </p>

          <h1>
            Backups & Saves
          </h1>

          <p className="subtitle">
            Inspect worlds, export save archives and safely validate imports.
          </p>
        </div>

        <button
          className="refresh-button"
          disabled={
            loading ||
            busy !==
              null
          }
          onClick={() => {
            void loadInventory();
          }}
          type="button"
        >
          <RefreshCw
            className={
              loading
                ? "spin"
                : undefined
            }
            size={16}
          />

          Refresh
        </button>
      </header>

      {
        managerApiError ||
        pageError
          ? (
              <section className="action-notice action-notice-error">
                <CircleAlert
                  size={18}
                />

                <div>
                  <strong>
                    Save data unavailable
                  </strong>

                  <span>
                    {
                      pageError ??
                      managerApiError
                    }
                  </span>
                </div>
              </section>
            )
          : null
      }

      {
        notice
          ? (
              <section
                className={
                  `action-notice action-notice-${notice.type}`
                }
              >
                {
                  notice.type ===
                    "success"
                    ? (
                        <CheckCircle2
                          size={18}
                        />
                      )
                    : (
                        <CircleAlert
                          size={18}
                        />
                      )
                }

                <div>
                  <strong>
                    {
                      notice.type ===
                        "success"
                        ? "Completed"
                        : notice.type ===
                            "error"
                          ? "Action failed"
                          : "Working"
                    }
                  </strong>

                  <span>
                    {notice.message}
                  </span>
                </div>
              </section>
            )
          : null
      }

      <section className="save-summary-grid">
        <article>
          <div className="save-summary-icon">
            <HardDrive
              size={18}
            />
          </div>

          <span>
            Worlds
          </span>

          <strong>
            {
              inventory?.summary
                .worldCount ??
              "—"
            }
          </strong>

          <small>
            Discovered save worlds
          </small>
        </article>

        <article>
          <div className="save-summary-icon">
            <Users
              size={18}
            />
          </div>

          <span>
            Player saves
          </span>

          <strong>
            {
              inventory?.summary
                .playerCount ??
              "—"
            }
          </strong>

          <small>
            Across all worlds
          </small>
        </article>

        <article>
          <div className="save-summary-icon">
            <DatabaseBackup
              size={18}
            />
          </div>

          <span>
            Live save size
          </span>

          <strong>
            {
              inventory
                ? formatBytes(
                    inventory
                      .summary
                      .totalBytes
                  )
                : "—"
            }
          </strong>

          <small>
            Backup trees excluded
          </small>
        </article>

        <article>
          <div className="save-summary-icon">
            <Archive
              size={18}
            />
          </div>

          <span>
            Export state
          </span>

          <strong>
            {
              exportsAllowed
                ? "Ready"
                : "Server active"
            }
          </strong>

          <small>
            {
              exportsAllowed
                ? "World/player export allowed"
                : "Stop Palworld before exporting"
            }
          </small>
        </article>
      </section>

      {
        inventory &&
        inventory.warnings.length >
          0
          ? (
              <section className="save-warning-list">
                {
                  inventory
                    .warnings
                    .map(
                      warning => (
                        <div
                          key={
                            warning
                          }
                        >
                          <CircleAlert
                            size={15}
                          />

                          {warning}
                        </div>
                      )
                    )
                }
              </section>
            )
          : null
      }

      <section className="save-page-grid">
        <article className="panel world-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                LIVE WORLDS
              </p>

              <h3>
                Save inventory
              </h3>
            </div>

            <span className="panel-count">
              {
                inventory?.worlds
                  .length ??
                0
              }
            </span>
          </div>

          {
            inventory &&
            inventory.worlds.length >
              0
              ? (
                  <div className="world-list">
                    {
                      inventory.worlds.map(
                        world => {
                          const key =
                            `${world.slotId}/${world.worldId}`;

                          const expanded =
                            expandedWorld ===
                            key;

                          return (
                            <article
                              className={
                                world.safe
                                  ? "world-card"
                                  : "world-card world-card-unsafe"
                              }
                              key={
                                key
                              }
                            >
                              <button
                                className="world-card-header"
                                onClick={() =>
                                  setExpandedWorld(
                                    expanded
                                      ? null
                                      : key
                                  )
                                }
                                type="button"
                              >
                                {
                                  expanded
                                    ? (
                                        <ChevronDown
                                          size={17}
                                        />
                                      )
                                    : (
                                        <ChevronRight
                                          size={17}
                                        />
                                      )
                                }

                                <div className="world-card-title">
                                  <strong>
                                    {
                                      world.worldId
                                    }
                                  </strong>

                                  <span>
                                    Slot {world.slotId}
                                  </span>
                                </div>

                                <div className="world-card-meta">
                                  <span>
                                    {
                                      world.playerCount
                                    } players
                                  </span>

                                  <span>
                                    {
                                      formatBytes(
                                        world.totalBytes
                                      )
                                    }
                                  </span>

                                  <span
                                    className={
                                      world.safe
                                        ? "save-safety safe"
                                        : "save-safety unsafe"
                                    }
                                  >
                                    {
                                      world.safe
                                        ? "Safe"
                                        : "Warning"
                                    }
                                  </span>
                                </div>
                              </button>

                              {
                                expanded
                                  ? (
                                      <div className="world-card-body">
                                        <div className="world-file-flags">
                                          <span
                                            className={
                                              world.hasLevelSav
                                                ? "present"
                                                : ""
                                            }
                                          >
                                            Level.sav
                                          </span>

                                          <span
                                            className={
                                              world.hasLevelMetaSav
                                                ? "present"
                                                : ""
                                            }
                                          >
                                            LevelMeta.sav
                                          </span>

                                          <span
                                            className={
                                              world.hasWorldOptionSav
                                                ? "present"
                                                : ""
                                            }
                                          >
                                            WorldOption.sav
                                          </span>

                                          <span
                                            className={
                                              world.backupDirectoryPresent
                                                ? "backup-present"
                                                : ""
                                            }
                                          >
                                            Palworld backup/
                                          </span>
                                        </div>

                                        <dl className="save-details">
                                          <div>
                                            <dt>
                                              Files
                                            </dt>

                                            <dd>
                                              {
                                                world.fileCount
                                              }
                                            </dd>
                                          </div>

                                          <div>
                                            <dt>
                                              Modified
                                            </dt>

                                            <dd>
                                              {
                                                formatDate(
                                                  world.modifiedAt
                                                )
                                              }
                                            </dd>
                                          </div>

                                          <div>
                                            <dt>
                                              Players
                                            </dt>

                                            <dd>
                                              {
                                                world.playerCount
                                              }
                                            </dd>
                                          </div>
                                        </dl>

                                        {
                                          world.warnings
                                            .length >
                                            0
                                            ? (
                                                <div className="world-warning-box">
                                                  {
                                                    world.warnings.map(
                                                      warning => (
                                                        <div
                                                          key={
                                                            warning
                                                          }
                                                        >
                                                          <CircleAlert
                                                            size={13}
                                                          />

                                                          {
                                                            warning
                                                          }
                                                        </div>
                                                      )
                                                    )
                                                  }
                                                </div>
                                              )
                                            : null
                                        }

                                        <div className="save-action-row">
                                          <button
                                            className="control-button"
                                            disabled={
                                              !exportsAllowed ||
                                              !world.safe ||
                                              busy !==
                                                null
                                            }
                                            onClick={() => {
                                              void exportArchive(
                                                `World ${world.worldId}`,

                                                `/api/v1/saves/worlds/${encodeURIComponent(
                                                  world.slotId
                                                )}/${encodeURIComponent(
                                                  world.worldId
                                                )}/export`,

                                                `${world.worldId}.tar.gz`
                                              );
                                            }}
                                            type="button"
                                          >
                                            <Download
                                              size={14}
                                            />

                                            Export world
                                          </button>
                                        </div>

                                        <div className="player-save-list">
                                          <div className="player-save-heading">
                                            <strong>
                                              Player saves
                                            </strong>

                                            <span>
                                              {
                                                world.players
                                                  .length
                                              }
                                            </span>
                                          </div>

                                          {
                                            world.players.length >
                                              0
                                              ? world.players.map(
                                                  player => (
                                                    <div
                                                      className="player-save-row"
                                                      key={
                                                        player.playerId
                                                      }
                                                    >
                                                      <div>
                                                        <strong>
                                                          {
                                                            player.playerId
                                                          }
                                                        </strong>

                                                        <span>
                                                          {
                                                            formatBytes(
                                                              player.sizeBytes
                                                            )
                                                          } · {
                                                            formatDate(
                                                              player.modifiedAt
                                                            )
                                                          }
                                                        </span>
                                                      </div>

                                                      <button
                                                        className="table-action-button"
                                                        disabled={
                                                          !exportsAllowed ||
                                                          !world.safe ||
                                                          busy !==
                                                            null
                                                        }
                                                        onClick={() => {
                                                          void exportArchive(
                                                            `Player ${player.playerId}`,

                                                            `/api/v1/saves/worlds/${encodeURIComponent(
                                                              world.slotId
                                                            )}/${encodeURIComponent(
                                                              world.worldId
                                                            )}/players/${encodeURIComponent(
                                                              player.playerId
                                                            )}/export`,

                                                            `${player.playerId}.tar.gz`
                                                          );
                                                        }}
                                                        type="button"
                                                      >
                                                        <Download
                                                          size={12}
                                                        />

                                                        Export
                                                      </button>
                                                    </div>
                                                  )
                                                )
                                              : (
                                                  <div className="player-save-empty">
                                                    No player saves detected.
                                                  </div>
                                                )
                                          }
                                        </div>
                                      </div>
                                    )
                                  : null
                              }
                            </article>
                          );
                        }
                      )
                    }
                  </div>
                )
              : (
                  <div className="empty-state">
                    <HardDrive
                      size={30}
                    />

                    <strong>
                      No Palworld worlds detected
                    </strong>

                    <span>
                      {
                        inventory?.configured
                          ? "World saves will appear here when SaveGames data exists."
                          : "Configure the Palworld root before save inventory can be discovered."
                      }
                    </span>
                  </div>
                )
          }
        </article>

        <article className="control-card import-card">
          <div className="control-heading">
            <div className="control-icon">
              <Upload
                size={21}
              />
            </div>

            <div>
              <p className="eyebrow">
                SAFE IMPORT
              </p>

              <h3>
                Quarantine & preview
              </h3>
            </div>
          </div>

          <p className="control-copy">
            Upload a KPM save archive for security inspection.
            This does not replace any live save data.
          </p>

          <label className="file-drop">
            <FileArchive
              size={28}
            />

            <strong>
              {
                importFile
                  ? importFile.name
                  : "Choose a .tar.gz save archive"
              }
            </strong>

            <span>
              {
                importFile
                  ? formatBytes(
                      importFile.size
                    )
                  : "World or individual player export"
              }
            </span>

            <input
              accept=".gz,.tgz,application/gzip"
              disabled={
                busy !==
                null
              }
              onChange={
                event => {
                  const file =
                    event.target
                      .files?.[0] ??
                    null;

                  setImportFile(
                    file
                  );

                  setImportPreview(
                    null
                  );
                }
              }
              type="file"
            />
          </label>

          <button
            className="control-button wide-button import-preview-button"
            disabled={
              !importFile ||
              busy !==
                null
            }
            onClick={() => {
              void previewImport();
            }}
            type="button"
          >
            <ShieldCheck
              size={15}
            />

            Validate import
          </button>

          <div className="import-safety-note">
            <ShieldCheck
              size={17}
            />

            <div>
              <strong>
                Preview only
              </strong>

              <span>
                Archive paths, entry types, manifest, sizes and SHA-256 hashes
                are verified in Manager quarantine before any future restore.
              </span>
            </div>
          </div>

          {
            importPreview
              ? (
                  <div className="import-preview-result">
                    <div className="import-result-heading">
                      <FileCheck2
                        size={20}
                      />

                      <div>
                        <strong>
                          Validation passed
                        </strong>

                        <span>
                          Operation {
                            importPreview.operationId
                          }
                        </span>
                      </div>
                    </div>

                    <dl className="save-details">
                      <div>
                        <dt>
                          Kind
                        </dt>

                        <dd>
                          {
                            importPreview.source
                              .kind
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          World
                        </dt>

                        <dd>
                          {
                            importPreview.source
                              .worldId
                          }
                        </dd>
                      </div>

                      {
                        importPreview.source
                          .playerId
                          ? (
                              <div>
                                <dt>
                                  Player
                                </dt>

                                <dd>
                                  {
                                    importPreview.source
                                      .playerId
                                  }
                                </dd>
                              </div>
                            )
                          : null
                      }

                      <div>
                        <dt>
                          Files
                        </dt>

                        <dd>
                          {
                            importPreview.manifest
                              .fileCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Expanded size
                        </dt>

                        <dd>
                          {
                            formatBytes(
                              importPreview.validation
                                .expandedBytes
                            )
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>
                          Expires
                        </dt>

                        <dd>
                          {
                            formatDate(
                              importPreview.expiresAt
                            )
                          }
                        </dd>
                      </div>
                    </dl>

                    <div className="hash-box">
                      <span>
                        Archive SHA-256
                      </span>

                      <code>
                        {
                          importPreview.archive
                            .sha256
                        }
                      </code>
                    </div>

                    {
                      importPreview.warnings.length >
                        0
                        ? (
                            <div className="world-warning-box">
                              {
                                importPreview.warnings.map(
                                  warning => (
                                    <div
                                      key={
                                        warning
                                      }
                                    >
                                      <CircleAlert
                                        size={13}
                                      />

                                      {
                                        warning
                                      }
                                    </div>
                                  )
                                )
                              }
                            </div>
                          )
                        : null
                    }
                  </div>
                )
              : null
          }
        </article>
      </section>
    </>
  );
}