import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import type {
  WebhookService
} from "../webhooks/webhook-service.js";

import {
  SchedulerNotificationRepository,
  type ClaimedSchedulerNotification,
  type SchedulerNotification,
  type SchedulerNotificationCreateInput,
  type SchedulerNotificationPhase
} from "./scheduler-notification-repository.js";

import type {
  SchedulerRepository
} from "./scheduler-repository.js";

export class SchedulerNotificationServiceError
  extends Error {
  public constructor(
    message:
      string,

    public readonly statusCode:
      number,

    public readonly code:
      string
  ) {
    super(
      message
    );
  }
}

export interface SchedulerNotificationInput {
  destinationId:
    string;

  phase:
    SchedulerNotificationPhase;

  minutesBefore?:
    number |
    undefined;

  messageTemplate:
    string;
}

export interface SchedulerNotificationDependencies {
  repository:
    SchedulerNotificationRepository;

  scheduler:
    SchedulerRepository;

  webhooks:
    WebhookService;

  audit:
    AuditRepository;
}

export class SchedulerNotificationService {
  private timer:
    NodeJS.Timeout |
    null = null;

  private ticking =
    false;

  public constructor(
    private readonly dependencies:
      SchedulerNotificationDependencies
  ) {}

  public start(): void {
    const recovered =
      this.dependencies
        .repository
        .recoverSending();

    if (
      recovered >
      0
    ) {
      this.dependencies
        .audit
        .record({
          category:
            "scheduler-notification",

          action:
            "recovered-interrupted",

          severity:
            "warning",

          message:
            "Interrupted scheduler notifications were marked failed after Manager startup.",

          metadata: {
            count:
              recovered
          }
        });
    }

    if (this.timer) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          void this.tick();
        },
        1000
      );

    this.timer.unref();

    void this.tick();
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer
    );

    this.timer =
      null;
  }

  public listForJob(
    jobId:
      string
  ): SchedulerNotification[] {
    this.requireJob(
      jobId
    );

    return this.dependencies
      .repository
      .listForJob(
        jobId
      );
  }

  public replaceForJob(
    jobId:
      string,

    inputs:
      readonly SchedulerNotificationInput[]
  ): SchedulerNotification[] {
    const job =
      this.requireJob(
        jobId
      );

    if (
      job.status !==
      "pending"
    ) {
      throw new SchedulerNotificationServiceError(
        "Notifications can only be changed while the scheduled job is pending.",
        409,
        "scheduler-notification-job-not-pending"
      );
    }

    if (
      inputs.length >
      32
    ) {
      throw new SchedulerNotificationServiceError(
        "A scheduled job cannot have more than 32 notifications.",
        400,
        "scheduler-notification-limit"
      );
    }

    const destinations =
      new Set(
        this.dependencies
          .webhooks
          .list()
          .map(
            destination =>
              destination.id
          )
      );

    const duplicateKeys =
      new Set<
        string
      >();

    const normalized:
      SchedulerNotificationCreateInput[] =
        [];

    for (
      const input
      of inputs
    ) {
      if (
        !destinations.has(
          input.destinationId
        )
      ) {
        throw new SchedulerNotificationServiceError(
          "Webhook destination was not found.",
          400,
          "scheduler-notification-destination-invalid"
        );
      }

      const messageTemplate =
        input.messageTemplate
          .trim();

      if (
        messageTemplate.length ===
          0 ||
        messageTemplate.length >
          2000
      ) {
        throw new SchedulerNotificationServiceError(
          "Notification template must contain between 1 and 2000 characters.",
          400,
          "scheduler-notification-template-invalid"
        );
      }

      let minutesBefore:
        number |
        null = null;

      let dueAt:
        string |
        null = null;

      if (
        input.phase ===
        "before"
      ) {
        if (
          !Number.isInteger(
            input.minutesBefore
          ) ||
          input.minutesBefore ===
            undefined ||
          input.minutesBefore <
            1 ||
          input.minutesBefore >
            10080
        ) {
          throw new SchedulerNotificationServiceError(
            "Before-event notifications require a lead time from 1 to 10080 minutes.",
            400,
            "scheduler-notification-offset-invalid"
          );
        }

        minutesBefore =
          input.minutesBefore;

        dueAt =
          new Date(
            Date.parse(
              job.scheduledFor
            ) -
            minutesBefore *
            60_000
          ).toISOString();
      } else if (
        input.minutesBefore !==
        undefined
      ) {
        throw new SchedulerNotificationServiceError(
          "Only before-event notifications may specify minutesBefore.",
          400,
          "scheduler-notification-offset-invalid"
        );
      }

      const duplicateKey =
        [
          input.destinationId,
          input.phase,
          minutesBefore ??
            0
        ].join(
          ":"
        );

      if (
        duplicateKeys.has(
          duplicateKey
        )
      ) {
        throw new SchedulerNotificationServiceError(
          "Duplicate scheduler notification configuration was provided.",
          400,
          "scheduler-notification-duplicate"
        );
      }

      duplicateKeys.add(
        duplicateKey
      );

      normalized.push({
        destinationId:
          input.destinationId,

        phase:
          input.phase,

        minutesBefore,

        messageTemplate,

        dueAt
      });
    }

    const notifications =
      this.dependencies
        .repository
        .replaceForJob(
          job,
          normalized
        );

    this.dependencies
      .audit
      .record({
        category:
          "scheduler-notification",

        action:
          "configured",

        message:
          "Scheduler notification configuration updated.",

        entityType:
          "scheduler-job",

        entityId:
          job.id,

        metadata: {
          count:
            notifications.length
        }
      });

    void this.tick();

    return notifications;
  }

  private requireJob(
    jobId:
      string
  ) {
    try {
      return this.dependencies
        .scheduler
        .get(
          jobId
        );
    } catch {
      throw new SchedulerNotificationServiceError(
        "Scheduled job was not found.",
        404,
        "scheduler-job-not-found"
      );
    }
  }

  private async tick():
    Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking =
      true;

    try {
      const now =
        new Date()
          .toISOString();

      this.dependencies
        .repository
        .synchronize(
          now
        );

      while (true) {
        const notification =
          this.dependencies
            .repository
            .claimNextDue(
              new Date()
                .toISOString()
            );

        if (!notification) {
          break;
        }

        await this.deliver(
          notification
        );
      }
    } finally {
      this.ticking =
        false;
    }
  }

  private async deliver(
    notification:
      ClaimedSchedulerNotification
  ): Promise<void> {
    let message:
      string;

    try {
      message =
        this.renderTemplate(
          notification
        );

      if (
        message.length ===
          0 ||
        message.length >
          2000
      ) {
        throw new Error(
          "Rendered scheduler notification must contain between 1 and 2000 characters."
        );
      }

      await this.dependencies
        .webhooks
        .send(
          notification.destinationId,
          {
            eventType:
              `calendar.${notification.phase}`,

            message,

            data: {
              schedulerJobId:
                notification.jobId,

              notificationId:
                notification.id,

              phase:
                notification.phase,

              actionType:
                notification.actionType,

              scheduledFor:
                notification.scheduledFor,

              status:
                notification.jobStatus,

              minutesBefore:
                notification.minutesBefore
            }
          }
        );

      this.dependencies
        .repository
        .complete(
          notification.id
        );

      this.dependencies
        .audit
        .record({
          category:
            "scheduler-notification",

          action:
            "sent",

          message:
            "Scheduled webhook notification delivered.",

          entityType:
            "scheduler-notification",

          entityId:
            notification.id,

          metadata: {
            jobId:
              notification.jobId,

            phase:
              notification.phase,

            destinationId:
              notification.destinationId
          }
        });
    } catch (
      error
    ) {
      const errorMessage =
        error instanceof
          Error
          ? error.message
          : "Scheduler notification delivery failed.";

      this.dependencies
        .repository
        .fail(
          notification.id,
          errorMessage
        );

      this.dependencies
        .audit
        .record({
          category:
            "scheduler-notification",

          action:
            "failed",

          severity:
            "warning",

          message:
            "Scheduled webhook notification failed.",

          entityType:
            "scheduler-notification",

          entityId:
            notification.id,

          metadata: {
            jobId:
              notification.jobId,

            phase:
              notification.phase,

            destinationId:
              notification.destinationId,

            error:
              errorMessage
          }
        });
    }
  }

  private renderTemplate(
    notification:
      ClaimedSchedulerNotification
  ): string {
    const replacements:
      Record<
        string,
        string
      > = {
        "{{event.name}}":
          notification.jobName,

        "{{event.action}}":
          notification.actionType,

        "{{event.time}}":
          notification.scheduledFor,

        "{{event.status}}":
          notification.jobStatus,

        "{{phase}}":
          notification.phase,

        "{{minutes_before}}":
          notification.minutesBefore ===
            null
            ? ""
            : String(
                notification.minutesBefore
              ),

        "{{error}}":
          notification.jobLastError ??
          ""
      };

    let rendered =
      notification
        .messageTemplate;

    for (
      const [
        token,
        value
      ]
      of Object.entries(
        replacements
      )
    ) {
      rendered =
        rendered
          .split(
            token
          )
          .join(
            value
          );
    }

    return rendered
      .trim();
  }
}