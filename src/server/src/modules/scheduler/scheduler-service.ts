import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import type {
  PalworldLifecycleService
} from "../palworld/lifecycle-service.js";

import type {
  PalworldRestService
} from "../palworld/rest-service.js";

import type {
  PalworldSettingValue
} from "../palworld/settings-parser.js";

import type {
  PalworldSettingsWriter
} from "../palworld/settings-writer.js";

import {
  SchedulerRepository,
  type SchedulerActionType,
  type SchedulerJob
} from "./scheduler-repository.js";

export interface SchedulerDependencies {
  repository:
    SchedulerRepository;

  audit:
    AuditRepository;

  lifecycle:
    PalworldLifecycleService;

  rest:
    PalworldRestService;

  settingsWriter:
    PalworldSettingsWriter;
}

interface AnnouncementPayload {
  message:
    string;
}

interface SettingsPayload {
  changes:
    Record<
      string,
      PalworldSettingValue
    >;
}

export class SchedulerService {
  private timer:
    NodeJS.Timeout |
    null = null;

  private ticking =
    false;

  public constructor(
    private readonly dependencies:
      SchedulerDependencies
  ) {}

  public start(): void {
    const recovered =
      this.dependencies
        .repository
        .recoverInterrupted();

    if (
      recovered >
      0
    ) {
      this.dependencies
        .audit
        .record({
          category:
            "scheduler",

          action:
            "recovered-interrupted",

          severity:
            "warning",

          message:
            "Interrupted scheduler jobs were marked failed after Manager startup.",

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

  public list():
    SchedulerJob[] {
    return this.dependencies
      .repository
      .list();
  }

  public create(
    input: {
      name: string;

      actionType:
        SchedulerActionType;

      payload:
        unknown;

      scheduledFor:
        string;
    }
  ): SchedulerJob {
    const job =
      this.dependencies
        .repository
        .create(
          input
        );

    this.dependencies
      .audit
      .record({
        category:
          "scheduler",

        action:
          "created",

        message:
          "Scheduled Palworld action created.",

        entityType:
          "scheduler-job",

        entityId:
          job.id,

        metadata: {
          actionType:
            job.actionType,

          scheduledFor:
            job.scheduledFor
        }
      });

    return job;
  }

  public cancel(
    id:
      string
  ): SchedulerJob {
    const job =
      this.dependencies
        .repository
        .cancel(
          id
        );

    this.dependencies
      .audit
      .record({
        category:
          "scheduler",

        action:
          "cancelled",

        message:
          "Scheduled Palworld action cancelled.",

        entityType:
          "scheduler-job",

        entityId:
          id
      });

    return job;
  }

  public delete(
    id:
      string
  ): void {
    this.dependencies
      .repository
      .delete(
        id
      );

    this.dependencies
      .audit
      .record({
        category:
          "scheduler",

        action:
          "deleted",

        message:
          "Scheduled Palworld action deleted.",

        entityType:
          "scheduler-job",

        entityId:
          id
      });
  }

  private async tick():
    Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking =
      true;

    try {
      while (true) {
        const job =
          this.dependencies
            .repository
            .claimNextDue(
              new Date()
                .toISOString()
            );

        if (!job) {
          break;
        }

        await this.execute(
          job
        );
      }
    } finally {
      this.ticking =
        false;
    }
  }

  private async execute(
    job:
      SchedulerJob
  ): Promise<void> {
    this.dependencies
      .audit
      .record({
        category:
          "scheduler",

        action:
          "executing",

        message:
          "Executing scheduled Palworld action.",

        entityType:
          "scheduler-job",

        entityId:
          job.id,

        metadata: {
          actionType:
            job.actionType
        }
      });

    try {
      switch (
        job.actionType
      ) {
        case "start":
          await this.dependencies
            .lifecycle
            .start();
          break;

        case "stop":
          await this.dependencies
            .lifecycle
            .stop();
          break;

        case "restart":
          await this.dependencies
            .lifecycle
            .restart();
          break;

        case "save":
          await this.dependencies
            .rest
            .save();
          break;

        case "announce": {
          const payload =
            job.payload as
              AnnouncementPayload;

          await this.dependencies
            .rest
            .announce(
              payload.message
            );

          break;
        }

        case "settings": {
          const payload =
            job.payload as
              SettingsPayload;

          const preview =
            this.dependencies
              .settingsWriter
              .preview(
                payload.changes
              );

          if (!preview.valid) {
            throw new Error(
              preview.errors
                .map(
                  issue =>
                    issue.message
                )
                .join(
                  "; "
                ) ||
              "Scheduled settings changes are invalid."
            );
          }

          if (
            preview.changed &&
            preview.sourceSha256
          ) {
            this.dependencies
              .settingsWriter
              .apply(
                payload.changes,
                preview.sourceSha256
              );
          }

          break;
        }

        default: {
          const exhaustive:
            never =
              job.actionType;

          throw new Error(
            `Unsupported scheduler action: ${String(
              exhaustive
            )}`
          );
        }
      }

      this.dependencies
        .repository
        .complete(
          job.id
        );

      this.dependencies
        .audit
        .record({
          category:
            "scheduler",

          action:
            "completed",

          message:
            "Scheduled Palworld action completed.",

          entityType:
            "scheduler-job",

          entityId:
            job.id,

          metadata: {
            actionType:
              job.actionType
          }
        });
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : "Scheduled action failed.";

      this.dependencies
        .repository
        .fail(
          job.id,
          message
        );

      this.dependencies
        .audit
        .record({
          category:
            "scheduler",

          action:
            "failed",

          severity:
            "error",

          message:
            "Scheduled Palworld action failed.",

          entityType:
            "scheduler-job",

          entityId:
            job.id,

          metadata: {
            actionType:
              job.actionType,

            error:
              message
          }
        });
    }
  }
}