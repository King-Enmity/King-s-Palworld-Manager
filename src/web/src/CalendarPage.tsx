import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ListChecks,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Trash2,
  XCircle
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

type SchedulerActionType =
  | "start"
  | "stop"
  | "restart"
  | "save"
  | "announce"
  | "settings";

type SchedulerJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

interface SchedulerJob {
  id: string;

  name: string;

  actionType:
    SchedulerActionType;

  payload:
    unknown;

  scheduledFor:
    string;

  status:
    SchedulerJobStatus;

  createdAt:
    string;

  updatedAt:
    string;

  startedAt:
    string |
    null;

  completedAt:
    string |
    null;

  cancelledAt:
    string |
    null;

  lastError:
    string |
    null;
}

interface WebhookDestinationSummary {
  id: string;

  name: string;

  kind:
    "discord" |
    "generic";

  enabled:
    boolean;

  urlHint:
    string;
}

type SchedulerNotificationRequest =
  | {
      destinationId:
        string;

      phase:
        "before";

      minutesBefore:
        number;

      messageTemplate:
        string;
    }
  | {
      destinationId:
        string;

      phase:
        "start" |
        "success" |
        "failure";

      messageTemplate:
        string;
    };

interface Notice {
  type:
    "success" |
    "error" |
    "working";

  message:
    string;
}

const actionLabels:
  Record<
    SchedulerActionType,
    string
  > = {
    start:
      "Start server",

    stop:
      "Stop server",

    restart:
      "Restart server",

    save:
      "Save world",

    announce:
      "Announcement",

    settings:
      "Settings change"
  };

const beforeMinuteOptions = [
  5,
  15,
  30,
  60
] as const;

const defaultNotificationTemplates = {
  before:
    "⚠️ {{event.name}} is scheduled in {{minutes_before}} minutes ({{event.action}}).",

  start:
    "▶️ {{event.name}} is starting now ({{event.action}}).",

  success:
    "✅ {{event.name}} completed successfully.",

  failure:
    "❌ {{event.name}} failed: {{error}}"
};

const weekDays = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat"
];

function pad(
  value:
    number
): string {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

function localDateKey(
  date:
    Date
): string {
  return [
    date.getFullYear(),
    pad(
      date.getMonth() +
      1
    ),
    pad(
      date.getDate()
    )
  ].join(
    "-"
  );
}

function localInputValue(
  date:
    Date
): string {
  return (
    `${localDateKey(date)}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}

function initialSchedule():
  string {
  const date =
    new Date(
      Date.now() +
      30 * 60 * 1000
    );

  date.setSeconds(
    0,
    0
  );

  return localInputValue(
    date
  );
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

function formatTime(
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
    return "";
  }

  return date
    .toLocaleTimeString(
      undefined,
      {
        hour:
          "numeric",

        minute:
          "2-digit"
      }
    );
}

function monthTitle(
  date:
    Date
): string {
  return date
    .toLocaleDateString(
      undefined,
      {
        month:
          "long",

        year:
          "numeric"
      }
    );
}

function actionIcon(
  action:
    SchedulerActionType
) {
  switch (
    action
  ) {
    case "start":
      return Play;

    case "stop":
      return Square;

    case "restart":
      return RotateCcw;

    case "save":
      return Save;

    case "announce":
      return Megaphone;

    case "settings":
      return Settings2;
  }
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

function parseSettingsChanges(
  value:
    string
): Record<
  string,
  string |
  number |
  boolean
> {
  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        value
      );
  } catch {
    throw new Error(
      "Settings changes must be valid JSON."
    );
  }

  if (
    typeof parsed !==
      "object" ||
    parsed ===
      null ||
    Array.isArray(
      parsed
    )
  ) {
    throw new Error(
      "Settings changes must be a JSON object."
    );
  }

  const changes:
    Record<
      string,
      string |
      number |
      boolean
    > = {};

  for (
    const [
      key,
      settingValue
    ]
    of Object.entries(
      parsed
    )
  ) {
    if (
      !/^[A-Za-z0-9_]+$/
        .test(
          key
        )
    ) {
      throw new Error(
        `Invalid setting key: ${key}`
      );
    }

    if (
      typeof settingValue !==
        "string" &&
      typeof settingValue !==
        "number" &&
      typeof settingValue !==
        "boolean"
    ) {
      throw new Error(
        `Setting ${key} must be a string, number or boolean.`
      );
    }

    changes[key] =
      settingValue;
  }

  if (
    Object.keys(
      changes
    ).length ===
    0
  ) {
    throw new Error(
      "Add at least one scheduled setting change."
    );
  }

  return changes;
}

export function CalendarPage() {
  const [
    jobs,
    setJobs
  ] =
    useState<
      SchedulerJob[]
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
    currentMonth,
    setCurrentMonth
  ] =
    useState(
      () => {
        const now =
          new Date();

        return new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );
      }
    );

  const [
    name,
    setName
  ] =
    useState(
      ""
    );

  const [
    actionType,
    setActionType
  ] =
    useState<
      SchedulerActionType
    >(
      "restart"
    );

  const [
    scheduledLocal,
    setScheduledLocal
  ] =
    useState(
      initialSchedule
    );

  const [
    announcement,
    setAnnouncement
  ] =
    useState(
      ""
    );

  const [
    settingsJson,
    setSettingsJson
  ] =
    useState(
`{
  "ServerPlayerMaxNum": 24
}`
    );

  const [
    webhookDestinations,
    setWebhookDestinations
  ] =
    useState<
      WebhookDestinationSummary[]
    >(
      []
    );

  const [
    selectedDestinationIds,
    setSelectedDestinationIds
  ] =
    useState<
      string[]
    >(
      []
    );

  const [
    beforeMinutes,
    setBeforeMinutes
  ] =
    useState<
      number[]
    >(
      [
        15
      ]
    );

  const [
    notifyStart,
    setNotifyStart
  ] =
    useState(
      true
    );

  const [
    notifySuccess,
    setNotifySuccess
  ] =
    useState(
      true
    );

  const [
    notifyFailure,
    setNotifyFailure
  ] =
    useState(
      true
    );

  const [
    beforeTemplate,
    setBeforeTemplate
  ] =
    useState(
      defaultNotificationTemplates
        .before
    );

  const [
    startTemplate,
    setStartTemplate
  ] =
    useState(
      defaultNotificationTemplates
        .start
    );

  const [
    successTemplate,
    setSuccessTemplate
  ] =
    useState(
      defaultNotificationTemplates
        .success
    );

  const [
    failureTemplate,
    setFailureTemplate
  ] =
    useState(
      defaultNotificationTemplates
        .failure
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const [
            jobsResponse,
            destinationsResponse
          ] =
            await Promise.all([
              fetch(
                "/api/v1/scheduler/jobs",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              ),

              fetch(
                "/api/v1/webhooks/destinations",
                {
                  headers: {
                    Accept:
                      "application/json"
                  }
                }
              )
            ]);

          if (!jobsResponse.ok) {
            throw new Error(
              await responseMessage(
                jobsResponse
              )
            );
          }

          if (!destinationsResponse.ok) {
            throw new Error(
              await responseMessage(
                destinationsResponse
              )
            );
          }

          const jobsPayload =
            await jobsResponse
              .json() as
                SchedulerJob[];

          const destinationsPayload =
            await destinationsResponse
              .json() as
                WebhookDestinationSummary[];

          setJobs(
            jobsPayload
          );

          setWebhookDestinations(
            destinationsPayload
          );

          setSelectedDestinationIds(
            current =>
              current.filter(
                id =>
                  destinationsPayload
                    .some(
                      destination =>
                        destination.id ===
                          id &&
                        destination.enabled
                    )
              )
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
              : "Scheduler jobs could not be loaded."
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
          10_000
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
      const scheduledDate =
        new Date(
          scheduledLocal
        );

      if (
        Number.isNaN(
          scheduledDate.getTime()
        )
      ) {
        setNotice({
          type:
            "error",

          message:
            "Choose a valid date and time."
        });

        return;
      }

      if (
        scheduledDate.getTime() <=
        Date.now()
      ) {
        setNotice({
          type:
            "error",

          message:
            "Scheduled time must be in the future."
        });

        return;
      }

      const selectedDestinations =
        webhookDestinations
          .filter(
            destination =>
              destination.enabled &&
              selectedDestinationIds
                .includes(
                  destination.id
                )
          );

      if (
        selectedDestinations.length !==
        selectedDestinationIds.length
      ) {
        setNotice({
          type:
            "error",

          message:
            "One or more selected webhook destinations are disabled or no longer available."
        });

        return;
      }

      const notificationRequests:
        SchedulerNotificationRequest[] =
          [];

      if (
        selectedDestinations.length >
        0
      ) {
        const validateTemplate =
          (
            label:
              string,

            value:
              string
          ): string | null => {
            const trimmed =
              value.trim();

            if (!trimmed) {
              return `${label} notification template cannot be empty.`;
            }

            if (
              trimmed.length >
              2000
            ) {
              return `${label} notification template cannot exceed 2000 characters.`;
            }

            return null;
          };

        if (
          beforeMinutes.length >
          0
        ) {
          const issue =
            validateTemplate(
              "Before-event",
              beforeTemplate
            );

          if (issue) {
            setNotice({
              type:
                "error",

              message:
                issue
            });

            return;
          }

          const invalidLead =
            beforeMinutes
              .find(
                minutes =>
                  scheduledDate
                    .getTime() -
                    minutes *
                    60_000 <=
                  Date.now()
              );

          if (
            invalidLead !==
            undefined
          ) {
            setNotice({
              type:
                "error",

              message:
                `The ${invalidLead}-minute warning time has already passed. Move the event later or choose a smaller warning interval.`
            });

            return;
          }
        }

        if (notifyStart) {
          const issue =
            validateTemplate(
              "Start",
              startTemplate
            );

          if (issue) {
            setNotice({
              type:
                "error",

              message:
                issue
            });

            return;
          }
        }

        if (notifySuccess) {
          const issue =
            validateTemplate(
              "Success",
              successTemplate
            );

          if (issue) {
            setNotice({
              type:
                "error",

              message:
                issue
            });

            return;
          }
        }

        if (notifyFailure) {
          const issue =
            validateTemplate(
              "Failure",
              failureTemplate
            );

          if (issue) {
            setNotice({
              type:
                "error",

              message:
                issue
            });

            return;
          }
        }

        for (
          const destination
          of selectedDestinations
        ) {
          for (
            const minutes
            of [
              ...beforeMinutes
            ].sort(
              (
                left,
                right
              ) =>
                right -
                left
            )
          ) {
            notificationRequests
              .push({
                destinationId:
                  destination.id,

                phase:
                  "before",

                minutesBefore:
                  minutes,

                messageTemplate:
                  beforeTemplate
                    .trim()
              });
          }

          if (notifyStart) {
            notificationRequests
              .push({
                destinationId:
                  destination.id,

                phase:
                  "start",

                messageTemplate:
                  startTemplate
                    .trim()
              });
          }

          if (notifySuccess) {
            notificationRequests
              .push({
                destinationId:
                  destination.id,

                phase:
                  "success",

                messageTemplate:
                  successTemplate
                    .trim()
              });
          }

          if (notifyFailure) {
            notificationRequests
              .push({
                destinationId:
                  destination.id,

                phase:
                  "failure",

                messageTemplate:
                  failureTemplate
                    .trim()
              });
          }
        }

        if (
          notificationRequests.length >
          32
        ) {
          setNotice({
            type:
              "error",

            message:
              "This event would create more than 32 notifications. Reduce destinations or notification phases."
          });

          return;
        }
      }

      let payload:
        unknown = {};

      if (
        actionType ===
        "announce"
      ) {
        const message =
          announcement
            .trim();

        if (!message) {
          setNotice({
            type:
              "error",

            message:
              "Enter the announcement message."
          });

          return;
        }

        payload = {
          message
        };
      }

      if (
        actionType ===
        "settings"
      ) {
        try {
          payload = {
            changes:
              parseSettingsChanges(
                settingsJson
              )
          };
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
                : "Scheduled settings are invalid."
          });

          return;
        }
      }

      const eventName =
        name.trim() ||
        actionLabels[
          actionType
        ];

      setBusy(
        "create"
      );

      setNotice({
        type:
          "working",

        message:
          "Creating scheduled event…"
      });

      try {
        const response =
          await fetch(
            "/api/v1/scheduler/jobs",
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
                    eventName,

                  actionType,

                  payload,

                  scheduledFor:
                    scheduledDate
                      .toISOString()
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

        const createdJob =
          await response
            .json() as
              SchedulerJob;

        if (
          notificationRequests.length >
          0
        ) {
          const notificationResponse =
            await fetch(
              `/api/v1/scheduler/jobs/${createdJob.id}/notifications`,
              {
                method:
                  "PUT",

                headers: {
                  Accept:
                    "application/json",

                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    notifications:
                      notificationRequests
                  })
              }
            );

          if (
            !notificationResponse.ok
          ) {
            const notificationError =
              await responseMessage(
                notificationResponse
              );

            const rollbackResponse =
              await fetch(
                `/api/v1/scheduler/jobs/${createdJob.id}`,
                {
                  method:
                    "DELETE"
                }
              );

            if (
              !rollbackResponse.ok
            ) {
              throw new Error(
                `The event was created, but community notification setup failed: ${notificationError}. Automatic rollback also failed; review "${createdJob.name}" in Calendar.`
              );
            }

            throw new Error(
              `Community notification setup failed: ${notificationError}. The scheduled event was rolled back.`
            );
          }
        }

        setName(
          ""
        );

        setScheduledLocal(
          initialSchedule()
        );

        if (
          actionType ===
          "announce"
        ) {
          setAnnouncement(
            ""
          );
        }

        setNotice({
          type:
            "success",

          message:
            notificationRequests.length >
              0
              ? `Scheduled event created with ${notificationRequests.length} community notification${notificationRequests.length === 1 ? "" : "s"}.`
              : "Scheduled event created."
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
              : "Scheduled event could not be created."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const cancel =
    async (
      job:
        SchedulerJob
    ): Promise<void> => {
      setBusy(
        job.id
      );

      try {
        const response =
          await fetch(
            `/api/v1/scheduler/jobs/${job.id}/cancel`,
            {
              method:
                "POST",

              headers: {
                Accept:
                  "application/json"
              }
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
            `Cancelled ${job.name}.`
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
              : "Scheduled event could not be cancelled."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const remove =
    async (
      job:
        SchedulerJob
    ): Promise<void> => {
      setBusy(
        job.id
      );

      try {
        const response =
          await fetch(
            `/api/v1/scheduler/jobs/${job.id}`,
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
            `Deleted ${job.name}.`
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
              : "Scheduled event could not be deleted."
        });
      } finally {
        setBusy(
          null
        );
      }
    };

  const jobsByDate =
    useMemo(
      () => {
        const result =
          new Map<
            string,
            SchedulerJob[]
          >();

        for (
          const job
          of jobs
        ) {
          const date =
            new Date(
              job.scheduledFor
            );

          if (
            Number.isNaN(
              date.getTime()
            )
          ) {
            continue;
          }

          const key =
            localDateKey(
              date
            );

          const existing =
            result.get(
              key
            ) ??
            [];

          existing.push(
            job
          );

          result.set(
            key,
            existing
          );
        }

        for (
          const values
          of result.values()
        ) {
          values.sort(
            (
              left,
              right
            ) =>
              Date.parse(
                left.scheduledFor
              ) -
              Date.parse(
                right.scheduledFor
              )
          );
        }

        return result;
      },
      [
        jobs
      ]
    );

  const calendarDays =
    useMemo(
      () => {
        const year =
          currentMonth
            .getFullYear();

        const month =
          currentMonth
            .getMonth();

        const firstWeekDay =
          new Date(
            year,
            month,
            1
          ).getDay();

        const daysInMonth =
          new Date(
            year,
            month + 1,
            0
          ).getDate();

        const cells:
          Array<
            Date |
            null
          > = [];

        for (
          let index = 0;
          index <
          firstWeekDay;
          index += 1
        ) {
          cells.push(
            null
          );
        }

        for (
          let day = 1;
          day <=
          daysInMonth;
          day += 1
        ) {
          cells.push(
            new Date(
              year,
              month,
              day
            )
          );
        }

        while (
          cells.length %
          7 !==
          0
        ) {
          cells.push(
            null
          );
        }

        return cells;
      },
      [
        currentMonth
      ]
    );

  const upcoming =
    useMemo(
      () =>
        jobs
          .filter(
            job =>
              job.status ===
                "pending" ||
              job.status ===
                "running"
          )
          .sort(
            (
              left,
              right
            ) =>
              Date.parse(
                left.scheduledFor
              ) -
              Date.parse(
                right.scheduledFor
              )
          )
          .slice(
            0,
            12
          ),
      [
        jobs
      ]
    );

  const completedCount =
    jobs.filter(
      job =>
        job.status ===
        "completed"
    ).length;

  const failedCount =
    jobs.filter(
      job =>
        job.status ===
        "failed"
    ).length;

  const pendingCount =
    jobs.filter(
      job =>
        job.status ===
          "pending" ||
        job.status ===
          "running"
    ).length;

  const todayKey =
    localDateKey(
      new Date()
    );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            AUTOMATION & MAINTENANCE
          </p>

          <h1>
            Calendar
          </h1>

          <p className="subtitle">
            Schedule Palworld maintenance, saves, announcements and configuration changes.
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
                    Scheduler unavailable
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

      <section className="calendar-summary-grid">
        <article>
          <Clock3 size={18} />

          <span>
            Pending
          </span>

          <strong>
            {pendingCount}
          </strong>
        </article>

        <article>
          <CheckCircle2 size={18} />

          <span>
            Completed
          </span>

          <strong>
            {completedCount}
          </strong>
        </article>

        <article>
          <CircleAlert size={18} />

          <span>
            Failed
          </span>

          <strong>
            {failedCount}
          </strong>
        </article>

        <article>
          <ListChecks size={18} />

          <span>
            Total events
          </span>

          <strong>
            {jobs.length}
          </strong>
        </article>
      </section>

      <section className="calendar-layout">
        <article className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div>
              <p className="eyebrow">
                SCHEDULE
              </p>

              <h2>
                {
                  monthTitle(
                    currentMonth
                  )
                }
              </h2>
            </div>

            <div className="calendar-navigation">
              <button
                onClick={() => {
                  setCurrentMonth(
                    current =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() -
                          1,
                        1
                      )
                  );
                }}
                type="button"
              >
                <ChevronLeft
                  size={16}
                />
              </button>

              <button
                className="calendar-today-button"
                onClick={() => {
                  const now =
                    new Date();

                  setCurrentMonth(
                    new Date(
                      now.getFullYear(),
                      now.getMonth(),
                      1
                    )
                  );
                }}
                type="button"
              >
                Today
              </button>

              <button
                onClick={() => {
                  setCurrentMonth(
                    current =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() +
                          1,
                        1
                      )
                  );
                }}
                type="button"
              >
                <ChevronRight
                  size={16}
                />
              </button>
            </div>
          </div>

          <div className="calendar-week-header">
            {
              weekDays.map(
                day => (
                  <div key={day}>
                    {day}
                  </div>
                )
              )
            }
          </div>

          <div className="calendar-month-grid">
            {
              calendarDays.map(
                (
                  date,
                  index
                ) => {
                  if (!date) {
                    return (
                      <div
                        className="calendar-day calendar-day-empty"
                        key={
                          `empty-${index}`
                        }
                      />
                    );
                  }

                  const key =
                    localDateKey(
                      date
                    );

                  const dayJobs =
                    jobsByDate.get(
                      key
                    ) ??
                    [];

                  return (
                    <button
                      className={
                        key ===
                          todayKey
                          ? "calendar-day calendar-day-today"
                          : "calendar-day"
                      }
                      key={key}
                      onClick={() => {
                        const current =
                          new Date(
                            scheduledLocal
                          );

                        const hour =
                          Number.isNaN(
                            current.getTime()
                          )
                            ? 18
                            : current.getHours();

                        const minute =
                          Number.isNaN(
                            current.getTime()
                          )
                            ? 0
                            : current.getMinutes();

                        const selected =
                          new Date(
                            date.getFullYear(),
                            date.getMonth(),
                            date.getDate(),
                            hour,
                            minute
                          );

                        setScheduledLocal(
                          localInputValue(
                            selected
                          )
                        );
                      }}
                      type="button"
                    >
                      <span className="calendar-day-number">
                        {
                          date.getDate()
                        }
                      </span>

                      <div className="calendar-day-events">
                        {
                          dayJobs
                            .slice(
                              0,
                              3
                            )
                            .map(
                              job => (
                                <span
                                  className={
                                    `calendar-event-chip event-${job.actionType} status-${job.status}`
                                  }
                                  key={
                                    job.id
                                  }
                                  title={
                                    `${job.name} · ${formatDateTime(job.scheduledFor)}`
                                  }
                                >
                                  {
                                    formatTime(
                                      job.scheduledFor
                                    )
                                  }

                                  {" "}

                                  {
                                    job.name
                                  }
                                </span>
                              )
                            )
                        }

                        {
                          dayJobs.length >
                            3
                            ? (
                                <span className="calendar-more-events">
                                  +{
                                    dayJobs.length -
                                    3
                                  } more
                                </span>
                              )
                            : null
                        }
                      </div>
                    </button>
                  );
                }
              )
            }
          </div>
        </article>

        <aside className="calendar-create-panel">
          <div className="control-heading">
            <div className="control-icon">
              <Plus
                size={21}
              />
            </div>

            <div>
              <p className="eyebrow">
                NEW EVENT
              </p>

              <h3>
                Schedule action
              </h3>
            </div>
          </div>

          <label className="calendar-field">
            <span>
              Event name
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
              placeholder={
                actionLabels[
                  actionType
                ]
              }
              type="text"
              value={name}
            />
          </label>

          <label className="calendar-field">
            <span>
              Action
            </span>

            <select
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setActionType(
                    event.target
                      .value as
                      SchedulerActionType
                  )
              }
              value={
                actionType
              }
            >
              <option value="start">
                Start server
              </option>

              <option value="stop">
                Stop server
              </option>

              <option value="restart">
                Restart server
              </option>

              <option value="save">
                Save world
              </option>

              <option value="announce">
                Announcement
              </option>

              <option value="settings">
                Settings changes
              </option>
            </select>
          </label>

          <label className="calendar-field">
            <span>
              Date & time
            </span>

            <input
              disabled={
                busy !==
                null
              }
              onChange={
                event =>
                  setScheduledLocal(
                    event.target
                      .value
                  )
              }
              type="datetime-local"
              value={
                scheduledLocal
              }
            />

            <small>
              Uses your browser's local timezone and stores the event in UTC.
            </small>
          </label>

          {
            actionType ===
              "announce"
              ? (
                  <label className="calendar-field">
                    <span>
                      Announcement
                    </span>

                    <textarea
                      disabled={
                        busy !==
                        null
                      }
                      maxLength={512}
                      onChange={
                        event =>
                          setAnnouncement(
                            event.target
                              .value
                          )
                      }
                      placeholder="Server restart in 10 minutes..."
                      rows={4}
                      value={
                        announcement
                      }
                    />

                    <small>
                      {
                        announcement.length
                      } / 512
                    </small>
                  </label>
                )
              : null
          }

          {
            actionType ===
              "settings"
              ? (
                  <label className="calendar-field">
                    <span>
                      Settings changes
                    </span>

                    <textarea
                      className="calendar-json-field"
                      disabled={
                        busy !==
                        null
                      }
                      onChange={
                        event =>
                          setSettingsJson(
                            event.target
                              .value
                          )
                      }
                      rows={8}
                      spellCheck={false}
                      value={
                        settingsJson
                      }
                    />

                    <small>
                      JSON object of Palworld setting names and future values.
                    </small>
                  </label>
                )
              : null
          }

          <div className="calendar-notification-panel">
            <div className="calendar-notification-heading">
              <div className="calendar-notification-icon">
                <BellRing
                  size={17}
                />
              </div>

              <div>
                <strong>
                  Community notifications
                </strong>

                <span>
                  Send scheduled updates through Webhooks.
                </span>
              </div>
            </div>

            {
              webhookDestinations.length ===
                0
                ? (
                    <div className="calendar-notification-empty">
                      No webhook destinations are configured. Add one from the Webhooks page to enable community notifications.
                    </div>
                  )
                : (
                    <>
                      <div className="calendar-notification-section">
                        <span className="calendar-notification-label">
                          Destinations
                        </span>

                        <div className="calendar-destination-list">
                          {
                            webhookDestinations.map(
                              destination => (
                                <label
                                  className={
                                    destination.enabled
                                      ? "calendar-destination-option"
                                      : "calendar-destination-option calendar-destination-disabled"
                                  }
                                  key={
                                    destination.id
                                  }
                                >
                                  <input
                                    checked={
                                      selectedDestinationIds
                                        .includes(
                                          destination.id
                                        )
                                    }
                                    disabled={
                                      busy !==
                                        null ||
                                      !destination.enabled
                                    }
                                    onChange={() => {
                                      setSelectedDestinationIds(
                                        current =>
                                          current.includes(
                                            destination.id
                                          )
                                            ? current.filter(
                                                id =>
                                                  id !==
                                                  destination.id
                                              )
                                            : [
                                                ...current,
                                                destination.id
                                              ]
                                      );
                                    }}
                                    type="checkbox"
                                  />

                                  <div>
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
                                      {
                                        destination.enabled
                                          ? ""
                                          : " · disabled"
                                      }
                                    </span>
                                  </div>
                                </label>
                              )
                            )
                          }
                        </div>
                      </div>

                      {
                        selectedDestinationIds.length >
                          0
                          ? (
                              <>
                                <div className="calendar-notification-section">
                                  <span className="calendar-notification-label">
                                    Before event
                                  </span>

                                  <div className="calendar-lead-options">
                                    {
                                      beforeMinuteOptions.map(
                                        minutes => (
                                          <label
                                            className={
                                              beforeMinutes.includes(
                                                minutes
                                              )
                                                ? "calendar-lead-option calendar-lead-selected"
                                                : "calendar-lead-option"
                                            }
                                            key={
                                              minutes
                                            }
                                          >
                                            <input
                                              checked={
                                                beforeMinutes.includes(
                                                  minutes
                                                )
                                              }
                                              disabled={
                                                busy !==
                                                null
                                              }
                                              onChange={() => {
                                                setBeforeMinutes(
                                                  current =>
                                                    current.includes(
                                                      minutes
                                                    )
                                                      ? current.filter(
                                                          value =>
                                                            value !==
                                                            minutes
                                                        )
                                                      : [
                                                          ...current,
                                                          minutes
                                                        ]
                                                );
                                              }}
                                              type="checkbox"
                                            />

                                            {
                                              minutes
                                            } min
                                          </label>
                                        )
                                      )
                                    }
                                  </div>

                                  {
                                    beforeMinutes.length >
                                      0
                                      ? (
                                          <textarea
                                            className="calendar-notification-template"
                                            disabled={
                                              busy !==
                                              null
                                            }
                                            maxLength={2000}
                                            onChange={
                                              event =>
                                                setBeforeTemplate(
                                                  event.target
                                                    .value
                                                )
                                            }
                                            rows={3}
                                            value={
                                              beforeTemplate
                                            }
                                          />
                                        )
                                      : null
                                  }
                                </div>

                                <div className="calendar-notification-phase">
                                  <label className="calendar-notification-toggle">
                                    <input
                                      checked={
                                        notifyStart
                                      }
                                      disabled={
                                        busy !==
                                        null
                                      }
                                      onChange={
                                        event =>
                                          setNotifyStart(
                                            event.target
                                              .checked
                                          )
                                      }
                                      type="checkbox"
                                    />

                                    <div>
                                      <strong>
                                        When action starts
                                      </strong>

                                      <span>
                                        Sent when the scheduler begins executing the Palworld action.
                                      </span>
                                    </div>
                                  </label>

                                  {
                                    notifyStart
                                      ? (
                                          <textarea
                                            className="calendar-notification-template"
                                            disabled={
                                              busy !==
                                              null
                                            }
                                            maxLength={2000}
                                            onChange={
                                              event =>
                                                setStartTemplate(
                                                  event.target
                                                    .value
                                                )
                                            }
                                            rows={3}
                                            value={
                                              startTemplate
                                            }
                                          />
                                        )
                                      : null
                                  }
                                </div>

                                <div className="calendar-notification-phase">
                                  <label className="calendar-notification-toggle">
                                    <input
                                      checked={
                                        notifySuccess
                                      }
                                      disabled={
                                        busy !==
                                        null
                                      }
                                      onChange={
                                        event =>
                                          setNotifySuccess(
                                            event.target
                                              .checked
                                          )
                                      }
                                      type="checkbox"
                                    />

                                    <div>
                                      <strong>
                                        On success
                                      </strong>

                                      <span>
                                        Sent after the scheduled Palworld action completes successfully.
                                      </span>
                                    </div>
                                  </label>

                                  {
                                    notifySuccess
                                      ? (
                                          <textarea
                                            className="calendar-notification-template"
                                            disabled={
                                              busy !==
                                              null
                                            }
                                            maxLength={2000}
                                            onChange={
                                              event =>
                                                setSuccessTemplate(
                                                  event.target
                                                    .value
                                                )
                                            }
                                            rows={3}
                                            value={
                                              successTemplate
                                            }
                                          />
                                        )
                                      : null
                                  }
                                </div>

                                <div className="calendar-notification-phase">
                                  <label className="calendar-notification-toggle">
                                    <input
                                      checked={
                                        notifyFailure
                                      }
                                      disabled={
                                        busy !==
                                        null
                                      }
                                      onChange={
                                        event =>
                                          setNotifyFailure(
                                            event.target
                                              .checked
                                          )
                                      }
                                      type="checkbox"
                                    />

                                    <div>
                                      <strong>
                                        On failure
                                      </strong>

                                      <span>
                                        Includes the scheduler error through the {"{{error}}"} template token.
                                      </span>
                                    </div>
                                  </label>

                                  {
                                    notifyFailure
                                      ? (
                                          <textarea
                                            className="calendar-notification-template"
                                            disabled={
                                              busy !==
                                              null
                                            }
                                            maxLength={2000}
                                            onChange={
                                              event =>
                                                setFailureTemplate(
                                                  event.target
                                                    .value
                                                )
                                            }
                                            rows={3}
                                            value={
                                              failureTemplate
                                            }
                                          />
                                        )
                                      : null
                                  }
                                </div>

                                <div className="calendar-template-help">
                                  <strong>
                                    Template tokens
                                  </strong>

                                  <div>
                                    <code>
                                      {"{{event.name}}"}
                                    </code>

                                    <code>
                                      {"{{event.action}}"}
                                    </code>

                                    <code>
                                      {"{{event.time}}"}
                                    </code>

                                    <code>
                                      {"{{event.status}}"}
                                    </code>

                                    <code>
                                      {"{{phase}}"}
                                    </code>

                                    <code>
                                      {"{{minutes_before}}"}
                                    </code>

                                    <code>
                                      {"{{error}}"}
                                    </code>
                                  </div>
                                </div>

                                <div className="calendar-notification-summary">
                                  <BellRing
                                    size={13}
                                  />

                                  <span>
                                    {
                                      selectedDestinationIds.length
                                    } destination{
                                      selectedDestinationIds.length ===
                                        1
                                        ? ""
                                        : "s"
                                    }
                                    {" · "}
                                    {
                                      selectedDestinationIds.length *
                                      (
                                        beforeMinutes.length +
                                        (
                                          notifyStart
                                            ? 1
                                            : 0
                                        ) +
                                        (
                                          notifySuccess
                                            ? 1
                                            : 0
                                        ) +
                                        (
                                          notifyFailure
                                            ? 1
                                            : 0
                                        )
                                      )
                                    } notifications
                                  </span>
                                </div>
                              </>
                            )
                          : null
                      }
                    </>
                  )
            }
          </div>

          <button
            className="calendar-create-button"
            disabled={
              busy !==
              null
            }
            onClick={() => {
              void create();
            }}
            type="button"
          >
            <CalendarDays
              size={16}
            />

            Schedule event
          </button>
        </aside>
      </section>

      <section className="panel upcoming-events-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              UPCOMING
            </p>

            <h3>
              Scheduled operations
            </h3>
          </div>

          <span className="panel-count">
            {
              upcoming.length
            }
          </span>
        </div>

        {
          upcoming.length >
            0
            ? (
                <div className="scheduled-job-list">
                  {
                    upcoming.map(
                      job => {
                        const Icon =
                          actionIcon(
                            job.actionType
                          );

                        return (
                          <article
                            className="scheduled-job-card"
                            key={
                              job.id
                            }
                          >
                            <div
                              className={
                                `scheduled-job-icon action-${job.actionType}`
                              }
                            >
                              <Icon
                                size={17}
                              />
                            </div>

                            <div className="scheduled-job-main">
                              <div className="scheduled-job-heading">
                                <strong>
                                  {
                                    job.name
                                  }
                                </strong>

                                <span
                                  className={
                                    `scheduler-status scheduler-status-${job.status}`
                                  }
                                >
                                  {
                                    job.status
                                  }
                                </span>
                              </div>

                              <span className="scheduled-job-meta">
                                {
                                  actionLabels[
                                    job.actionType
                                  ]
                                }
                                {" · "}
                                {
                                  formatDateTime(
                                    job.scheduledFor
                                  )
                                }
                              </span>

                              {
                                job.lastError
                                  ? (
                                      <span className="scheduled-job-error">
                                        {
                                          job.lastError
                                        }
                                      </span>
                                    )
                                  : null
                              }
                            </div>

                            <div className="scheduled-job-actions">
                              {
                                job.status ===
                                  "pending"
                                  ? (
                                      <button
                                        className="table-action-button"
                                        disabled={
                                          busy !==
                                          null
                                        }
                                        onClick={() => {
                                          void cancel(
                                            job
                                          );
                                        }}
                                        type="button"
                                      >
                                        <XCircle
                                          size={13}
                                        />

                                        Cancel
                                      </button>
                                    )
                                  : null
                              }
                            </div>
                          </article>
                        );
                      }
                    )
                  }
                </div>
              )
            : (
                <div className="empty-state calendar-empty-state">
                  <CalendarDays
                    size={30}
                  />

                  <strong>
                    Nothing scheduled
                  </strong>

                  <span>
                    Create a maintenance, save, announcement or configuration event.
                  </span>
                </div>
              )
        }
      </section>

      <section className="panel scheduler-history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              HISTORY
            </p>

            <h3>
              Completed and cancelled events
            </h3>
          </div>
        </div>

        <div className="scheduler-history-list">
          {
            jobs
              .filter(
                job =>
                  job.status ===
                    "completed" ||
                  job.status ===
                    "failed" ||
                  job.status ===
                    "cancelled"
              )
              .sort(
                (
                  left,
                  right
                ) =>
                  Date.parse(
                    right.updatedAt
                  ) -
                  Date.parse(
                    left.updatedAt
                  )
              )
              .slice(
                0,
                20
              )
              .map(
                job => (
                  <div
                    className="scheduler-history-row"
                    key={
                      job.id
                    }
                  >
                    <div>
                      <strong>
                        {
                          job.name
                        }
                      </strong>

                      <span>
                        {
                          actionLabels[
                            job.actionType
                          ]
                        }
                        {" · "}
                        {
                          formatDateTime(
                            job.scheduledFor
                          )
                        }
                      </span>
                    </div>

                    <span
                      className={
                        `scheduler-status scheduler-status-${job.status}`
                      }
                    >
                      {
                        job.status
                      }
                    </span>

                    <button
                      className="scheduler-delete-button"
                      disabled={
                        busy !==
                        null
                      }
                      onClick={() => {
                        void remove(
                          job
                        );
                      }}
                      title="Delete event history"
                      type="button"
                    >
                      <Trash2
                        size={14}
                      />
                    </button>
                  </div>
                )
              )
          }
        </div>
      </section>
    </>
  );
}