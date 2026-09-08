import {
  randomUUID
} from "node:crypto";

import type {
  KpmDatabase
} from "../../database/database.js";

export type SchedulerActionType =
  | "start"
  | "stop"
  | "restart"
  | "save"
  | "announce"
  | "settings";

export type SchedulerJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SchedulerJob {
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

interface SchedulerRow {
  id: string;
  name: string;

  action_type:
    SchedulerActionType;

  payload_json: string;

  scheduled_for: string;

  status:
    SchedulerJobStatus;

  created_at: string;
  updated_at: string;

  started_at:
    string |
    null;

  completed_at:
    string |
    null;

  cancelled_at:
    string |
    null;

  last_error:
    string |
    null;
}

export class SchedulerRepository {
  public constructor(
    private readonly database:
      KpmDatabase
  ) {}

  public list():
    SchedulerJob[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM scheduler_jobs
          ORDER BY scheduled_for ASC
        `)
        .all() as
          SchedulerRow[];

    return rows.map(
      row =>
        this.map(
          row
        )
    );
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
    const id =
      randomUUID();

    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        INSERT INTO scheduler_jobs (
          id,
          name,
          action_type,
          payload_json,
          scheduled_for,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .run(
        id,
        input.name,
        input.actionType,
        JSON.stringify(
          input.payload
        ),
        input.scheduledFor,
        now,
        now
      );

    return this.get(
      id
    );
  }

  public get(
    id:
      string
  ): SchedulerJob {
    const row =
      this.database
        .prepare(`
          SELECT *
          FROM scheduler_jobs
          WHERE id = ?
        `)
        .get(
          id
        ) as
          SchedulerRow |
          undefined;

    if (!row) {
      throw new Error(
        "Scheduled job was not found."
      );
    }

    return this.map(
      row
    );
  }

  public claimNextDue(
    now:
      string
  ): SchedulerJob | null {
    const transaction =
      this.database
        .transaction(
          () => {
            const row =
              this.database
                .prepare(`
                  SELECT *
                  FROM scheduler_jobs
                  WHERE
                    status = 'pending'
                    AND scheduled_for <= ?
                  ORDER BY scheduled_for ASC
                  LIMIT 1
                `)
                .get(
                  now
                ) as
                  SchedulerRow |
                  undefined;

            if (!row) {
              return null;
            }

            const startedAt =
              new Date()
                .toISOString();

            const result =
              this.database
                .prepare(`
                  UPDATE scheduler_jobs
                  SET
                    status = 'running',
                    started_at = ?,
                    updated_at = ?,
                    last_error = NULL
                  WHERE
                    id = ?
                    AND status = 'pending'
                `)
                .run(
                  startedAt,
                  startedAt,
                  row.id
                );

            if (
              result.changes !==
              1
            ) {
              return null;
            }

            return this.get(
              row.id
            );
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
        UPDATE scheduler_jobs
        SET
          status = 'completed',
          completed_at = ?,
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

    message:
      string
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE scheduler_jobs
        SET
          status = 'failed',
          completed_at = ?,
          updated_at = ?,
          last_error = ?
        WHERE id = ?
      `)
      .run(
        now,
        now,
        message.slice(
          0,
          2048
        ),
        id
      );
  }

  public cancel(
    id:
      string
  ): SchedulerJob {
    const now =
      new Date()
        .toISOString();

    const result =
      this.database
        .prepare(`
          UPDATE scheduler_jobs
          SET
            status = 'cancelled',
            cancelled_at = ?,
            updated_at = ?
          WHERE
            id = ?
            AND status = 'pending'
        `)
        .run(
          now,
          now,
          id
        );

    if (
      result.changes !==
      1
    ) {
      throw new Error(
        "Only pending scheduled jobs can be cancelled."
      );
    }

    return this.get(
      id
    );
  }

  public delete(
    id:
      string
  ): void {
    const job =
      this.get(
        id
      );

    if (
      job.status ===
        "running"
    ) {
      throw new Error(
        "A running scheduled job cannot be deleted."
      );
    }

    this.database
      .prepare(`
        DELETE FROM scheduler_jobs
        WHERE id = ?
      `)
      .run(
        id
      );
  }

  public recoverInterrupted():
    number {
    const now =
      new Date()
        .toISOString();

    const result =
      this.database
        .prepare(`
          UPDATE scheduler_jobs
          SET
            status = 'failed',
            updated_at = ?,
            completed_at = ?,
            last_error =
              'Manager restarted while this job was running.'
          WHERE status = 'running'
        `)
        .run(
          now,
          now
        );

    return result.changes;
  }

  private map(
    row:
      SchedulerRow
  ): SchedulerJob {
    let payload:
      unknown = {};

    try {
      payload =
        JSON.parse(
          row.payload_json
        );
    } catch {
      payload = {};
    }

    return {
      id:
        row.id,

      name:
        row.name,

      actionType:
        row.action_type,

      payload,

      scheduledFor:
        row.scheduled_for,

      status:
        row.status,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,

      startedAt:
        row.started_at,

      completedAt:
        row.completed_at,

      cancelledAt:
        row.cancelled_at,

      lastError:
        row.last_error
    };
  }
}