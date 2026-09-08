import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Link2,
  MessageSquare,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Webhook
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

type WebhookKind =
  | "discord"
  | "generic";

type LastStatus =
  | "success"
  | "failed"
  | null;

type DeliveryStatus =
  | "sending"
  | "success"
  | "failed";

interface WebhookDestination {
  id: string;

  name: string;

  kind:
    WebhookKind;

  enabled:
    boolean;

  urlHint:
    string;

  secretConfigured:
    boolean;

  createdAt:
    string;

  updatedAt:
    string;

  lastSentAt:
    string |
    null;

  lastStatus:
    LastStatus;

  lastHttpStatus:
    number |
    null;

  lastError:
    string |
    null;
}

interface WebhookDelivery {
  id: string;

  destinationId:
    string;

  destinationName:
    string;

  eventType:
    string;

  status:
    DeliveryStatus;

  createdAt:
    string;

  completedAt:
    string |
    null;

  httpStatus:
    number |
    null;

  error:
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

async function responseMessage(
  response:
    Response
): Promise<string> {
  const text =
    await response
      .text();

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

function formatDateTime(
  value:
    string |
    null
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
    .toLocaleString(
      undefined,
      {
        dateStyle:
          "medium",

        timeStyle:
          "short"
      }
    );
}

export function WebhooksPage() {
  const [
    destinations,
    setDestinations
  ] =
    useState<
      WebhookDestination[]
    >(
      []
    );

  const [
    deliveries,
    setDeliveries
  ] =
    useState<
      WebhookDelivery[]
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
    name,
    setName
  ] =
    useState(
      ""
    );

  const [
    kind,
    setKind
  ] =
    useState<
      WebhookKind
    >(
      "discord"
    );

  const [
    url,
    setUrl
  ] =
    useState(
      ""
    );

  const [
    enabled,
    setEnabled
  ] =
    useState(
      true
    );

  const [
    messages,
    setMessages
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {}
    );

  const [
    replacementUrls,
    setReplacementUrls
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {}
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const [
            destinationsResponse,
            deliveriesResponse
          ] =
            await Promise.all([
              fetch(
                "/api/v1/webhooks/destinations",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              ),

              fetch(
                "/api/v1/webhooks/deliveries?limit=50",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              )
            ]);

          if (
            !destinationsResponse.ok
          ) {
            throw new Error(
              await responseMessage(
                destinationsResponse
              )
            );
          }

          if (
            !deliveriesResponse.ok
          ) {
            throw new Error(
              await responseMessage(
                deliveriesResponse
              )
            );
          }

          const destinationPayload =
            await destinationsResponse
              .json() as
                WebhookDestination[];

          const deliveryPayload =
            await deliveriesResponse
              .json() as
                WebhookDelivery[];

          setDestinations(
            destinationPayload
          );

          setDeliveries(
            deliveryPayload
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
              : "Webhook data could not be loaded."
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

      const timer =
        window.setInterval(
          () => {
            void load();
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
      load
    ]
  );

  const create =
    async (): Promise<void> => {
      const trimmedName =
        name.trim();

      const trimmedUrl =
        url.trim();

      if (!trimmedName) {
        setNotice({
          type:
            "error",

          message:
            "Enter a destination name."
        });

        return;
      }

      if (!trimmedUrl) {
        setNotice({
          type:
            "error",

          message:
            "Enter the webhook URL."
        });

        return;
      }

      setBusy(
        "create"
      );

      setNotice({
        type:
          "working",

        message:
          "Saving encrypted webhook destination…"
      });

      try {
        const response =
          await fetch(
            "/api/v1/webhooks/destinations",
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
                  name:
                    trimmedName,

                  kind,

                  url:
                    trimmedUrl,

                  enabled
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setName(
          ""
        );

        setUrl(
          ""
        );

        setEnabled(
          true
        );

        setNotice({
          type:
            "success",

          message:
            "Webhook destination created. The secret URL is encrypted and will not be displayed again."
        });

        await load();
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
              : "Webhook destination could not be created."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const toggle =
    async (
      destination:
        WebhookDestination
    ): Promise<void> => {
      setBusy(
        destination.id
      );

      try {
        const response =
          await fetch(
            `/api/v1/webhooks/destinations/${destination.id}`,
            {
              method:
                "PATCH",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  enabled:
                    !destination.enabled
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            `${destination.name} ${destination.enabled ? "disabled" : "enabled"}.`
        });

        await load();
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
              : "Webhook state could not be changed."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const replaceUrl =
    async (
      destination:
        WebhookDestination
    ): Promise<void> => {
      const replacement =
        replacementUrls[
          destination.id
        ]?.trim() ??
        "";

      if (!replacement) {
        setNotice({
          type:
            "error",

          message:
            `Enter a replacement URL for ${destination.name}.`
        });

        return;
      }

      setBusy(
        destination.id
      );

      try {
        const response =
          await fetch(
            `/api/v1/webhooks/destinations/${destination.id}`,
            {
              method:
                "PATCH",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  url:
                    replacement
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setReplacementUrls(
          current => ({
            ...current,

            [destination.id]:
              ""
          })
        );

        setNotice({
          type:
            "success",

          message:
            `${destination.name} webhook URL replaced securely.`
        });

        await load();
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
              : "Webhook URL could not be replaced."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const test =
    async (
      destination:
        WebhookDestination
    ): Promise<void> => {
      const message =
        messages[
          destination.id
        ]?.trim() ||
        "King's Palworld Manager webhook test.";

      setBusy(
        destination.id
      );

      setNotice({
        type:
          "working",

        message:
          `Testing ${destination.name}…`
      });

      try {
        const response =
          await fetch(
            `/api/v1/webhooks/destinations/${destination.id}/test`,
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
                  message
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            `Test delivered to ${destination.name}.`
        });

        await load();
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
              : "Webhook test failed."
        });

        await load();
      } finally {
        setBusy(
          null
        );
      }
    };

  const send =
    async (
      destination:
        WebhookDestination
    ): Promise<void> => {
      const message =
        messages[
          destination.id
        ]?.trim() ??
        "";

      if (!message) {
        setNotice({
          type:
            "error",

          message:
            `Enter a message for ${destination.name}.`
        });

        return;
      }

      setBusy(
        destination.id
      );

      setNotice({
        type:
          "working",

        message:
          `Sending to ${destination.name}…`
      });

      try {
        const response =
          await fetch(
            `/api/v1/webhooks/destinations/${destination.id}/send`,
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
                  eventType:
                    "manual.web-ui",

                  message,

                  data: {
                    source:
                      "web-ui"
                  }
                })
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            `Message delivered to ${destination.name}.`
        });

        await load();
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
              : "Webhook delivery failed."
        });

        await load();
      } finally {
        setBusy(
          null
        );
      }
    };

  const remove =
    async (
      destination:
        WebhookDestination
    ): Promise<void> => {
      const confirmed =
        window.confirm(
          `Delete ${destination.name} and its delivery history?`
        );

      if (!confirmed) {
        return;
      }

      setBusy(
        destination.id
      );

      try {
        const response =
          await fetch(
            `/api/v1/webhooks/destinations/${destination.id}`,
            {
              method:
                "DELETE"
            }
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response
            )
          );
        }

        setNotice({
          type:
            "success",

          message:
            `${destination.name} deleted.`
        });

        await load();
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
              : "Webhook destination could not be deleted."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const enabledCount =
    useMemo(
      () =>
        destinations.filter(
          destination =>
            destination.enabled
        ).length,
      [
        destinations
      ]
    );

  const discordCount =
    useMemo(
      () =>
        destinations.filter(
          destination =>
            destination.kind ===
            "discord"
        ).length,
      [
        destinations
      ]
    );

  const failedCount =
    useMemo(
      () =>
        destinations.filter(
          destination =>
            destination.lastStatus ===
            "failed"
        ).length,
      [
        destinations
      ]
    );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            COMMUNITY AUTOMATION
          </p>

          <h1>
            Webhooks
          </h1>

          <p className="subtitle">
            Manage secure Discord and generic HTTPS destinations for server announcements and automation.
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
                <CircleAlert
                  size={18}
                />

                <div>
                  <strong>
                    Webhook service unavailable
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

      <section className="webhook-summary-grid">
        <article>
          <Webhook
            size={18}
          />

          <span>
            Destinations
          </span>

          <strong>
            {destinations.length}
          </strong>
        </article>

        <article>
          <Power
            size={18}
          />

          <span>
            Enabled
          </span>

          <strong>
            {enabledCount}
          </strong>
        </article>

        <article>
          <MessageSquare
            size={18}
          />

          <span>
            Discord
          </span>

          <strong>
            {discordCount}
          </strong>
        </article>

        <article>
          <CircleAlert
            size={18}
          />

          <span>
            Last failed
          </span>

          <strong>
            {failedCount}
          </strong>
        </article>
      </section>

      <section className="webhook-layout">
        <div className="webhook-destinations-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  DESTINATIONS
                </p>

                <h3>
                  Delivery endpoints
                </h3>
              </div>

              <span className="panel-count">
                {
                  destinations.length
                }
              </span>
            </div>

            {
              destinations.length ===
                0
                ? (
                    <div className="empty-state webhook-empty-state">
                      <Webhook
                        size={30}
                      />

                      <strong>
                        No webhook destinations
                      </strong>

                      <span>
                        Add Discord or generic HTTPS destinations to begin sending community updates.
                      </span>
                    </div>
                  )
                : (
                    <div className="webhook-card-list">
                      {
                        destinations.map(
                          destination => (
                            <article
                              className="webhook-destination-card"
                              key={
                                destination.id
                              }
                            >
                              <div className="webhook-card-header">
                                <div
                                  className={
                                    `webhook-kind-icon webhook-kind-${destination.kind}`
                                  }
                                >
                                  <Webhook
                                    size={18}
                                  />
                                </div>

                                <div className="webhook-card-title">
                                  <strong>
                                    {
                                      destination.name
                                    }
                                  </strong>

                                  <span>
                                    {
                                      destination.kind ===
                                        "discord"
                                        ? "Discord"
                                        : "Generic HTTPS"
                                    }

                                    {" · "}

                                    {
                                      destination.urlHint
                                    }
                                  </span>
                                </div>

                                <span
                                  className={
                                    destination.enabled
                                      ? "webhook-enabled-chip webhook-enabled"
                                      : "webhook-enabled-chip webhook-disabled"
                                  }
                                >
                                  {
                                    destination.enabled
                                      ? "Enabled"
                                      : "Disabled"
                                  }
                                </span>
                              </div>

                              <div className="webhook-security-note">
                                <ShieldCheck
                                  size={14}
                                />

                                <span>
                                  Secret URL encrypted and hidden
                                </span>
                              </div>

                              <div className="webhook-status-strip">
                                <div>
                                  <span>
                                    Last delivery
                                  </span>

                                  <strong>
                                    {
                                      formatDateTime(
                                        destination.lastSentAt
                                      )
                                    }
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    Status
                                  </span>

                                  <strong
                                    className={
                                      destination.lastStatus
                                        ? `webhook-last-${destination.lastStatus}`
                                        : undefined
                                    }
                                  >
                                    {
                                      destination.lastStatus ??
                                      "Never sent"
                                    }
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    HTTP
                                  </span>

                                  <strong>
                                    {
                                      destination.lastHttpStatus ??
                                      "—"
                                    }
                                  </strong>
                                </div>
                              </div>

                              {
                                destination.lastError
                                  ? (
                                      <div className="webhook-error-box">
                                        <CircleAlert
                                          size={14}
                                        />

                                        <span>
                                          {
                                            destination.lastError
                                          }
                                        </span>
                                      </div>
                                    )
                                  : null
                              }

                              <label className="webhook-field">
                                <span>
                                  Test / manual message
                                </span>

                                <textarea
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  maxLength={2000}
                                  onChange={
                                    event =>
                                      setMessages(
                                        current => ({
                                          ...current,

                                          [destination.id]:
                                            event.target
                                              .value
                                        })
                                      )
                                  }
                                  placeholder="Server maintenance begins in 10 minutes..."
                                  rows={3}
                                  value={
                                    messages[
                                      destination.id
                                    ] ??
                                    ""
                                  }
                                />
                              </label>

                              <div className="webhook-action-row">
                                <button
                                  className="webhook-secondary-button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={() => {
                                    void test(
                                      destination
                                    );
                                  }}
                                  type="button"
                                >
                                  <Webhook
                                    size={14}
                                  />

                                  Test
                                </button>

                                <button
                                  className="webhook-primary-button"
                                  disabled={
                                    busy !==
                                      null ||
                                    !destination.enabled
                                  }
                                  onClick={() => {
                                    void send(
                                      destination
                                    );
                                  }}
                                  type="button"
                                >
                                  <Send
                                    size={14}
                                  />

                                  Send
                                </button>

                                <button
                                  className="webhook-secondary-button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={() => {
                                    void toggle(
                                      destination
                                    );
                                  }}
                                  type="button"
                                >
                                  {
                                    destination.enabled
                                      ? (
                                          <PowerOff
                                            size={14}
                                          />
                                        )
                                      : (
                                          <Power
                                            size={14}
                                          />
                                        )
                                  }

                                  {
                                    destination.enabled
                                      ? "Disable"
                                      : "Enable"
                                  }
                                </button>
                              </div>

                              <div className="webhook-replace-row">
                                <label className="webhook-field">
                                  <span>
                                    Replace secret URL
                                  </span>

                                  <div className="webhook-inline-field">
                                    <input
                                      autoComplete="new-password"
                                      disabled={
                                        busy !==
                                        null
                                      }
                                      onChange={
                                        event =>
                                          setReplacementUrls(
                                            current => ({
                                              ...current,

                                              [destination.id]:
                                                event.target
                                                  .value
                                            })
                                          )
                                      }
                                      placeholder="Paste a new HTTPS webhook URL"
                                      type="password"
                                      value={
                                        replacementUrls[
                                          destination.id
                                        ] ??
                                        ""
                                      }
                                    />

                                    <button
                                      className="webhook-save-secret-button"
                                      disabled={
                                        busy !==
                                          null ||
                                        !(
                                          replacementUrls[
                                            destination.id
                                          ]?.trim()
                                        )
                                      }
                                      onClick={() => {
                                        void replaceUrl(
                                          destination
                                        );
                                      }}
                                      type="button"
                                    >
                                      <Save
                                        size={14}
                                      />

                                      Replace
                                    </button>
                                  </div>
                                </label>
                              </div>

                              <div className="webhook-card-footer">
                                <span>
                                  Created {
                                    formatDateTime(
                                      destination.createdAt
                                    )
                                  }
                                </span>

                                <button
                                  className="webhook-delete-button"
                                  disabled={
                                    busy !==
                                    null
                                  }
                                  onClick={() => {
                                    void remove(
                                      destination
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
                          )
                        )
                      }
                    </div>
                  )
            }
          </section>
        </div>

        <aside className="webhook-create-panel">
          <div className="control-heading">
            <div className="control-icon">
              <Plus
                size={21}
              />
            </div>

            <div>
              <p className="eyebrow">
                NEW DESTINATION
              </p>

              <h3>
                Add webhook
              </h3>
            </div>
          </div>

          <label className="webhook-field">
            <span>
              Destination name
            </span>

            <input
              disabled={
                busy !==
                null
              }
              maxLength={128}
              onChange={
                event =>
                  setName(
                    event.target
                      .value
                  )
              }
              placeholder="Community Discord"
              type="text"
              value={name}
            />
          </label>

          <label className="webhook-field">
            <span>
              Type
            </span>

            <select
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setKind(
                    event.target
                      .value as
                      WebhookKind
                  )
              }
              value={kind}
            >
              <option value="discord">
                Discord
              </option>

              <option value="generic">
                Generic HTTPS
              </option>
            </select>
          </label>

          <label className="webhook-field">
            <span>
              Secret webhook URL
            </span>

            <input
              autoComplete="new-password"
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setUrl(
                    event.target
                      .value
                  )
              }
              placeholder={
                kind ===
                  "discord"
                  ? "https://discord.com/api/webhooks/..."
                  : "https://example.com/webhook"
              }
              type="password"
              value={url}
            />

            <small>
              Stored encrypted. The Manager only returns a safe hostname hint after creation.
            </small>
          </label>

          <label className="webhook-checkbox">
            <input
              checked={enabled}
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setEnabled(
                    event.target
                      .checked
                  )
              }
              type="checkbox"
            />

            <span>
              Enable destination immediately
            </span>
          </label>

          <div className="webhook-create-security">
            <ShieldCheck
              size={16}
            />

            <div>
              <strong>
                Protected delivery
              </strong>

              <span>
                HTTPS only, SSRF-protected, encrypted secret storage and no automatic Discord mentions.
              </span>
            </div>
          </div>

          <button
            className="webhook-create-button"
            disabled={
              busy !==
              null
            }
            onClick={() => {
              void create();
            }}
            type="button"
          >
            <Link2
              size={15}
            />

            Add destination
          </button>
        </aside>
      </section>

      <section className="panel webhook-delivery-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              DELIVERY HISTORY
            </p>

            <h3>
              Recent messages
            </h3>
          </div>

          <span className="panel-count">
            {
              deliveries.length
            }
          </span>
        </div>

        {
          deliveries.length ===
            0
            ? (
                <div className="empty-state webhook-history-empty">
                  <Clock3
                    size={27}
                  />

                  <strong>
                    No deliveries yet
                  </strong>

                  <span>
                    Test or send a message to populate delivery history.
                  </span>
                </div>
              )
            : (
                <div className="webhook-delivery-list">
                  {
                    deliveries.map(
                      delivery => (
                        <article
                          className="webhook-delivery-row"
                          key={
                            delivery.id
                          }
                        >
                          <div
                            className={
                              `webhook-delivery-status delivery-${delivery.status}`
                            }
                          >
                            {
                              delivery.status ===
                                "success"
                                ? (
                                    <CheckCircle2
                                      size={15}
                                    />
                                  )
                                : delivery.status ===
                                    "failed"
                                  ? (
                                      <CircleAlert
                                        size={15}
                                      />
                                    )
                                  : (
                                      <Clock3
                                        size={15}
                                      />
                                    )
                            }
                          </div>

                          <div className="webhook-delivery-main">
                            <strong>
                              {
                                delivery.destinationName
                              }
                            </strong>

                            <span>
                              {
                                delivery.eventType
                              }
                              {" · "}
                              {
                                formatDateTime(
                                  delivery.createdAt
                                )
                              }
                            </span>

                            {
                              delivery.error
                                ? (
                                    <small>
                                      {
                                        delivery.error
                                      }
                                    </small>
                                  )
                                : null
                            }
                          </div>

                          <span
                            className={
                              `webhook-delivery-chip delivery-${delivery.status}`
                            }
                          >
                            {
                              delivery.status
                            }
                          </span>

                          <span className="webhook-http-code">
                            HTTP {
                              delivery.httpStatus ??
                              "—"
                            }
                          </span>
                        </article>
                      )
                    )
                  }
                </div>
              )
        }
      </section>
    </>
  );
}