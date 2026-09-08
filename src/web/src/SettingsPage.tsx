import {
  CheckCircle2,
  CircleAlert,
  Eye,
  FileCheck2,
  Filter,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

type SettingValue =
  | string
  | number
  | boolean;

type SettingType =
  | "boolean"
  | "integer"
  | "number"
  | "string";

interface ValidationIssue {
  code: string;
  message: string;
}

interface SettingDescriptor {
  key: string;

  type: SettingType;

  origin:
    | "default"
    | "live-only";

  knownByInstalledDefaults: boolean;
  sensitive: boolean;

  defaultPresent: boolean;
  currentPresent: boolean;

  defaultValue:
    SettingValue |
    null;

  currentValue:
    SettingValue |
    null;

  secretConfigured: boolean;

  modified: boolean;

  validation: {
    valid: boolean;

    errors:
      ValidationIssue[];

    warnings:
      ValidationIssue[];
  };
}

interface SettingsSnapshot {
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
    SettingDescriptor[];
}

interface WriteIssue {
  key:
    string |
    null;

  code: string;
  message: string;
}

interface WriteChange {
  key: string;
  sensitive: boolean;

  beforeValue:
    SettingValue |
    null;

  afterValue:
    SettingValue |
    null;

  beforeSecretConfigured: boolean;
  afterSecretConfigured: boolean;
}

interface SettingsPreview {
  valid: boolean;
  changed: boolean;
  restartRequired: boolean;

  sourceSha256:
    string |
    null;

  proposedSha256:
    string |
    null;

  errors:
    WriteIssue[];

  warnings:
    WriteIssue[];

  changes:
    WriteChange[];
}

interface ApplyResult
  extends SettingsPreview {
  applied: boolean;

  snapshotId:
    string |
    null;
}

interface Notice {
  type:
    "success" |
    "error" |
    "working";

  message: string;
}

type DraftValue =
  | string
  | boolean;

async function readError(
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

function valueText(
  value:
    SettingValue |
    null
): string {
  if (
    value ===
    null
  ) {
    return "";
  }

  return String(
    value
  );
}

function publicValue(
  value:
    SettingValue |
    null,

  sensitive:
    boolean,

  configured:
    boolean
): string {
  if (sensitive) {
    return configured
      ? "Configured"
      : "Not configured";
  }

  if (
    value ===
    null
  ) {
    return "—";
  }

  return String(
    value
  );
}

export function SettingsPage() {
  const [
    snapshot,
    setSnapshot
  ] =
    useState<
      SettingsSnapshot |
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
    error,
    setError
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
    search,
    setSearch
  ] =
    useState(
      ""
    );

  const [
    modifiedOnly,
    setModifiedOnly
  ] =
    useState(
      false
    );

  const [
    drafts,
    setDrafts
  ] =
    useState<
      Record<
        string,
        DraftValue
      >
    >(
      {}
    );

  const [
    preview,
    setPreview
  ] =
    useState<
      SettingsPreview |
      null
    >(
      null
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await fetch(
              "/api/v1/palworld/settings",
              {
                headers: {
                  Accept:
                    "application/json"
                }
              }
            );

          if (!response.ok) {
            throw new Error(
              await readError(
                response
              )
            );
          }

          const data =
            await response
              .json() as
                SettingsSnapshot;

          setSnapshot(
            data
          );

          setError(
            null
          );
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              Error
              ? caught.message
              : "Palworld settings could not be loaded."
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
      void load();
    },
    [
      load
    ]
  );

  const clearPreview =
    (): void => {
      setPreview(
        null
      );
    };

  const setDraft =
    (
      setting:
        SettingDescriptor,

      value:
        DraftValue
    ): void => {
      setDrafts(
        current => {
          const next = {
            ...current
          };

          if (
            setting.sensitive &&
            typeof value ===
              "string" &&
            value ===
              ""
          ) {
            delete next[
              setting.key
            ];

            return next;
          }

          if (
            setting.type ===
              "boolean" &&
            value ===
              setting.currentValue
          ) {
            delete next[
              setting.key
            ];

            return next;
          }

          if (
            setting.type !==
              "boolean" &&
            !setting.sensitive &&
            typeof value ===
              "string" &&
            value ===
              valueText(
                setting.currentValue
              )
          ) {
            delete next[
              setting.key
            ];

            return next;
          }

          next[
            setting.key
          ] =
            value;

          return next;
        }
      );

      clearPreview();
      setNotice(null);
    };

  const buildChanges =
    (): Record<
      string,
      SettingValue
    > => {
      const changes:
        Record<
          string,
          SettingValue
        > = {};

      if (!snapshot) {
        return changes;
      }

      const settingsByKey =
        new Map(
          snapshot
            .settings
            .map(
              setting => [
                setting.key,
                setting
              ]
            )
        );

      for (
        const [
          key,
          draft
        ]
        of Object.entries(
          drafts
        )
      ) {
        const setting =
          settingsByKey
            .get(
              key
            );

        if (!setting) {
          continue;
        }

        if (
          setting.type ===
          "boolean"
        ) {
          if (
            typeof draft ===
            "boolean"
          ) {
            changes[key] =
              draft;
          }

          continue;
        }

        if (
          typeof draft !==
          "string"
        ) {
          continue;
        }

        if (
          setting.type ===
          "integer"
        ) {
          const value =
            Number(
              draft
            );

          if (
            Number.isInteger(
              value
            )
          ) {
            changes[key] =
              value;
          }
          else {
            changes[key] =
              draft;
          }

          continue;
        }

        if (
          setting.type ===
          "number"
        ) {
          const value =
            Number(
              draft
            );

          changes[key] =
            Number.isFinite(
              value
            )
              ? value
              : draft;

          continue;
        }

        changes[key] =
          draft;
      }

      return changes;
    };

  const runPreview =
    async (): Promise<void> => {
      const changes =
        buildChanges();

      if (
        Object.keys(
          changes
        ).length ===
        0
      ) {
        setNotice({
          type:
            "error",

          message:
            "Change at least one editable setting before previewing."
        });

        return;
      }

      setBusy(
        "preview"
      );

      setNotice({
        type:
          "working",

        message:
          "Validating proposed Palworld settings…"
      });

      try {
        const response =
          await fetch(
            "/api/v1/palworld/settings/preview",
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
                  changes
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await readError(
              response
            )
          );
        }

        const result =
          await response
            .json() as
              SettingsPreview;

        setPreview(
          result
        );

        if (result.valid) {
          setNotice({
            type:
              "success",

            message:
              result.changed
                ? "Settings preview is valid and ready to apply."
                : "Preview is valid, but it produces no file changes."
          });
        }
        else {
          setNotice({
            type:
              "error",

            message:
              "One or more proposed settings are invalid."
          });
        }
      } catch (
        caught
      ) {
        setNotice({
          type:
            "error",

          message:
            caught instanceof
              Error
              ? caught.message
              : "Settings preview failed."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const apply =
    async (): Promise<void> => {
      if (
        !preview ||
        !preview.valid ||
        !preview.changed ||
        !preview.sourceSha256
      ) {
        setNotice({
          type:
            "error",

          message:
            "Create a valid preview before applying settings."
        });

        return;
      }

      const changes =
        buildChanges();

      setBusy(
        "apply"
      );

      setNotice({
        type:
          "working",

        message:
          "Writing PalWorldSettings.ini safely…"
      });

      try {
        const response =
          await fetch(
            "/api/v1/palworld/settings/apply",
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
                  changes,

                  expectedSourceSha256:
                    preview
                      .sourceSha256
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await readError(
              response
            )
          );
        }

        const result =
          await response
            .json() as
              ApplyResult;

        setDrafts(
          {}
        );

        setPreview(
          null
        );

        await load();

        setNotice({
          type:
            "success",

          message:
            result.applied
              ? result.restartRequired
                ? "Settings applied safely. Restart Palworld for the changes to take effect."
                : "Settings applied safely."
              : "No settings needed to be written."
        });
      } catch (
        caught
      ) {
        setNotice({
          type:
            "error",

          message:
            caught instanceof
              Error
              ? caught.message
              : "Settings apply failed."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const resetDrafts =
    (): void => {
      setDrafts(
        {}
      );

      setPreview(
        null
      );

      setNotice(
        null
      );
    };

  const filtered =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return (
          snapshot?.settings ??
          []
        ).filter(
          setting => {
            if (
              modifiedOnly &&
              !setting.modified
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            return (
              setting.key
                .toLowerCase()
                .includes(
                  query
                ) ||
              setting.type
                .toLowerCase()
                .includes(
                  query
                )
            );
          }
        );
      },
      [
        snapshot,
        search,
        modifiedOnly
      ]
    );

  const pendingCount =
    Object.keys(
      drafts
    ).length;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            PALWORLD CONFIGURATION
          </p>

          <h1>
            Settings
          </h1>

          <p className="subtitle">
            Safely inspect, preview and update PalWorldSettings.ini.
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
            void load();
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
        error
          ? (
              <section className="action-notice action-notice-error">
                <CircleAlert size={18} />

                <div>
                  <strong>
                    Settings unavailable
                  </strong>

                  <span>
                    {error}
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
                        <CheckCircle2 size={18} />
                      )
                    : (
                        <CircleAlert size={18} />
                      )
                }

                <div>
                  <strong>
                    {
                      notice.type ===
                        "success"
                        ? "Ready"
                        : notice.type ===
                            "error"
                          ? "Attention"
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

      <section className="settings-summary-grid">
        <article>
          <Settings2 size={18} />
          <span>Total settings</span>

          <strong>
            {
              snapshot?.summary
                .total ??
              "—"
            }
          </strong>
        </article>

        <article>
          <FileCheck2 size={18} />
          <span>Modified</span>

          <strong>
            {
              snapshot?.summary
                .modified ??
              "—"
            }
          </strong>
        </article>

        <article>
          <CircleAlert size={18} />
          <span>Invalid</span>

          <strong>
            {
              snapshot?.summary
                .invalid ??
              "—"
            }
          </strong>
        </article>

        <article>
          <KeyRound size={18} />
          <span>Sensitive</span>

          <strong>
            {
              snapshot?.summary
                .sensitive ??
              "—"
            }
          </strong>
        </article>

        <article>
          <ShieldCheck size={18} />
          <span>Pending edits</span>

          <strong>
            {pendingCount}
          </strong>
        </article>
      </section>

      {
        snapshot?.errors
          .map(
            message => (
              <section
                className="settings-file-warning"
                key={message}
              >
                <CircleAlert size={15} />

                {message}
              </section>
            )
          )
      }

      <section className="settings-toolbar">
        <label className="settings-search">
          <Search size={15} />

          <input
            onChange={
              event =>
                setSearch(
                  event.target.value
                )
            }
            placeholder="Search settings..."
            value={search}
          />
        </label>

        <label className="modified-filter">
          <Filter size={14} />

          <input
            checked={modifiedOnly}
            onChange={
              event =>
                setModifiedOnly(
                  event.target.checked
                )
            }
            type="checkbox"
          />

          Modified only
        </label>

        <div className="settings-toolbar-actions">
          <button
            className="control-button"
            disabled={
              pendingCount ===
                0 ||
              busy !==
                null
            }
            onClick={resetDrafts}
            type="button"
          >
            <RotateCcw size={14} />

            Reset edits
          </button>

          <button
            className="control-button"
            disabled={
              pendingCount ===
                0 ||
              busy !==
                null
            }
            onClick={() => {
              void runPreview();
            }}
            type="button"
          >
            <Eye size={14} />

            Preview changes
          </button>
        </div>
      </section>

      <section className="settings-layout">
        <article className="panel settings-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                INSTALLED SETTINGS
              </p>

              <h3>
                Editable configuration
              </h3>
            </div>

            <span className="panel-count">
              {filtered.length}
            </span>
          </div>

          <div className="settings-list">
            {
              filtered.map(
                setting => {
                  const editable =
                    setting
                      .knownByInstalledDefaults;

                  const draft =
                    drafts[
                      setting.key
                    ];

                  return (
                    <div
                      className={
                        setting.validation
                          .valid
                          ? "setting-row"
                          : "setting-row setting-row-invalid"
                      }
                      key={
                        setting.key
                      }
                    >
                      <div className="setting-info">
                        <div className="setting-name-line">
                          <strong>
                            {
                              setting.key
                            }
                          </strong>

                          {
                            setting.modified
                              ? (
                                  <span className="setting-tag modified">
                                    Modified
                                  </span>
                                )
                              : null
                          }

                          {
                            setting.sensitive
                              ? (
                                  <span className="setting-tag sensitive">
                                    Secret
                                  </span>
                                )
                              : null
                          }

                          {
                            !editable
                              ? (
                                  <span className="setting-tag readonly">
                                    Read only
                                  </span>
                                )
                              : null
                          }
                        </div>

                        <span className="setting-meta">
                          {setting.type}
                          {" · "}
                          {
                            setting.origin ===
                              "default"
                              ? "Installed default"
                              : "Live-only setting"
                          }
                        </span>

                        <span className="setting-default">
                          Default: {
                            publicValue(
                              setting.defaultValue,
                              setting.sensitive,
                              false
                            )
                          }
                        </span>

                        {
                          setting.validation
                            .errors
                            .map(
                              issue => (
                                <span
                                  className="setting-validation error"
                                  key={
                                    issue.code
                                  }
                                >
                                  {
                                    issue.message
                                  }
                                </span>
                              )
                            )
                        }

                        {
                          setting.validation
                            .warnings
                            .map(
                              issue => (
                                <span
                                  className="setting-validation warning"
                                  key={
                                    issue.code
                                  }
                                >
                                  {
                                    issue.message
                                  }
                                </span>
                              )
                            )
                        }
                      </div>

                      <div className="setting-control">
                        {
                          setting.type ===
                            "boolean" &&
                          !setting.sensitive
                            ? (
                                <select
                                  disabled={
                                    !editable ||
                                    busy !==
                                      null
                                  }
                                  onChange={
                                    event =>
                                      setDraft(
                                        setting,
                                        event.target
                                          .value ===
                                          "true"
                                      )
                                  }
                                  value={
                                    typeof draft ===
                                      "boolean"
                                      ? String(
                                          draft
                                        )
                                      : String(
                                          setting.currentValue ??
                                          false
                                        )
                                  }
                                >
                                  <option value="true">
                                    True
                                  </option>

                                  <option value="false">
                                    False
                                  </option>
                                </select>
                              )
                            : (
                                <input
                                  disabled={
                                    !editable ||
                                    busy !==
                                      null
                                  }
                                  onChange={
                                    event =>
                                      setDraft(
                                        setting,
                                        event.target
                                          .value
                                      )
                                  }
                                  placeholder={
                                    setting.sensitive &&
                                    setting.secretConfigured
                                      ? "Configured — enter a new value to replace"
                                      : setting.sensitive
                                        ? "Enter secret value"
                                        : undefined
                                  }
                                  type={
                                    setting.sensitive
                                      ? "password"
                                      : setting.type ===
                                            "integer" ||
                                          setting.type ===
                                            "number"
                                        ? "number"
                                        : "text"
                                  }
                                  value={
                                    typeof draft ===
                                      "string"
                                      ? draft
                                      : setting.sensitive
                                        ? ""
                                        : valueText(
                                            setting.currentValue
                                          )
                                  }
                                />
                              )
                        }

                        {
                          setting.sensitive
                            ? (
                                <span className="secret-state">
                                  <KeyRound size={12} />

                                  {
                                    setting.secretConfigured
                                      ? "Secret configured"
                                      : "No secret configured"
                                  }
                                </span>
                              )
                            : null
                        }
                      </div>
                    </div>
                  );
                }
              )
            }
          </div>
        </article>

        <aside className="settings-preview-panel">
          <div className="control-heading">
            <div className="control-icon">
              <ShieldCheck size={21} />
            </div>

            <div>
              <p className="eyebrow">
                SAFE WRITE
              </p>

              <h3>
                Change preview
              </h3>
            </div>
          </div>

          {
            !preview
              ? (
                  <div className="settings-preview-empty">
                    <Eye size={27} />

                    <strong>
                      Preview before applying
                    </strong>

                    <span>
                      Edit settings, then preview them. Nothing is written until
                      you explicitly apply a valid preview.
                    </span>
                  </div>
                )
              : (
                  <>
                    <div
                      className={
                        preview.valid
                          ? "preview-state preview-valid"
                          : "preview-state preview-invalid"
                      }
                    >
                      {
                        preview.valid
                          ? (
                              <CheckCircle2 size={18} />
                            )
                          : (
                              <CircleAlert size={18} />
                            )
                      }

                      <div>
                        <strong>
                          {
                            preview.valid
                              ? "Preview valid"
                              : "Preview invalid"
                          }
                        </strong>

                        <span>
                          {
                            preview.changes
                              .length
                          } proposed changes
                        </span>
                      </div>
                    </div>

                    {
                      preview.restartRequired
                        ? (
                            <div className="restart-required">
                              <RefreshCw size={14} />

                              Palworld restart required after apply.
                            </div>
                          )
                        : null
                    }

                    <div className="preview-change-list">
                      {
                        preview.changes.map(
                          change => (
                            <div
                              className="preview-change"
                              key={
                                change.key
                              }
                            >
                              <strong>
                                {
                                  change.key
                                }
                              </strong>

                              <span>
                                {
                                  change.sensitive
                                    ? change.afterSecretConfigured
                                      ? "Secret will be configured"
                                      : "Secret will be cleared"
                                    : `${String(
                                        change.beforeValue
                                      )} → ${String(
                                        change.afterValue
                                      )}`
                                }
                              </span>
                            </div>
                          )
                        )
                      }
                    </div>

                    {
                      preview.errors.map(
                        issue => (
                          <div
                            className="preview-issue error"
                            key={
                              `${issue.key}-${issue.code}`
                            }
                          >
                            <CircleAlert size={13} />

                            {issue.key
                              ? `${issue.key}: `
                              : ""}

                            {issue.message}
                          </div>
                        )
                      )
                    }

                    {
                      preview.warnings.map(
                        issue => (
                          <div
                            className="preview-issue warning"
                            key={
                              `${issue.key}-${issue.code}`
                            }
                          >
                            <CircleAlert size={13} />

                            {issue.key
                              ? `${issue.key}: `
                              : ""}

                            {issue.message}
                          </div>
                        )
                      )
                    }

                    <button
                      className="apply-settings-button"
                      disabled={
                        !preview.valid ||
                        !preview.changed ||
                        !preview.sourceSha256 ||
                        busy !==
                          null
                      }
                      onClick={() => {
                        void apply();
                      }}
                      type="button"
                    >
                      <Save size={15} />

                      Apply settings
                    </button>

                    {
                      preview.sourceSha256
                        ? (
                            <div className="settings-hash">
                              <span>
                                Source SHA-256
                              </span>

                              <code>
                                {
                                  preview.sourceSha256
                                }
                              </code>
                            </div>
                          )
                        : null
                    }
                  </>
                )
          }
        </aside>
      </section>
    </>
  );
}