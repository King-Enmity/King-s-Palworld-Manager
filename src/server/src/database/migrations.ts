import type Database from "better-sqlite3";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "initial_manager_state",
    sql: `
      CREATE TABLE system_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,

        category TEXT NOT NULL,
        action TEXT NOT NULL,

        severity TEXT NOT NULL
          CHECK (
            severity IN (
              'debug',
              'info',
              'warning',
              'error'
            )
          ),

        message TEXT NOT NULL,

        entity_type TEXT,
        entity_id TEXT,

        metadata_json TEXT
      ) STRICT;

      CREATE INDEX idx_audit_events_occurred_at
        ON audit_events(occurred_at DESC);

      CREATE INDEX idx_audit_events_category
        ON audit_events(category);
    `
  },
  {
    version: 2,
    name: "scheduler_jobs",
    sql: `
      CREATE TABLE scheduler_jobs (
        id TEXT PRIMARY KEY,

        name TEXT NOT NULL,

        action_type TEXT NOT NULL
          CHECK (
            action_type IN (
              'start',
              'stop',
              'restart',
              'save',
              'announce',
              'settings'
            )
          ),

        payload_json TEXT NOT NULL,

        scheduled_for TEXT NOT NULL,

        status TEXT NOT NULL
          CHECK (
            status IN (
              'pending',
              'running',
              'completed',
              'failed',
              'cancelled'
            )
          ),

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        started_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,

        last_error TEXT
      ) STRICT;

      CREATE INDEX idx_scheduler_jobs_scheduled_for
        ON scheduler_jobs(
          status,
          scheduled_for
        );

      CREATE INDEX idx_scheduler_jobs_created_at
        ON scheduler_jobs(
          created_at DESC
        );
    `
  },
  {
    version: 3,
    name: "webhook_destinations",
    sql: `
      CREATE TABLE webhook_destinations (
        id TEXT PRIMARY KEY,

        name TEXT NOT NULL,

        kind TEXT NOT NULL
          CHECK (
            kind IN (
              'discord',
              'generic'
            )
          ),

        enabled INTEGER NOT NULL
          CHECK (
            enabled IN (
              0,
              1
            )
          ),

        url_secret_json TEXT NOT NULL,
        url_hint TEXT NOT NULL,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        last_sent_at TEXT,

        last_status TEXT
          CHECK (
            last_status IS NULL
            OR last_status IN (
              'success',
              'failed'
            )
          ),

        last_http_status INTEGER,
        last_error TEXT
      ) STRICT;

      CREATE TABLE webhook_deliveries (
        id TEXT PRIMARY KEY,

        destination_id TEXT NOT NULL
          REFERENCES webhook_destinations(id)
          ON DELETE CASCADE,

        event_type TEXT NOT NULL,

        status TEXT NOT NULL
          CHECK (
            status IN (
              'sending',
              'success',
              'failed'
            )
          ),

        created_at TEXT NOT NULL,
        completed_at TEXT,

        http_status INTEGER,
        error TEXT
      ) STRICT;

      CREATE INDEX idx_webhook_destinations_created_at
        ON webhook_destinations(
          created_at DESC
        );

      CREATE INDEX idx_webhook_deliveries_created_at
        ON webhook_deliveries(
          created_at DESC
        );

      CREATE INDEX idx_webhook_deliveries_destination
        ON webhook_deliveries(
          destination_id,
          created_at DESC
        );
    `
  },
  {
    version: 4,
    name: "scheduler_notifications",
    sql: `
      CREATE TABLE scheduler_notifications (
        id TEXT PRIMARY KEY,

        job_id TEXT NOT NULL
          REFERENCES scheduler_jobs(id)
          ON DELETE CASCADE,

        destination_id TEXT NOT NULL
          REFERENCES webhook_destinations(id)
          ON DELETE CASCADE,

        phase TEXT NOT NULL
          CHECK (
            phase IN (
              'before',
              'start',
              'success',
              'failure'
            )
          ),

        minutes_before INTEGER
          CHECK (
            (
              phase = 'before'
              AND minutes_before
                BETWEEN 1 AND 10080
            )
            OR
            (
              phase <> 'before'
              AND minutes_before IS NULL
            )
          ),

        message_template TEXT NOT NULL,

        status TEXT NOT NULL
          CHECK (
            status IN (
              'waiting',
              'pending',
              'sending',
              'sent',
              'failed',
              'cancelled'
            )
          ),

        due_at TEXT,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        sent_at TEXT,
        last_error TEXT
      ) STRICT;

      CREATE INDEX idx_scheduler_notifications_job
        ON scheduler_notifications(
          job_id,
          created_at
        );

      CREATE INDEX idx_scheduler_notifications_due
        ON scheduler_notifications(
          status,
          due_at
        );

      CREATE INDEX idx_scheduler_notifications_destination
        ON scheduler_notifications(
          destination_id,
          created_at
        );
    `
  },
  {
    version: 5,
    name: "palworld_console_logs",
    sql: `
      CREATE TABLE palworld_console_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        occurred_at TEXT NOT NULL,

        stream TEXT NOT NULL
          CHECK (
            stream IN (
              'stdout',
              'stderr'
            )
          ),

        message TEXT NOT NULL,

        truncated INTEGER NOT NULL
          CHECK (
            truncated IN (
              0,
              1
            )
          )
      ) STRICT;

      CREATE INDEX idx_palworld_console_logs_occurred_at
        ON palworld_console_logs(
          occurred_at DESC
        );

      CREATE INDEX idx_palworld_console_logs_stream
        ON palworld_console_logs(
          stream,
          occurred_at DESC
        );
    `
  }

];

export function applyMigrations(
  database: Database.Database
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const currentRow = database
    .prepare(`
      SELECT COALESCE(MAX(version), 0) AS version
      FROM schema_migrations
    `)
    .get() as { version: number };

  const applyMigration = database.transaction(
    (migration: Migration) => {
      database.exec(migration.sql);

      database
        .prepare(`
          INSERT INTO schema_migrations (
            version,
            name,
            applied_at
          )
          VALUES (?, ?, ?)
        `)
        .run(
          migration.version,
          migration.name,
          new Date().toISOString()
        );
    }
  );

  for (const migration of migrations) {
    if (migration.version > currentRow.version) {
      applyMigration(migration);
    }
  }
}