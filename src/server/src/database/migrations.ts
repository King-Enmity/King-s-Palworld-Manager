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