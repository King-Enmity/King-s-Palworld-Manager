import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Filter,
  RefreshCw,
  Search,
  Server
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

type LogSource =
  | "manager"
  | "palworld";

type LogSeverity =
  | "debug"
  | "info"
  | "warning"
  | "error";

interface LogEntry {
  id:
    string;

  occurredAt:
    string;

  source:
    LogSource;

  severity:
    LogSeverity;

  category:
    string;

  action:
    string;

  message:
    string;

  entityType:
    string |
    null;

  entityId:
    string |
    null;

  metadata:
    Record<
      string,
      unknown
    > |
    null;

  stream:
    "stdout" |
    "stderr" |
    null;

  truncated:
    boolean;
}

interface LogListResult {
  items:
    LogEntry[];

  total:
    number;

  limit:
    number;

  offset:
    number;
}

interface LogSummary {
  hours:
    number;

  since:
    string;

  counts: {
    total:
      number;

    debug:
      number;

    info:
      number;

    warning:
      number;

    error:
      number;
  };

  bySource: {
    manager:
      number;

    palworld:
      number;
  };

  categories:
    string[];

  recentSignificant:
    LogEntry[];
}

export interface LogsPageProps {
  initialSeverity?:
    "all" |
    LogSeverity;

  initialSource?:
    "all" |
    LogSource;
}

const PAGE_SIZE =
  50;

const rangeOptions = [
  {
    value:
      "1",

    label:
      "Last hour"
  },
  {
    value:
      "6",

    label:
      "Last 6 hours"
  },
  {
    value:
      "24",

    label:
      "Last 24 hours"
  },
  {
    value:
      "72",

    label:
      "Last 3 days"
  },
  {
    value:
      "168",

    label:
      "Last 7 days"
  },
  {
    value:
      "336",

    label:
      "Last 14 days"
  },
  {
    value:
      "720",

    label:
      "Last 30 days"
  }
];

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
    const payload =
      JSON.parse(
        text
      ) as {
        message?:
          unknown;
      };

    if (
      typeof payload.message ===
      "string"
    ) {
      return payload.message;
    }
  } catch {
    return text;
  }

  return text;
}

function formatDateTime(
  value:
    string
): string {
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

function sourceLabel(
  source:
    LogSource
): string {
  return source ===
    "palworld"
    ? "Palworld"
    : "Manager";
}

export function LogsPage({
  initialSeverity =
    "all",

  initialSource =
    "all"
}: LogsPageProps) {
  const [
    result,
    setResult
  ] =
    useState<
      LogListResult |
      null
    >(
      null
    );

  const [
    summary,
    setSummary
  ] =
    useState<
      LogSummary |
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
    searchInput,
    setSearchInput
  ] =
    useState(
      ""
    );

  const [
    search,
    setSearch
  ] =
    useState(
      ""
    );

  const [
    source,
    setSource
  ] =
    useState<
      "all" |
      LogSource
    >(
      initialSource
    );

  const [
    severity,
    setSeverity
  ] =
    useState<
      "all" |
      LogSeverity
    >(
      initialSeverity
    );

  const [
    category,
    setCategory
  ] =
    useState(
      "all"
    );

  const [
    hours,
    setHours
  ] =
    useState(
      "24"
    );

  const [
    page,
    setPage
  ] =
    useState(
      0
    );

  const [
    autoRefresh,
    setAutoRefresh
  ] =
    useState(
      true
    );

  const load =
    useCallback(
      async (
        showLoading =
          true
      ): Promise<void> => {
        if (showLoading) {
          setLoading(
            true
          );
        }

        try {
          const from =
            new Date(
              Date.now() -
              Number(
                hours
              ) *
              60 *
              60 *
              1000
            ).toISOString();

          const parameters =
            new URLSearchParams({
              source,

              from,

              limit:
                String(
                  PAGE_SIZE
                ),

              offset:
                String(
                  page *
                  PAGE_SIZE
                )
            });

          if (
            severity !==
            "all"
          ) {
            parameters.set(
              "severity",
              severity
            );
          }

          if (
            category !==
            "all"
          ) {
            parameters.set(
              "category",
              category
            );
          }

          if (
            search.trim()
          ) {
            parameters.set(
              "q",
              search.trim()
            );
          }

          const [
            logsResponse,
            summaryResponse
          ] =
            await Promise.all([
              fetch(
                `/api/v1/logs?${parameters.toString()}`,
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              ),

              fetch(
                `/api/v1/logs/summary?hours=${hours}`,
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              )
            ]);

          if (
            !logsResponse.ok
          ) {
            throw new Error(
              await readError(
                logsResponse
              )
            );
          }

          if (
            !summaryResponse.ok
          ) {
            throw new Error(
              await readError(
                summaryResponse
              )
            );
          }

          const logsPayload =
            await logsResponse
              .json() as
                LogListResult;

          const summaryPayload =
            await summaryResponse
              .json() as
                LogSummary;

          setResult(
            logsPayload
          );

          setSummary(
            summaryPayload
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
              : "Logs could not be loaded."
          );
        } finally {
          if (showLoading) {
            setLoading(
              false
            );
          }
        }
      },
      [
        category,
        hours,
        page,
        search,
        severity,
        source
      ]
    );

  useEffect(
    () => {
      void load();
    },
    [
      load
    ]
  );

  useEffect(
    () => {
      if (
        !autoRefresh
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            void load(
              false
            );
          },
          10_000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    [
      autoRefresh,
      load
    ]
  );

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        (
          result?.total ??
          0
        ) /
        PAGE_SIZE
      )
    );

  const categories =
    useMemo(
      () =>
        summary
          ?.categories ??
        [],
      [
        summary
      ]
    );

  const clearFilters =
    (): void => {
      setSearchInput(
        ""
      );

      setSearch(
        ""
      );

      setSource(
        "all"
      );

      setSeverity(
        "all"
      );

      setCategory(
        "all"
      );

      setHours(
        "24"
      );

      setPage(
        0
      );
    };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            OBSERVABILITY
          </p>

          <h1>
            Logs
          </h1>

          <p className="subtitle">
            Search Manager activity and Palworld console output from one timeline.
          </p>
        </div>

        <div className="header-actions">
          <label className="logs-auto-refresh">
            <input
              checked={
                autoRefresh
              }
              onChange={
                event =>
                  setAutoRefresh(
                    event.target
                      .checked
                  )
              }
              type="checkbox"
            />

            Auto-refresh
          </label>

          <button
            className="refresh-button"
            disabled={
              loading
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
        </div>
      </header>

      {
        error
          ? (
              <section className="action-notice action-notice-error">
                <CircleAlert
                  size={18}
                />

                <div>
                  <strong>
                    Logs unavailable
                  </strong>

                  <span>
                    {error}
                  </span>
                </div>
              </section>
            )
          : null
      }

      <section className="logs-summary-grid">
        <article>
          <span>
            Warnings
          </span>

          <strong>
            {
              summary?.counts
                .warning ??
              0
            }
          </strong>

          <small>
            Selected time range
          </small>
        </article>

        <article>
          <span>
            Errors
          </span>

          <strong>
            {
              summary?.counts
                .error ??
              0
            }
          </strong>

          <small>
            Selected time range
          </small>
        </article>

        <article>
          <span>
            Manager
          </span>

          <strong>
            {
              summary?.bySource
                .manager ??
              0
            }
          </strong>

          <small>
            Structured events
          </small>
        </article>

        <article>
          <span>
            Palworld
          </span>

          <strong>
            {
              summary?.bySource
                .palworld ??
              0
            }
          </strong>

          <small>
            Console lines
          </small>
        </article>
      </section>

      <section className="panel logs-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              FILTERS
            </p>

            <h3>
              Find events
            </h3>
          </div>

          <Filter
            size={18}
          />
        </div>

        <div className="logs-filter-grid">
          <form
            className="logs-search-form"
            onSubmit={
              event => {
                event
                  .preventDefault();

                setPage(
                  0
                );

                setSearch(
                  searchInput
                    .trim()
                );
              }
            }
          >
            <Search
              size={15}
            />

            <input
              maxLength={200}
              onChange={
                event =>
                  setSearchInput(
                    event.target
                      .value
                  )
              }
              placeholder="Search messages, categories, actions..."
              type="search"
              value={
                searchInput
              }
            />

            <button
              type="submit"
            >
              Search
            </button>
          </form>

          <label>
            <span>
              Source
            </span>

            <select
              onChange={
                event => {
                  setPage(
                    0
                  );

                  setSource(
                    event.target
                      .value as
                      "all" |
                      LogSource
                  );
                }
              }
              value={
                source
              }
            >
              <option value="all">
                All sources
              </option>

              <option value="manager">
                Manager
              </option>

              <option value="palworld">
                Palworld
              </option>
            </select>
          </label>

          <label>
            <span>
              Severity
            </span>

            <select
              onChange={
                event => {
                  setPage(
                    0
                  );

                  setSeverity(
                    event.target
                      .value as
                      "all" |
                      LogSeverity
                  );
                }
              }
              value={
                severity
              }
            >
              <option value="all">
                All severities
              </option>

              <option value="debug">
                Debug
              </option>

              <option value="info">
                Info
              </option>

              <option value="warning">
                Warning
              </option>

              <option value="error">
                Error
              </option>
            </select>
          </label>

          <label>
            <span>
              Category
            </span>

            <select
              onChange={
                event => {
                  setPage(
                    0
                  );

                  setCategory(
                    event.target
                      .value
                  );
                }
              }
              value={
                category
              }
            >
              <option value="all">
                All categories
              </option>

              {
                categories.map(
                  item => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {item}
                    </option>
                  )
                )
              }
            </select>
          </label>

          <label>
            <span>
              Time range
            </span>

            <select
              onChange={
                event => {
                  setPage(
                    0
                  );

                  setHours(
                    event.target
                      .value
                  );
                }
              }
              value={
                hours
              }
            >
              {
                rangeOptions.map(
                  option => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  )
                )
              }
            </select>
          </label>

          <button
            className="logs-clear-button"
            onClick={
              clearFilters
            }
            type="button"
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="panel logs-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              EVENT TIMELINE
            </p>

            <h3>
              {
                result
                  ? `${result.total.toLocaleString()} matching events`
                  : "Loading events"
              }
            </h3>
          </div>

          <Activity
            size={19}
          />
        </div>

        {
          result &&
          result.items.length >
            0
            ? (
                <div className="logs-list">
                  {
                    result.items.map(
                      entry => (
                        <article
                          className={
                            `log-entry log-entry-${entry.severity}`
                          }
                          key={
                            entry.id
                          }
                        >
                          <div className="log-entry-marker" />

                          <div className="log-entry-content">
                            <div className="log-entry-heading">
                              <div className="log-entry-chips">
                                <span
                                  className={
                                    `log-severity log-severity-${entry.severity}`
                                  }
                                >
                                  {
                                    entry.severity
                                  }
                                </span>

                                <span className="log-source">
                                  {
                                    entry.source ===
                                      "palworld"
                                      ? (
                                          <Server
                                            size={11}
                                          />
                                        )
                                      : (
                                          <Activity
                                            size={11}
                                          />
                                        )
                                  }

                                  {
                                    sourceLabel(
                                      entry.source
                                    )
                                  }
                                </span>

                                <span className="log-category">
                                  {
                                    entry.category
                                  }
                                </span>

                                {
                                  entry.stream
                                    ? (
                                        <span className="log-stream">
                                          {
                                            entry.stream
                                          }
                                        </span>
                                      )
                                    : null
                                }

                                {
                                  entry.truncated
                                    ? (
                                        <span className="log-truncated">
                                          truncated
                                        </span>
                                      )
                                    : null
                                }
                              </div>

                              <time>
                                {
                                  formatDateTime(
                                    entry.occurredAt
                                  )
                                }
                              </time>
                            </div>

                            <strong className="log-action">
                              {
                                entry.action
                              }
                            </strong>

                            <p className="log-message">
                              {
                                entry.message
                              }
                            </p>

                            {
                              entry.entityType ||
                              entry.entityId
                                ? (
                                    <div className="log-entity">
                                      Entity:
                                      {" "}
                                      {
                                        entry.entityType ??
                                        "unknown"
                                      }
                                      {
                                        entry.entityId
                                          ? ` · ${entry.entityId}`
                                          : ""
                                      }
                                    </div>
                                  )
                                : null
                            }

                            {
                              entry.metadata &&
                              Object.keys(
                                entry.metadata
                              ).length >
                                0
                                ? (
                                    <details className="log-metadata">
                                      <summary>
                                        Metadata
                                      </summary>

                                      <pre>
                                        {
                                          JSON.stringify(
                                            entry.metadata,
                                            null,
                                            2
                                          )
                                        }
                                      </pre>
                                    </details>
                                  )
                                : null
                            }
                          </div>
                        </article>
                      )
                    )
                  }
                </div>
              )
            : (
                <div className="empty-state logs-empty-state">
                  <Search
                    size={28}
                  />

                  <strong>
                    No matching log entries
                  </strong>

                  <span>
                    Adjust the filters or wait for new server activity.
                  </span>
                </div>
              )
        }

        <div className="logs-pagination">
          <button
            disabled={
              page <=
                0 ||
              loading
            }
            onClick={() => {
              setPage(
                current =>
                  Math.max(
                    0,
                    current -
                    1
                  )
              );
            }}
            type="button"
          >
            <ChevronLeft
              size={14}
            />

            Previous
          </button>

          <span>
            Page
            {" "}
            {
              page +
              1
            }
            {" "}
            of
            {" "}
            {
              pageCount
            }
          </span>

          <button
            disabled={
              page +
                1 >=
                pageCount ||
              loading
            }
            onClick={() => {
              setPage(
                current =>
                  current +
                  1
              );
            }}
            type="button"
          >
            Next

            <ChevronRight
              size={14}
            />
          </button>
        </div>
      </section>
    </>
  );
}