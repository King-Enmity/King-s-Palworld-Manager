import {
  Archive,
  ArchiveRestore,
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
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Users
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

interface SavePlayer {
  playerId:
    string;

  fileName:
    string;

  sizeBytes:
    number;

  modifiedAt:
    string;
}

interface SaveWorld {
  slotId:
    string;

  worldId:
    string;

  fileCount:
    number;

  totalBytes:
    number;

  modifiedAt:
    string |
    null;

  playerCount:
    number;

  players:
    SavePlayer[];

  hasLevelSav:
    boolean;

  hasLevelMetaSav:
    boolean;

  hasWorldOptionSav:
    boolean;

  backupDirectoryPresent:
    boolean;

  safe:
    boolean;

  warnings:
    string[];
}

interface SaveInventory {
  configured:
    boolean;

  saveGamesPresent:
    boolean;

  worlds:
    SaveWorld[];

  summary: {
    worldCount:
      number;

    playerCount:
      number;

    totalBytes:
      number;
  };

  warnings:
    string[];
}

interface ImportPreview {
  operationId:
    string;

  status:
    "ready";

  createdAt:
    string;

  expiresAt:
    string;

  originalFileName:
    string;

  archive: {
    sizeBytes:
      number;

    sha256:
      string;
  };

  source: {
    kind:
      "world" |
      "player";

    slotId:
      string;

    worldId:
      string;

    playerId:
      string |
      null;
  };

  manifest: {
    format:
      "kpm-palworld-save-export";

    schemaVersion:
      1;

    createdAt:
      string;

    managerVersion:
      string;

    palworldVersion:
      string |
      null;

    fileCount:
      number;

    totalBytes:
      number;
  };

  validation: {
    archiveEntryCount:
      number;

    archiveFileCount:
      number;

    expandedBytes:
      number;

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

interface RollbackSnapshot {
  id:
    string;

  kind:
    "world" |
    "player";

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

interface RollbackResponse {
  rollbacks:
    RollbackSnapshot[];
}

interface ApplyResult {
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
    RollbackSnapshot;

  validation: {
    filesVerified:
      true;

    hashesVerified:
      true;
  };
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
    value <
      0
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
    size >=
      100
      ? 0
      : size >=
          10
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
        message?:
          unknown;
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
    rollbacks,
    setRollbacks
  ] =
    useState<
      RollbackSnapshot[]
    >(
      []
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

  const [
    targetSlotId,
    setTargetSlotId
  ] =
    useState(
      ""
    );

  const [
    targetWorldId,
    setTargetWorldId
  ] =
    useState(
      ""
    );

  const serverStopped =
    runtimeStatus ===
    "stopped";

  const loadData =
    useCallback(
      async (
        showLoading =
          true
      ): Promise<void> => {
        if (
          showLoading
        ) {
          setLoading(
            true
          );
        }

        try {
          const [
            inventoryResponse,
            rollbackResponse
          ] =
            await Promise.all([
              fetch(
                "/api/v1/saves",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              ),

              fetch(
                "/api/v1/saves/rollbacks",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              )
            ]);

          if (
            !inventoryResponse.ok
          ) {
            throw new Error(
              await errorMessage(
                inventoryResponse
              )
            );
          }

          if (
            !rollbackResponse.ok
          ) {
            throw new Error(
              await errorMessage(
                rollbackResponse
              )
            );
          }

          const inventoryPayload =
            await inventoryResponse
              .json() as
                SaveInventory;

          const rollbackPayload =
            await rollbackResponse
              .json() as
                RollbackResponse;

          setInventory(
            inventoryPayload
          );

          setRollbacks(
            rollbackPayload
              .rollbacks
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
              : "Save Tools data could not be loaded."
          );
        } finally {
          if (
            showLoading
          ) {
            setLoading(
              false
            );
          }
        }
      },
      []
    );

  useEffect(
    () => {
      void loadData();

      const timer =
        window.setInterval(
          () => {
            void loadData(
              false
            );
          },
          15_000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    [
      loadData
    ]
  );

  const matchingTargetWorlds =
    useMemo(
      () => {
        if (
          !importPreview ||
          !inventory
        ) {
          return [];
        }

        return inventory.worlds
          .filter(
            world =>
              world.worldId ===
              importPreview
                .source
                .worldId
          );
      },
      [
        importPreview,
        inventory
      ]
    );

  const importTargetExists =
    useMemo(
      () =>
        inventory
          ?.worlds
          .some(
            world =>
              world.slotId ===
                targetSlotId &&
              world.worldId ===
                targetWorldId
          ) ??
        false,
      [
        inventory,
        targetSlotId,
        targetWorldId
      ]
    );

  const exportArchive =
    async (
      label:
        string,

      endpoint:
        string,

      fallbackName:
        string
    ): Promise<void> => {
      if (
        !serverStopped
      ) {
        setNotice({
          type:
            "error",

          message:
            "Palworld must be stopped before exporting live save data."
        });

        return;
      }

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

        if (
          !response.ok
        ) {
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
      if (
        !importFile
      ) {
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

        if (
          !response.ok
        ) {
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

        setTargetSlotId(
          preview.source
            .slotId
        );

        setTargetWorldId(
          preview.source
            .worldId
        );

        setNotice({
          type:
            "success",

          message:
            "Archive passed quarantine validation. Live save data has not been changed."
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

  const applyImport =
    async (): Promise<void> => {
      if (
        !importPreview
      ) {
        return;
      }

      if (
        !serverStopped
      ) {
        setNotice({
          type:
            "error",

          message:
            "Palworld must be stopped before applying imported save data."
        });

        return;
      }

      if (
        !targetSlotId.trim() ||
        !targetWorldId.trim()
      ) {
        setNotice({
          type:
            "error",

          message:
            "A target slot and world are required."
        });

        return;
      }

      if (
        targetWorldId !==
        importPreview.source
          .worldId
      ) {
        setNotice({
          type:
            "error",

          message:
            "V1 imports must preserve the Palworld world ID."
        });

        return;
      }

      if (
        importPreview.source
          .kind ===
          "player" &&
        !importTargetExists
      ) {
        setNotice({
          type:
            "error",

          message:
            "Player imports require an existing target world with the same world ID."
        });

        return;
      }

      const subject =
        importPreview.source
          .kind ===
          "world"
          ? `world ${targetSlotId}/${targetWorldId}`
          : `player ${importPreview.source.playerId ?? "unknown"} into ${targetSlotId}/${targetWorldId}`;

      const warning =
        importPreview.source
          .kind ===
          "world"
          ? "Existing live world files will be replaced. Palworld's Backup directory is preserved."
          : importTargetExists
            ? "If this player already exists, the player save will be replaced."
            : "The player save will be added to the target world.";

      const approved =
        window.confirm(
          [
            `Apply imported ${subject}?`,
            "",
            warning,
            "",
            "King's Palworld Manager will create and retain a rollback snapshot before changing live save data.",
            "",
            "The import is single-use after a successful apply."
          ].join(
            "\n"
          )
        );

      if (
        !approved
      ) {
        return;
      }

      setBusy(
        "Apply import"
      );

      setNotice({
        type:
          "working",

        message:
          "Creating rollback snapshot, replacing save data and verifying SHA-256…"
      });

      try {
        const response =
          await fetch(
            `/api/v1/saves/import/${encodeURIComponent(
              importPreview.operationId
            )}/apply`,
            {
              method:
                "POST",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  targetSlotId:
                    targetSlotId.trim(),

                  targetWorldId:
                    targetWorldId.trim()
                })
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await errorMessage(
              response
            )
          );
        }

        const result =
          await response
            .json() as
              ApplyResult;

        setNotice({
          type:
            "success",

          message:
            `${result.kind === "world" ? "World" : "Player"} import applied and verified. Rollback ${result.rollback.id} was retained.`
        });

        setImportPreview(
          null
        );

        setImportFile(
          null
        );

        setTargetSlotId(
          ""
        );

        setTargetWorldId(
          ""
        );

        await loadData(
          false
        );
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
              : "Save import could not be applied."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const restoreRollback =
    async (
      rollback:
        RollbackSnapshot
    ): Promise<void> => {
      if (
        !serverStopped
      ) {
        setNotice({
          type:
            "error",

          message:
            "Palworld must be stopped before restoring a rollback snapshot."
        });

        return;
      }

      const target =
        rollback.kind ===
          "world"
          ? `${rollback.target.slotId}/${rollback.target.worldId}`
          : `${rollback.target.slotId}/${rollback.target.worldId}/${rollback.target.playerId ?? "unknown"}`;

      const approved =
        window.confirm(
          [
            `Restore rollback ${rollback.id}?`,
            "",
            `Target: ${target}`,
            "",
            rollback.kind ===
              "world"
              ? "This replaces the current world data with the retained pre-import snapshot."
              : rollback.sourceExisted
                ? "This replaces the current player save with the retained pre-import copy."
                : "The original player did not exist, so restore will remove the imported player.",
            "",
            "The rollback snapshot itself will remain available after restoration."
          ].join(
            "\n"
          )
        );

      if (
        !approved
      ) {
        return;
      }

      setBusy(
        `Restore ${rollback.id}`
      );

      setNotice({
        type:
          "working",

        message:
          "Restoring rollback snapshot and verifying save data…"
      });

      try {
        const response =
          await fetch(
            `/api/v1/saves/rollbacks/${encodeURIComponent(
              rollback.id
            )}/restore`,
            {
              method:
                "POST",

              headers: {
                Accept:
                  "application/json"
              }
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await errorMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            "Rollback restored successfully. The snapshot is still retained."
        });

        await loadData(
          false
        );
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
              : "Rollback restore failed."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const deleteRollback =
    async (
      rollback:
        RollbackSnapshot
    ): Promise<void> => {
      const approved =
        window.confirm(
          [
            `Delete rollback ${rollback.id}?`,
            "",
            "This permanently removes the retained rollback snapshot.",
            "",
            "This action does not modify the current Palworld world."
          ].join(
            "\n"
          )
        );

      if (
        !approved
      ) {
        return;
      }

      setBusy(
        `Delete ${rollback.id}`
      );

      try {
        const response =
          await fetch(
            `/api/v1/saves/rollbacks/${encodeURIComponent(
              rollback.id
            )}`,
            {
              method:
                "DELETE",

              headers: {
                Accept:
                  "application/json"
              }
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await errorMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            "Rollback snapshot deleted."
        });

        await loadData(
          false
        );
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
              : "Rollback snapshot could not be deleted."
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
            PALWORLD SAVE TOOLS
          </p>

          <h1>
            Backups & Saves
          </h1>

          <p className="subtitle">
            Export worlds and players, validate imports, safely replace live saves and restore retained rollback snapshots.
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
            void loadData();
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
                    Save Tools unavailable
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

      <section
        className={
          serverStopped
            ? "save-runtime-banner save-runtime-stopped"
            : "save-runtime-banner save-runtime-blocked"
        }
      >
        {
          serverStopped
            ? (
                <ShieldCheck
                  size={18}
                />
              )
            : (
                <ShieldAlert
                  size={18}
                />
              )
        }

        <div>
          <strong>
            {
              serverStopped
                ? "Palworld is stopped — save mutations are unlocked"
                : `Palworld state: ${runtimeStatus} — destructive save actions are locked`
            }
          </strong>

          <span>
            {
              serverStopped
                ? "Exports, imports and rollback restores can be performed safely."
                : "Stop Palworld before exporting, applying an import or restoring a rollback."
            }
          </span>
        </div>
      </section>

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
            <ArchiveRestore
              size={18}
            />
          </div>

          <span>
            Rollbacks
          </span>

          <strong>
            {
              rollbacks.length
            }
          </strong>

          <small>
            Retained safety snapshots
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

      <section className="save-tools-layout">
        <article className="panel world-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                LIVE SAVE DATA
              </p>

              <h3>
                Worlds & players
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
                                onClick={() => {
                                  setExpandedWorld(
                                    expanded
                                      ? null
                                      : key
                                  );
                                }}
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
                                            Palworld Backup/
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
                                          world.warnings.length >
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
                                              !serverStopped ||
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
                                                          !serverStopped ||
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

        <div className="save-tools-side-column">
          <article className="control-card import-card save-import-center">
            <div className="control-heading">
              <div className="control-icon">
                <Upload
                  size={21}
                />
              </div>

              <div>
                <p className="eyebrow">
                  IMPORT CENTER
                </p>

                <h3>
                  Validate & apply
                </h3>
              </div>
            </div>

            <p className="control-copy">
              KPM exports are inspected in quarantine before any live files can be changed.
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

                    setTargetSlotId(
                      ""
                    );

                    setTargetWorldId(
                      ""
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
                  Quarantine first
                </strong>

                <span>
                  Paths, manifest, file inventory, expanded sizes and SHA-256 hashes are verified before apply is unlocked.
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
                            {
                              importPreview.source.kind ===
                                "world"
                                ? "World archive"
                                : "Player archive"
                            }
                          </span>
                        </div>
                      </div>

                      <dl className="save-details">
                        <div>
                          <dt>
                            Source slot
                          </dt>

                          <dd>
                            {
                              importPreview.source
                                .slotId
                            }
                          </dd>
                        </div>

                        <div>
                          <dt>
                            World ID
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
                            Size
                          </dt>

                          <dd>
                            {
                              formatBytes(
                                importPreview.manifest
                                  .totalBytes
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

                      <div className="import-target-panel">
                        <div className="import-target-heading">
                          <strong>
                            Apply target
                          </strong>

                          <span>
                            World ID is locked in V1. Slot may change.
                          </span>
                        </div>

                        <div className="import-target-fields">
                          <label>
                            <span>
                              Target slot
                            </span>

                            <input
                              maxLength={128}
                              onChange={
                                event =>
                                  setTargetSlotId(
                                    event.target
                                      .value
                                  )
                              }
                              value={
                                targetSlotId
                              }
                            />
                          </label>

                          <label>
                            <span>
                              Target world ID
                            </span>

                            <input
                              disabled
                              value={
                                targetWorldId
                              }
                            />
                          </label>
                        </div>

                        {
                          importPreview.source
                            .kind ===
                            "player"
                            ? (
                                <div className="matching-worlds">
                                  <span>
                                    Compatible existing worlds
                                  </span>

                                  {
                                    matchingTargetWorlds.length >
                                      0
                                      ? matchingTargetWorlds.map(
                                          world => (
                                            <button
                                              className={
                                                world.slotId ===
                                                  targetSlotId
                                                  ? "matching-world active"
                                                  : "matching-world"
                                              }
                                              key={
                                                `${world.slotId}/${world.worldId}`
                                              }
                                              onClick={() => {
                                                setTargetSlotId(
                                                  world.slotId
                                                );

                                                setTargetWorldId(
                                                  world.worldId
                                                );
                                              }}
                                              type="button"
                                            >
                                              Slot {
                                                world.slotId
                                              }
                                            </button>
                                          )
                                        )
                                      : (
                                          <strong>
                                            No compatible target world is currently installed.
                                          </strong>
                                        )
                                  }
                                </div>
                              )
                            : null
                        }

                        <div className="save-destructive-warning">
                          <ShieldAlert
                            size={17}
                          />

                          <div>
                            <strong>
                              {
                                importPreview.source
                                  .kind ===
                                  "world"
                                  ? importTargetExists
                                    ? "Existing world will be replaced"
                                    : "A new world target will be created"
                                  : importTargetExists
                                    ? "Player save will be added or replaced"
                                    : "Player import requires an existing compatible world"
                              }
                            </strong>

                            <span>
                              A rollback snapshot is created and retained before KPM modifies live save data.
                            </span>
                          </div>
                        </div>

                        <button
                          className="control-button wide-button save-apply-import-button"
                          disabled={
                            !serverStopped ||
                            busy !==
                              null ||
                            !targetSlotId.trim() ||
                            !targetWorldId.trim() ||
                            (
                              importPreview.source.kind ===
                                "player" &&
                              !importTargetExists
                            )
                          }
                          onClick={() => {
                            void applyImport();
                          }}
                          type="button"
                        >
                          <ArchiveRestore
                            size={15}
                          />

                          Apply validated import
                        </button>
                      </div>
                    </div>
                  )
                : null
            }
          </article>
        </div>
      </section>

      <section className="panel rollback-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              RECOVERY
            </p>

            <h3>
              Rollback snapshots
            </h3>
          </div>

          <span className="panel-count">
            {
              rollbacks.length
            }
          </span>
        </div>

        <div className="rollback-explanation">
          <DatabaseBackup
            size={17}
          />

          <div>
            <strong>
              Retained until you delete them
            </strong>

            <span>
              Successful imports do not discard their pre-import safety copy. Restore or delete snapshots explicitly from here.
            </span>
          </div>
        </div>

        {
          rollbacks.length >
            0
            ? (
                <div className="rollback-list">
                  {
                    rollbacks.map(
                      rollback => {
                        const target =
                          rollback.kind ===
                            "world"
                            ? `${rollback.target.slotId}/${rollback.target.worldId}`
                            : `${rollback.target.slotId}/${rollback.target.worldId}/${rollback.target.playerId ?? "unknown"}`;

                        return (
                          <article
                            className="rollback-card"
                            key={
                              rollback.id
                            }
                          >
                            <div className="rollback-card-icon">
                              {
                                rollback.kind ===
                                  "world"
                                  ? (
                                      <HardDrive
                                        size={18}
                                      />
                                    )
                                  : (
                                      <Users
                                        size={18}
                                      />
                                    )
                              }
                            </div>

                            <div className="rollback-card-main">
                              <div className="rollback-card-heading">
                                <div>
                                  <strong>
                                    {
                                      rollback.kind ===
                                        "world"
                                        ? "World rollback"
                                        : "Player rollback"
                                    }
                                  </strong>

                                  <span>
                                    {target}
                                  </span>
                                </div>

                                <code>
                                  {
                                    rollback.id
                                  }
                                </code>
                              </div>

                              <div className="rollback-meta">
                                <span>
                                  Created {
                                    formatDate(
                                      rollback.createdAt
                                    )
                                  }
                                </span>

                                <span>
                                  {
                                    rollback.fileCount
                                  } files
                                </span>

                                <span>
                                  {
                                    formatBytes(
                                      rollback.totalBytes
                                    )
                                  }
                                </span>

                                {
                                  rollback.lastRestoredAt
                                    ? (
                                        <span className="rollback-restored-badge">
                                          Restored {
                                            formatDate(
                                              rollback.lastRestoredAt
                                            )
                                          }
                                        </span>
                                      )
                                    : null
                                }
                              </div>

                              {
                                rollback.kind ===
                                  "player" &&
                                !rollback.sourceExisted
                                  ? (
                                      <div className="rollback-new-player-note">
                                        Original player did not exist. Restoring this snapshot removes the imported player.
                                      </div>
                                    )
                                  : null
                              }
                            </div>

                            <div className="rollback-actions">
                              <button
                                className="control-button"
                                disabled={
                                  !serverStopped ||
                                  busy !==
                                    null
                                }
                                onClick={() => {
                                  void restoreRollback(
                                    rollback
                                  );
                                }}
                                type="button"
                              >
                                <RotateCcw
                                  size={13}
                                />

                                Restore
                              </button>

                              <button
                                className="rollback-delete-button"
                                disabled={
                                  busy !==
                                  null
                                }
                                onClick={() => {
                                  void deleteRollback(
                                    rollback
                                  );
                                }}
                                type="button"
                              >
                                <Trash2
                                  size={13}
                                />

                                Delete
                              </button>
                            </div>
                          </article>
                        );
                      }
                    )
                  }
                </div>
              )
            : (
                <div className="empty-state rollback-empty-state">
                  <Archive
                    size={28}
                  />

                  <strong>
                    No rollback snapshots retained
                  </strong>

                  <span>
                    KPM creates a rollback automatically before a successful save import changes live data.
                  </span>
                </div>
              )
        }
      </section>
    </>
  );
}