import {
  Activity,
  Boxes,
  CalendarDays,
  CircleAlert,
  Cpu,
  DatabaseBackup,
  Gamepad2,
  Map,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Timer,
  Users,
  Webhook,
  Wifi,
  WifiOff
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
  type ComponentType
} from "react";

import {
  ServerPage
} from "./ServerPage";

import {
  PlayersPage
} from "./PlayersPage";

import {
  SavesPage
} from "./SavesPage";

import {
  SettingsPage
} from "./SettingsPage";

type Health =
  | "offline"
  | "transitioning"
  | "online"
  | "degraded"
  | "crashed";

type RuntimeStatus =
  | "unknown"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

interface RuntimeSnapshot {
  status: RuntimeStatus;

  pid: number | null;

  startedAt: string | null;
  stoppedAt: string | null;

  exitCode: number | null;
  exitSignal: string | null;

  lastError: string | null;
  lastTransitionAt: string;
}

interface ServerInfo {
  version: string;
  servername: string;
  description: string;
  worldguid: string;
}

interface Player {
  name: string;
  accountName: string;

  playerId: string;
  userId: string;

  ip: string;
  ping: number;

  location_x: number;
  location_y: number;

  level: number;
  building_count: number;
}

interface LiveError {
  source: string;
  code: string;
  message: string;
}

interface LiveSnapshot {
  observedAt: string;

  health: Health;

  runtime: RuntimeSnapshot;

  rest: {
    available?: boolean;
  } | null;

  info: ServerInfo | null;

  players: Player[];

  metrics: Record<
    string,
    unknown
  > | null;

  summary: {
    playerCount: number;
    maxPlayers: number | null;

    serverFps: number | null;
    serverFrameTimeMs: number | null;

    uptimeSeconds: number | null;
    worldDays: number | null;
    baseCampCount: number | null;
  };

  errors: LiveError[];
}

type Page =
  | "Overview"
  | "Server"
  | "Players"
  | "Calendar"
  | "Webhooks"
  | "Backups & Saves"
  | "Settings";

interface NavigationItem {
  label: Page;

  icon:
    ComponentType<{
      size?: number;
    }>;
}

const navigation:
  NavigationItem[] = [
    {
      label:
        "Overview",

      icon:
        Activity
    },

    {
      label:
        "Server",

      icon:
        Gamepad2
    },

    {
      label:
        "Players",

      icon:
        Users
    },

    {
      label:
        "Calendar",

      icon:
        CalendarDays
    },

    {
      label:
        "Webhooks",

      icon:
        Webhook
    },

    {
      label:
        "Backups & Saves",

      icon:
        DatabaseBackup
    },

    {
      label:
        "Settings",

      icon:
        Settings
    }
  ];

const healthLabels:
  Record<
    Health,
    string
  > = {
    offline:
      "Offline",

    transitioning:
      "Transitioning",

    online:
      "Online",

    degraded:
      "Degraded",

    crashed:
      "Crashed"
  };

function formatUptime(
  seconds:
    number | null
): string {
  if (
    seconds ===
    null
  ) {
    return "—";
  }

  const days =
    Math.floor(
      seconds /
      86400
    );

  const hours =
    Math.floor(
      (
        seconds %
        86400
      ) /
      3600
    );

  const minutes =
    Math.floor(
      (
        seconds %
        3600
      ) /
      60
    );

  if (
    days >
    0
  ) {
    return `${days}d ${hours}h`;
  }

  if (
    hours >
    0
  ) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDate(
  value:
    string | null
): string {
  if (!value) {
    return "Never";
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

export default function App() {
  const [
    page,
    setPage
  ] =
    useState<Page>(
      "Overview"
    );

  const [
    live,
    setLive
  ] =
    useState<
      LiveSnapshot |
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
    apiError,
    setApiError
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const loadLive =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await fetch(
              "/api/v1/palworld/live",
              {
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
              `Manager API returned HTTP ${response.status}.`
            );
          }

          const payload =
            await response
              .json() as
                LiveSnapshot;

          setLive(
            payload
          );

          setApiError(
            null
          );
        } catch (
          error
        ) {
          setApiError(
            error instanceof
              Error
              ? error.message
              : "Manager API is unavailable."
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
      void loadLive();

      const timer =
        window.setInterval(
          () => {
            void loadLive();
          },
          5000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    [
      loadLive
    ]
  );

  const health:
    Health =
      live?.health ??
      "offline";

  const serverName =
    live?.info
      ?.servername ??
    "Palworld Server";

  const renderOverview =
    () => (
      <>
        <header className="page-header">
          <div>
            <p className="eyebrow">
              LIVE SERVER OVERVIEW
            </p>

            <h1>
              {serverName}
            </h1>

            <p className="subtitle">
              Monitor your Palworld world and Manager runtime from one place.
            </p>
          </div>

          <div className="header-actions">
            <button
              className="refresh-button"
              disabled={loading}
              onClick={() => {
                void loadLive();
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

            <div
              className={
                `status status-${health}`
              }
            >
              <span className="status-dot" />

              {
                apiError
                  ? "Manager unavailable"
                  : healthLabels[
                      health
                    ]
              }
            </div>
          </div>
        </header>

        {apiError
          ? (
              <section className="alert-card alert-error">
                <CircleAlert
                  size={20}
                />

                <div>
                  <strong>
                    Manager API unavailable
                  </strong>

                  <p>
                    {apiError}
                  </p>
                </div>
              </section>
            )
          : null}

        {
          live &&
          live.errors.length >
            0
            ? (
                <section className="alert-card alert-warning">
                  <CircleAlert
                    size={20}
                  />

                  <div>
                    <strong>
                      Server data is partially degraded
                    </strong>

                    {live.errors.map(
                      error => (
                        <p
                          key={
                            `${error.source}-${error.code}`
                          }
                        >
                          {error.source}: {error.message}
                        </p>
                      )
                    )}
                  </div>
                </section>
              )
            : null
        }

        <section className="server-hero">
          <div className="server-hero-copy">
            <p className="eyebrow">
              KING'S PALWORLD MANAGER
            </p>

            <h2>
              {
                health ===
                  "online"
                  ? "Your world is online."
                  : health ===
                      "transitioning"
                    ? "Server is changing state."
                    : health ===
                        "degraded"
                      ? "Server needs attention."
                      : health ===
                          "crashed"
                        ? "Server process crashed."
                        : "Your world is offline."
              }
            </h2>

            <p>
              {
                live?.info
                  ?.description ||
                "Real-time Palworld status, players, performance and save management."
              }
            </p>

            <div className="hero-meta">
              <span>
                <Server size={15} />

                {
                  live?.info
                    ?.version
                    ? `Palworld ${live.info.version}`
                    : "Version unavailable"
                }
              </span>

              <span>
                {
                  live?.rest
                    ?.available
                    ? (
                        <Wifi
                          size={15}
                        />
                      )
                    : (
                        <WifiOff
                          size={15}
                        />
                      )
                }

                {
                  live?.rest
                    ?.available
                    ? "REST connected"
                    : "REST offline"
                }
              </span>

              <span>
                <ShieldCheck
                  size={15}
                />

                Manager API
              </span>
            </div>
          </div>

          <div className="hero-state">
            <div
              className={
                `hero-orb hero-orb-${health}`
              }
            />

            <strong>
              {
                healthLabels[
                  health
                ]
              }
            </strong>

            <span>
              {
                live
                  ? `Observed ${new Date(
                      live.observedAt
                    ).toLocaleTimeString()}`
                  : "Waiting for live state"
              }
            </span>
          </div>
        </section>

        <section className="stats">
          <article>
            <div className="stat-icon">
              <Users size={18} />
            </div>

            <span>
              Players
            </span>

            <strong>
              {
                live
                  ? `${live.summary.playerCount} / ${live.summary.maxPlayers ?? "—"}`
                  : "— / —"
              }
            </strong>

            <small>
              Connected now
            </small>
          </article>

          <article>
            <div className="stat-icon">
              <Cpu size={18} />
            </div>

            <span>
              Server FPS
            </span>

            <strong>
              {
                live?.summary
                  .serverFps ??
                "—"
              }
            </strong>

            <small>
              {
                live?.summary
                  .serverFrameTimeMs !==
                  null &&
                live?.summary
                  .serverFrameTimeMs !==
                  undefined
                  ? `${live.summary.serverFrameTimeMs.toFixed(2)} ms frame`
                  : "No metrics"
              }
            </small>
          </article>

          <article>
            <div className="stat-icon">
              <Timer size={18} />
            </div>

            <span>
              Uptime
            </span>

            <strong>
              {
                formatUptime(
                  live?.summary
                    .uptimeSeconds ??
                  null
                )
              }
            </strong>

            <small>
              Current server session
            </small>
          </article>

          <article>
            <div className="stat-icon">
              <Map size={18} />
            </div>

            <span>
              World Day
            </span>

            <strong>
              {
                live?.summary
                  .worldDays ??
                "—"
              }
            </strong>

            <small>
              Palworld world time
            </small>
          </article>

          <article>
            <div className="stat-icon">
              <Boxes size={18} />
            </div>

            <span>
              Base Camps
            </span>

            <strong>
              {
                live?.summary
                  .baseCampCount ??
                "—"
              }
            </strong>

            <small>
              Active world bases
            </small>
          </article>

          <article>
            <div className="stat-icon">
              <Activity size={18} />
            </div>

            <span>
              Process
            </span>

            <strong>
              {
                live?.runtime
                  .status ??
                "Unknown"
              }
            </strong>

            <small>
              {
                live?.runtime
                  .pid
                  ? `PID ${live.runtime.pid}`
                  : "No active PID"
              }
            </small>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  SERVER
                </p>

                <h3>
                  Runtime details
                </h3>
              </div>

              <Server
                size={20}
              />
            </div>

            <dl className="detail-list">
              <div>
                <dt>
                  State
                </dt>

                <dd>
                  {
                    live?.runtime
                      .status ??
                    "Unknown"
                  }
                </dd>
              </div>

              <div>
                <dt>
                  PID
                </dt>

                <dd>
                  {
                    live?.runtime
                      .pid ??
                    "—"
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Started
                </dt>

                <dd>
                  {
                    formatDate(
                      live?.runtime
                        .startedAt ??
                      null
                    )
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Last transition
                </dt>

                <dd>
                  {
                    formatDate(
                      live?.runtime
                        .lastTransitionAt ??
                      null
                    )
                  }
                </dd>
              </div>
            </dl>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  WORLD
                </p>

                <h3>
                  Server identity
                </h3>
              </div>

              <Map
                size={20}
              />
            </div>

            <dl className="detail-list">
              <div>
                <dt>
                  Server name
                </dt>

                <dd>
                  {
                    live?.info
                      ?.servername ??
                    "Unavailable"
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Palworld version
                </dt>

                <dd>
                  {
                    live?.info
                      ?.version ??
                    "Unavailable"
                  }
                </dd>
              </div>

              <div>
                <dt>
                  World GUID
                </dt>

                <dd className="mono">
                  {
                    live?.info
                      ?.worldguid ??
                    "Unavailable"
                  }
                </dd>
              </div>

              <div>
                <dt>
                  REST
                </dt>

                <dd>
                  {
                    live?.rest
                      ?.available
                      ? "Connected"
                      : "Unavailable"
                  }
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="panel players-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                PLAYERS
              </p>

              <h3>
                Connected players
              </h3>
            </div>

            <span className="panel-count">
              {
                live?.players
                  .length ??
                0
              }
            </span>
          </div>

          {
            live &&
            live.players.length >
              0
              ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            Player
                          </th>

                          <th>
                            Account
                          </th>

                          <th>
                            Level
                          </th>

                          <th>
                            Ping
                          </th>

                          <th>
                            Buildings
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {live.players.map(
                          player => (
                            <tr
                              key={
                                player.userId
                              }
                            >
                              <td>
                                <strong>
                                  {
                                    player.name
                                  }
                                </strong>
                              </td>

                              <td>
                                {
                                  player.accountName
                                }
                              </td>

                              <td>
                                {
                                  player.level
                                }
                              </td>

                              <td>
                                {
                                  Math.round(
                                    player.ping
                                  )
                                } ms
                              </td>

                              <td>
                                {
                                  player.building_count
                                }
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              : (
                  <div className="empty-state">
                    <Users
                      size={28}
                    />

                    <strong>
                      No players connected
                    </strong>

                    <span>
                      Players will appear here as soon as Palworld reports them.
                    </span>
                  </div>
                )
          }
        </section>
      </>
    );

  const renderPlaceholder =
    () => (
      <>
        <header className="page-header">
          <div>
            <p className="eyebrow">
              KING'S PALWORLD MANAGER
            </p>

            <h1>
              {page}
            </h1>

            <p className="subtitle">
              This page is next in the interactive WebGUI integration pass.
            </p>
          </div>

          <div
            className={
              `status status-${health}`
            }
          >
            <span className="status-dot" />

            {
              apiError
                ? "Manager unavailable"
                : healthLabels[
                    health
                  ]
            }
          </div>
        </header>

        <section className="placeholder-panel">
          <div className="placeholder-icon">
            <Activity
              size={30}
            />
          </div>

          <p className="eyebrow">
            FOUNDATION READY
          </p>

          <h2>
            {page} is being wired to the Manager API.
          </h2>

          <p>
            Overview is live now. Server controls, player administration,
            save management, calendar, webhooks and settings will be connected
            in the following GUI slices.
          </p>

          <button
            className="primary-button"
            onClick={() =>
              setPage(
                "Overview"
              )
            }
            type="button"
          >
            Return to Overview
          </button>
        </section>
      </>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            K
          </div>

          <div>
            <strong>
              King's
            </strong>

            <span>
              Palworld Manager
            </span>
          </div>
        </div>

        <div className="sidebar-label">
          MANAGEMENT
        </div>

        <nav>
          {navigation.map(
            item => {
              const Icon =
                item.icon;

              return (
                <button
                  className={
                    page ===
                      item.label
                      ? "nav-item active"
                      : "nav-item"
                  }
                  key={
                    item.label
                  }
                  onClick={() =>
                    setPage(
                      item.label
                    )
                  }
                  type="button"
                >
                  <Icon
                    size={18}
                  />

                  <span>
                    {item.label}
                  </span>
                </button>
              );
            }
          )}
        </nav>

        <div className="sidebar-footer">
          <span
            className={
              `mini-status mini-status-${health}`
            }
          />

          <div>
            <strong>
              Manager
            </strong>

            <span>
              {
                apiError
                  ? "Disconnected"
                  : "Connected"
              }
            </span>
          </div>
        </div>
      </aside>

      <main className="content">
        {
          page ===
            "Overview"
            ? renderOverview()
            : page ===
                "Server"
              ? (
                  <ServerPage
                    apiError={apiError}
                    live={live}
                    loading={loading}
                    onRefresh={loadLive}
                  />
                )
              : page ===
                  "Players"
                ? (
                    <PlayersPage
                      apiError={apiError}
                      live={live}
                      loading={loading}
                      onRefresh={loadLive}
                    />
                  )
                : page ===
                    "Backups & Saves"
                  ? (
                      <SavesPage
                        managerApiError={
                          apiError
                        }
                        runtimeStatus={
                          live?.runtime
                            .status ??
                          "unknown"
                        }
                      />
                    )
                  : page ===
                      "Settings"
                    ? (
                        <SettingsPage />
                      )
                    : renderPlaceholder()
        }
      </main>
    </div>
  );
}