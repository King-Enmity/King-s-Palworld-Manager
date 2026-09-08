import {
  CheckCircle2,
  CircleAlert,
  Megaphone,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  Square,
  Wifi,
  WifiOff
} from "lucide-react";

import {
  useState
} from "react";

type RuntimeStatus =
  | "unknown"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

interface ServerPageProps {
  live: {
    runtime: {
      status: RuntimeStatus;
      pid: number | null;
      startedAt: string | null;
      stoppedAt: string | null;
      exitCode: number | null;
      exitSignal: string | null;
      lastError: string | null;
      lastTransitionAt: string;
    };

    rest: {
      available?: boolean;
    } | null;

    info: {
      version: string;
      servername: string;
      description: string;
      worldguid: string;
    } | null;
  } | null;

  apiError: string | null;
  loading: boolean;

  onRefresh:
    () => Promise<void>;
}

interface Notice {
  type:
    "success" |
    "error" |
    "working";

  message:
    string;
}

function formatDate(
  value:
    string | null
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

  return date.toLocaleString();
}

async function responseMessage(
  response:
    Response
): Promise<string> {
  const text =
    await response.text();

  if (!text) {
    return "";
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

export function ServerPage({
  live,
  apiError,
  loading,
  onRefresh
}: ServerPageProps) {
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
    announcement,
    setAnnouncement
  ] =
    useState(
      ""
    );

  const runtime =
    live?.runtime
      .status ??
    "unknown";

  const restAvailable =
    live?.rest
      ?.available ===
    true;

  const action =
    async (
      label:
        string,

      endpoint:
        string,

      body?:
        unknown
    ): Promise<boolean> => {
      setBusy(
        label
      );

      setNotice({
        type:
          "working",

        message:
          `${label} in progress…`
      });

      try {
        const options:
          RequestInit = {
            method:
              "POST",

            headers: {
              Accept:
                "application/json"
            }
          };

        if (
          body !==
          undefined
        ) {
          options.headers = {
            ...options.headers,

            "Content-Type":
              "application/json"
          };

          options.body =
            JSON.stringify(
              body
            );
        }

        const response =
          await fetch(
            endpoint,
            options
          );

        const message =
          await responseMessage(
            response
          );

        if (!response.ok) {
          throw new Error(
            message ||
            `${label} failed with HTTP ${response.status}.`
          );
        }

        setNotice({
          type:
            "success",

          message:
            `${label} completed successfully.`
        });

        await onRefresh();

        return true;
      } catch (
        error
      ) {
        setNotice({
          type:
            "error",

          message:
            error instanceof Error
              ? error.message
              : `${label} failed.`
        });

        return false;
      } finally {
        setBusy(
          null
        );
      }
    };

  const canStart =
    runtime ===
      "stopped" ||
    runtime ===
      "crashed" ||
    runtime ===
      "unknown";

  const canStop =
    runtime ===
      "running" ||
    runtime ===
      "starting";

  const canRestart =
    runtime ===
    "running";

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            SERVER CONTROL
          </p>

          <h1>
            {
              live?.info
                ?.servername ??
              "Palworld Server"
            }
          </h1>

          <p className="subtitle">
            Control the Palworld process and issue live server commands.
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
            void onRefresh();
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
        apiError
          ? (
              <section className="action-notice action-notice-error">
                <CircleAlert size={18} />

                <div>
                  <strong>
                    Manager API unavailable
                  </strong>

                  <span>
                    {apiError}
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

      <section className="server-control-hero">
        <div>
          <p className="eyebrow">
            MANAGED PROCESS
          </p>

          <h2>
            {
              runtime ===
                "running"
                ? "Palworld is running."
                : runtime ===
                    "starting"
                  ? "Palworld is starting."
                  : runtime ===
                      "stopping"
                    ? "Palworld is stopping."
                    : runtime ===
                        "crashed"
                      ? "Palworld has crashed."
                      : "Palworld is offline."
            }
          </h2>

          <p>
            The browser talks only to King's Palworld Manager.
            Palworld REST remains behind the Manager.
          </p>
        </div>

        <div
          className={
            `runtime-badge runtime-badge-${runtime}`
          }
        >
          <span />

          {runtime}
        </div>
      </section>

      <section className="server-control-grid">
        <article className="control-card">
          <div className="control-heading">
            <div className="control-icon">
              <ServerCog size={21} />
            </div>

            <div>
              <p className="eyebrow">
                LIFECYCLE
              </p>

              <h3>
                Process controls
              </h3>
            </div>
          </div>

          <p className="control-copy">
            Stop and restart use the Manager's graceful shutdown workflow.
          </p>

          <div className="control-actions">
            <button
              className="control-button start-button"
              disabled={
                !canStart ||
                busy !==
                  null
              }
              onClick={() => {
                void action(
                  "Start server",
                  "/api/v1/palworld/start"
                );
              }}
              type="button"
            >
              <Play size={15} />
              Start
            </button>

            <button
              className="control-button stop-button"
              disabled={
                !canStop ||
                busy !==
                  null
              }
              onClick={() => {
                void action(
                  "Stop server",
                  "/api/v1/palworld/stop"
                );
              }}
              type="button"
            >
              <Square size={14} />
              Stop
            </button>

            <button
              className="control-button"
              disabled={
                !canRestart ||
                busy !==
                  null
              }
              onClick={() => {
                void action(
                  "Restart server",
                  "/api/v1/palworld/restart"
                );
              }}
              type="button"
            >
              <RotateCcw size={15} />
              Restart
            </button>
          </div>

          <dl className="control-details">
            <div>
              <dt>State</dt>
              <dd>{runtime}</dd>
            </div>

            <div>
              <dt>PID</dt>

              <dd>
                {
                  live?.runtime
                    .pid ??
                  "—"
                }
              </dd>
            </div>

            <div>
              <dt>Started</dt>

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

        <article className="control-card">
          <div className="control-heading">
            <div className="control-icon">
              {
                restAvailable
                  ? <Wifi size={21} />
                  : <WifiOff size={21} />
              }
            </div>

            <div>
              <p className="eyebrow">
                LIVE REST
              </p>

              <h3>
                World actions
              </h3>
            </div>
          </div>

          <p className="control-copy">
            Save the active world without stopping the server.
          </p>

          <button
            className="control-button wide-button"
            disabled={
              !restAvailable ||
              busy !==
                null
            }
            onClick={() => {
              void action(
                "Save world",
                "/api/v1/palworld/save"
              );
            }}
            type="button"
          >
            <Save size={15} />

            Save world now
          </button>

          <div className="rest-status-card">
            {
              restAvailable
                ? <Wifi size={17} />
                : <WifiOff size={17} />
            }

            <div>
              <strong>
                {
                  restAvailable
                    ? "REST connected"
                    : "REST unavailable"
                }
              </strong>

              <span>
                {
                  restAvailable
                    ? "Live Palworld commands are available."
                    : "Start the server and enable Palworld REST."
                }
              </span>
            </div>
          </div>
        </article>

        <article className="control-card announcement-card">
          <div className="control-heading">
            <div className="control-icon">
              <Megaphone size={21} />
            </div>

            <div>
              <p className="eyebrow">
                ANNOUNCEMENT
              </p>

              <h3>
                Message connected players
              </h3>
            </div>
          </div>

          <textarea
            className="announcement-box"
            disabled={
              !restAvailable ||
              busy !==
                null
            }
            maxLength={512}
            onChange={
              event =>
                setAnnouncement(
                  event.target.value
                )
            }
            placeholder="Server restart in 10 minutes..."
            rows={5}
            value={announcement}
          />

          <div className="announcement-footer">
            <span>
              {announcement.length} / 512
            </span>

            <button
              className="control-button send-button"
              disabled={
                !restAvailable ||
                !announcement.trim() ||
                busy !==
                  null
              }
              onClick={() => {
                const message =
                  announcement.trim();

                if (!message) {
                  return;
                }

                void (
                  async () => {
                    const sent =
                      await action(
                        "Announcement",
                        "/api/v1/palworld/announce",
                        {
                          message
                        }
                      );

                    if (sent) {
                      setAnnouncement(
                        ""
                      );
                    }
                  }
                )();
              }}
              type="button"
            >
              <Megaphone size={15} />

              Send
            </button>
          </div>
        </article>

        <article className="control-card">
          <div className="control-heading">
            <div className="control-icon">
              <ServerCog size={21} />
            </div>

            <div>
              <p className="eyebrow">
                IDENTITY
              </p>

              <h3>
                Current server
              </h3>
            </div>
          </div>

          <dl className="control-details">
            <div>
              <dt>
                Name
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
                Version
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
                Exit code
              </dt>

              <dd>
                {
                  live?.runtime
                    .exitCode ??
                  "—"
                }
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </>
  );
}