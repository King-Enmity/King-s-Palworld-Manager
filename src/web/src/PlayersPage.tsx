import {
  Ban,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldOff,
  UserRoundX,
  Users
} from "lucide-react";

import {
  useState
} from "react";

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

interface PlayersPageProps {
  live: {
    health:
      | "offline"
      | "transitioning"
      | "online"
      | "degraded"
      | "crashed";

    players:
      Player[];

    summary: {
      playerCount: number;
      maxPlayers: number | null;
    };
  } | null;

  apiError:
    string |
    null;

  loading:
    boolean;

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

async function getResponseMessage(
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

export function PlayersPage({
  live,
  apiError,
  loading,
  onRefresh
}: PlayersPageProps) {
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
    moderationMessage,
    setModerationMessage
  ] =
    useState(
      ""
    );

  const [
    unbanUserId,
    setUnbanUserId
  ] =
    useState(
      ""
    );

  const players =
    live?.players ??
    [];

  const execute =
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
          await getResponseMessage(
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

  const playerAction =
    async (
      player:
        Player,

      action:
        "kick" |
        "ban"
    ): Promise<void> => {
      const label =
        action ===
          "kick"
          ? `Kick ${player.name}`
          : `Ban ${player.name}`;

      const message =
        moderationMessage
          .trim();

      const body =
        message
          ? {
              message
            }
          : {};

      await execute(
        label,

        `/api/v1/palworld/players/${encodeURIComponent(
          player.userId
        )}/${action}`,

        body
      );
    };

  const unban =
    async (): Promise<void> => {
      const userId =
        unbanUserId
          .trim();

      if (!userId) {
        setNotice({
          type:
            "error",

          message:
            "Enter the Palworld user ID to unban."
        });

        return;
      }

      const success =
        await execute(
          `Unban ${userId}`,

          `/api/v1/palworld/players/${encodeURIComponent(
            userId
          )}/unban`
        );

      if (success) {
        setUnbanUserId(
          ""
        );
      }
    };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            PLAYER ADMINISTRATION
          </p>

          <h1>
            Players
          </h1>

          <p className="subtitle">
            Monitor connected players and perform Palworld moderation actions.
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

      <section className="players-summary-grid">
        <article>
          <span>
            Connected players
          </span>

          <strong>
            {
              live
                ? `${live.summary.playerCount} / ${live.summary.maxPlayers ?? "—"}`
                : "— / —"
            }
          </strong>
        </article>

        <article>
          <span>
            Server health
          </span>

          <strong>
            {
              live?.health ??
              "offline"
            }
          </strong>
        </article>

        <article>
          <span>
            Moderation
          </span>

          <strong>
            Kick / Ban / Unban
          </strong>
        </article>
      </section>

      <section className="players-admin-grid">
        <article className="control-card">
          <div className="control-heading">
            <div className="control-icon">
              <UserRoundX size={21} />
            </div>

            <div>
              <p className="eyebrow">
                MODERATION MESSAGE
              </p>

              <h3>
                Optional kick/ban message
              </h3>
            </div>
          </div>

          <textarea
            className="announcement-box"
            disabled={
              busy !==
              null
            }
            maxLength={512}
            onChange={
              event =>
                setModerationMessage(
                  event.target.value
                )
            }
            placeholder="Reason shown to the player, if desired..."
            rows={3}
            value={
              moderationMessage
            }
          />

          <div className="announcement-footer">
            <span>
              {moderationMessage.length} / 512
            </span>
          </div>
        </article>

        <article className="control-card">
          <div className="control-heading">
            <div className="control-icon">
              <ShieldOff size={21} />
            </div>

            <div>
              <p className="eyebrow">
                UNBAN
              </p>

              <h3>
                Remove a user ban
              </h3>
            </div>
          </div>

          <p className="control-copy">
            Enter the Palworld REST user ID of a previously banned player.
          </p>

          <div className="unban-row">
            <input
              className="text-input"
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setUnbanUserId(
                    event.target.value
                  )
              }
              placeholder="Palworld user ID"
              value={
                unbanUserId
              }
            />

            <button
              className="control-button"
              disabled={
                !unbanUserId.trim() ||
                busy !==
                  null
              }
              onClick={() => {
                void unban();
              }}
              type="button"
            >
              <ShieldOff size={15} />

              Unban
            </button>
          </div>
        </article>
      </section>

      <section className="panel players-management-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              LIVE PLAYERS
            </p>

            <h3>
              Connected to this server
            </h3>
          </div>

          <span className="panel-count">
            {players.length}
          </span>
        </div>

        {
          players.length >
            0
            ? (
                <div className="table-wrap">
                  <table className="players-admin-table">
                    <thead>
                      <tr>
                        <th>
                          Player
                        </th>

                        <th>
                          Level
                        </th>

                        <th>
                          Ping
                        </th>

                        <th>
                          Position
                        </th>

                        <th>
                          Buildings
                        </th>

                        <th>
                          User ID
                        </th>

                        <th>
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {players.map(
                        player => (
                          <tr
                            key={
                              player.userId
                            }
                          >
                            <td>
                              <div className="player-name-cell">
                                <strong>
                                  {player.name}
                                </strong>

                                <span>
                                  {player.accountName}
                                </span>
                              </div>
                            </td>

                            <td>
                              {player.level}
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
                                Math.round(
                                  player.location_x
                                )
                              }, {
                                Math.round(
                                  player.location_y
                                )
                              }
                            </td>

                            <td>
                              {
                                player.building_count
                              }
                            </td>

                            <td>
                              <code className="user-id-code">
                                {
                                  player.userId
                                }
                              </code>
                            </td>

                            <td>
                              <div className="player-action-row">
                                <button
                                  className="table-action-button kick-button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={() => {
                                    void playerAction(
                                      player,
                                      "kick"
                                    );
                                  }}
                                  type="button"
                                >
                                  <UserRoundX size={13} />

                                  Kick
                                </button>

                                <button
                                  className="table-action-button ban-button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={() => {
                                    void playerAction(
                                      player,
                                      "ban"
                                    );
                                  }}
                                  type="button"
                                >
                                  <Ban size={13} />

                                  Ban
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )
            : (
                <div className="empty-state player-empty-state">
                  <Users size={30} />

                  <strong>
                    No players connected
                  </strong>

                  <span>
                    Connected players will automatically appear here.
                  </span>
                </div>
              )
        }
      </section>
    </>
  );
}