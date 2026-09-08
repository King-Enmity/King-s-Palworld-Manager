import {
  randomUUID
} from "node:crypto";

import type {
  KpmDatabase
} from "../../database/database.js";

import type {
  SchedulerActionType,
  SchedulerJob,
  SchedulerJobStatus
} from "./scheduler-repository.js";

export type SchedulerNotificationPhase =
  | "before"
  | "start"
  | "success"
  | "failure";

export type SchedulerNotificationStatus =
  | "waiting"
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface SchedulerNotification {
  id: string;

  jobId: string;

  destinationId: string;

  phase:
    SchedulerNotificationPhase;

  minutesBefore:
    number |
    null;

  messageTemplate:
    string;

  status:
    SchedulerNotificationStatus;

  dueAt:
    string |
    null;

  createdAt:
    string;

  updatedAt:
    string;

  sentAt:
    string |
    null;

  lastError:
    string |
    null;
}

export interface ClaimedSchedulerNotification
  extends SchedulerNotification {
  jobName:
    string;

  actionType:
    SchedulerActionType;

  scheduledFor:
    string;

  jobStatus:
    SchedulerJobStatus;

  jobLastError:
    string |
    null;
}

export interface SchedulerNotificationCreateInput {
  destinationId:
    string;

  phase:
    SchedulerNotificationPhase;

  minutesBefore:
    number |
    null;

  messageTemplate:
    string;

  dueAt:
    string |
    null;
}

interface NotificationRow {
  id: string;
  job_id: string;
  destination_id: string;

  phase:
    SchedulerNotificationPhase;

  minutes_before:
    number |
    null;

  message_template:
    string;

  status:
    SchedulerNotificationStatus;

  due_at:
    string |
    null;

  created_at:
    string;

  updated_at:
    string;

  sent_at:
    string |
    null;

  last_error:
    string |
    null;
}

interface ClaimedRow
  extends NotificationRow {
  job_name:
    string;

  action_type:
    SchedulerActionType;

  scheduled_for:
    string;

  job_status:
    SchedulerJobStatus;

  job_last_error:
    string |
    null;
}

export class SchedulerNotificationRepository {
  public constructor(
    private readonly database:
      KpmDatabase
  ) {}

  public listForJob(
    jobId:
      string
  ): SchedulerNotification[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM scheduler_notifications
          WHERE job_id = ?
          ORDER BY
            CASE phase
              WHEN 'before' THEN 0
              WHEN 'start' THEN 1
              WHEN 'success' THEN 2
              WHEN 'failure' THEN 3
              ELSE 4
            END,
            minutes_before DESC,
            created_at ASC
        `)
        .all(
          jobId
        ) as
          NotificationRow[];

    return rows.map(
      row =>
        this.map(
          row
        )
    );
  }

  public replaceForJob(
    job:
      SchedulerJob,

    inputs:
      readonly SchedulerNotificationCreateInput[]
  ): SchedulerNotification[] {
    const transaction =
      this.database
        .transaction(
          () => {
            this.database
              .prepare(`
                DELETE FROM scheduler_notifications
                WHERE job_id = ?
              `)
              .run(
                job.id
              );

            const now =
              new Date()
                .toISOString();

            const insert =
              this.database
                .prepare(`
                  INSERT INTO scheduler_notifications (
                    id,
                    job_id,
                    destination_id,
                    phase,
                    minutes_before,
                    message_template,
                    status,
                    due_at,
                    created_at,
                    updated_at
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

            for (
              const input
              of inputs
            ) {
              insert.run(
                randomUUID(),
                job.id,
                input.destinationId,
                input.phase,
                input.minutesBefore,
                input.messageTemplate,

                input.phase ===
                  "before"
                  ? "pending"
                  : "waiting",

                input.dueAt,
                now,
                now
              );
            }
          }
        );

    transaction();

    return this.listForJob(
      job.id
    );
  }

  public synchronize(
    now:
      string
  ): void {
    const transaction =
      this.database
        .transaction(
          () => {
            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'cancelled',
                  updated_at = ?
                WHERE
                  phase = 'before'
                  AND status = 'pending'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status <> 'pending'
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'pending',
                  due_at = (
                    SELECT started_at
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                  ),
                  updated_at = ?
                WHERE
                  phase = 'start'
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.started_at IS NOT NULL
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'pending',
                  due_at = (
                    SELECT COALESCE(
                      completed_at,
                      updated_at
                    )
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                  ),
                  updated_at = ?
                WHERE
                  phase = 'success'
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status = 'completed'
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'pending',
                  due_at = (
                    SELECT COALESCE(
                      completed_at,
                      updated_at
                    )
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                  ),
                  updated_at = ?
                WHERE
                  phase = 'failure'
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status = 'failed'
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'cancelled',
                  updated_at = ?
                WHERE
                  status IN (
                    'waiting',
                    'pending'
                  )
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status = 'cancelled'
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'cancelled',
                  updated_at = ?
                WHERE
                  phase = 'success'
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status = 'failed'
                  )
              `)
              .run(
                now
              );

            this.database
              .prepare(`
                UPDATE scheduler_notifications
                SET
                  status = 'cancelled',
                  updated_at = ?
                WHERE
                  phase = 'failure'
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM scheduler_jobs
                    WHERE
                      scheduler_jobs.id =
                        scheduler_notifications.job_id
                      AND scheduler_jobs.status = 'completed'
                  )
              `)
              .run(
                now
              );
          }
        );

    transaction();
  }

  public claimNextDue(
    now:
      string
  ): ClaimedSchedulerNotification | null {
    const transaction =
      this.database
        .transaction(
          () => {
            const row =
              this.database
                .prepare(`
                  SELECT
                    notification.*,

                    job.name
                      AS job_name,

                    job.action_type,

                    job.scheduled_for,

                    job.status
                      AS job_status,

                    job.last_error
                      AS job_last_error
                  FROM scheduler_notifications
                    AS notification
                  INNER JOIN scheduler_jobs
                    AS job
                    ON job.id =
                       notification.job_id
                  WHERE
                    notification.status = 'pending'
                    AND notification.due_at IS NOT NULL
                    AND notification.due_at <= ?
                    AND (
                      notification.phase <> 'before'
                      OR job.status = 'pending'
                    )
                  ORDER BY
                    notification.due_at ASC,

                    CASE notification.phase
                      WHEN 'before' THEN 0
                      WHEN 'start' THEN 1
                      WHEN 'success' THEN 2
                      WHEN 'failure' THEN 3
                      ELSE 4
                    END,

                    notification.created_at ASC
                  LIMIT 1
                `)
                .get(
                  now
                ) as
                  ClaimedRow |
                  undefined;

            if (!row) {
              return null;
            }

            const updatedAt =
              new Date()
                .toISOString();

            const result =
              this.database
                .prepare(`
                  UPDATE scheduler_notifications
                  SET
                    status = 'sending',
                    updated_at = ?,
                    last_error = NULL
                  WHERE
                    id = ?
                    AND status = 'pending'
                `)
                .run(
                  updatedAt,
                  row.id
                );

            if (
              result.changes !==
              1
            ) {
              return null;
            }

            return {
              ...this.map(
                row
              ),

              status:
                "sending" as const,

              updatedAt,

              jobName:
                row.job_name,

              actionType:
                row.action_type,

              scheduledFor:
                row.scheduled_for,

              jobStatus:
                row.job_status,

              jobLastError:
                row.job_last_error
            };
          }
        );

    return transaction();
  }

  public complete(
    id:
      string
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE scheduler_notifications
        SET
          status = 'sent',
          sent_at = ?,
          updated_at = ?,
          last_error = NULL
        WHERE id = ?
      `)
      .run(
        now,
        now,
        id
      );
  }

  public fail(
    id:
      string,

    error:
      string
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE scheduler_notifications
        SET
          status = 'failed',
          updated_at = ?,
          last_error = ?
        WHERE id = ?
      `)
      .run(
        now,
        error.slice(
          0,
          2048
        ),
        id
      );
  }

  public recoverSending():
    number {
    const now =
      new Date()
        .toISOString();

    const result =
      this.database
        .prepare(`
          UPDATE scheduler_notifications
          SET
            status = 'failed',
            updated_at = ?,
            last_error =
              'Manager restarted while this notification was being delivered.'
          WHERE status = 'sending'
        `)
        .run(
          now
        );

    return result.changes;
  }

  private map(
    row:
      NotificationRow
  ): SchedulerNotification {
    return {
      id:
        row.id,

      jobId:
        row.job_id,

      destinationId:
        row.destination_id,

      phase:
        row.phase,

      minutesBefore:
        row.minutes_before,

      messageTemplate:
        row.message_template,

      status:
        row.status,

      dueAt:
        row.due_at,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,

      sentAt:
        row.sent_at,

      lastError:
        row.last_error
    };
  }
}