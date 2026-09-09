import type {
  KpmDatabase
} from "../../database/database.js";

export type LogSource =
  | "manager"
  | "palworld";

export type LogSeverity =
  | "debug"
  | "info"
  | "warning"
  | "error";

export type PalworldConsoleStream =
  | "stdout"
  | "stderr";

export interface LogEntry {
  id:
    string;

  occurredAt:
    string;

  source:
    LogSource;

  severity:
    LogSeverity;

  category:
    string;

  action:
    string;

  message:
    string;

  entityType:
    string |
    null;

  entityId:
    string |
    null;

  metadata:
    Record<
      string,
      unknown
    > |
    null;

  stream:
    PalworldConsoleStream |
    null;

  truncated:
    boolean;
}

export interface LogListQuery {
  source?:
    LogSource |
    undefined;

  severities?:
    readonly LogSeverity[] |
    undefined;

  category?:
    string |
    undefined;

  search?:
    string |
    undefined;

  from?:
    string |
    undefined;

  to?:
    string |
    undefined;

  limit:
    number;

  offset:
    number;
}

export interface LogListResult {
  items:
    LogEntry[];

  total:
    number;

  limit:
    number;

  offset:
    number;
}

export interface LogSummary {
  hours:
    number;

  since:
    string;

  counts: {
    total:
      number;

    debug:
      number;

    info:
      number;

    warning:
      number;

    error:
      number;
  };

  bySource: {
    manager:
      number;

    palworld:
      number;
  };

  categories:
    string[];

  recentSignificant:
    LogEntry[];
}

interface UnifiedLogRow {
  source:
    LogSource;

  source_id:
    string;

  occurred_at:
    string;

  severity:
    LogSeverity;

  category:
    string;

  action:
    string;

  message:
    string;

  entity_type:
    string |
    null;

  entity_id:
    string |
    null;

  metadata_json:
    string |
    null;

  stream:
    PalworldConsoleStream |
    null;

  truncated:
    number;
}

interface CountRow {
  count:
    number;
}

interface SummaryRow {
  source:
    LogSource;

  severity:
    LogSeverity;

  count:
    number;
}

const MAX_CONSOLE_MESSAGE_LENGTH =
  16_384;

const MAX_CONSOLE_ROWS =
  100_000;

const CONSOLE_RETENTION_DAYS =
  14;

const UNIFIED_LOG_SOURCE = `
  SELECT
    'manager'
      AS source,

    id
      AS source_id,

    occurred_at,

    severity,

    category,

    action,

    message,

    entity_type,

    entity_id,

    metadata_json,

    NULL
      AS stream,

    0
      AS truncated

  FROM audit_events

  UNION ALL

  SELECT
    'palworld'
      AS source,

    CAST(id AS TEXT)
      AS source_id,

    occurred_at,

    CASE stream
      WHEN 'stderr'
        THEN 'error'
      ELSE 'info'
    END
      AS severity,

    'palworld-console'
      AS category,

    stream
      AS action,

    message,

    NULL
      AS entity_type,

    NULL
      AS entity_id,

    NULL
      AS metadata_json,

    stream,

    truncated

  FROM palworld_console_logs
`;

export class LogRepository {
  private consoleWritesSincePrune =
    0;

  public constructor(
    private readonly database:
      KpmDatabase
  ) {
    this.pruneConsoleLogs();
  }

  public recordPalworldConsole(
    stream:
      PalworldConsoleStream,

    input:
      string
  ): number | null {
    const cleaned =
      input
        .replace(
          /\u0000/g,
          ""
        )
        .trimEnd();

    if (
      cleaned
        .trim()
        .length ===
      0
    ) {
      return null;
    }

    const truncated =
      cleaned.length >
      MAX_CONSOLE_MESSAGE_LENGTH;

    const message =
      cleaned.slice(
        0,
        MAX_CONSOLE_MESSAGE_LENGTH
      );

    const result =
      this.database
        .prepare(`
          INSERT INTO palworld_console_logs (
            occurred_at,
            stream,
            message,
            truncated
          )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          new Date()
            .toISOString(),

          stream,

          message,

          truncated
            ? 1
            : 0
        );

    this.consoleWritesSincePrune +=
      1;

    if (
      this.consoleWritesSincePrune >=
      250
    ) {
      this.consoleWritesSincePrune =
        0;

      this.pruneConsoleLogs();
    }

    return Number(
      result.lastInsertRowid
    );
  }

  public list(
    query:
      LogListQuery
  ): LogListResult {
    const where =
      this.buildWhere(
        query
      );

    const totalRow =
      this.database
        .prepare(`
          SELECT
            COUNT(*) AS count
          FROM (
            ${UNIFIED_LOG_SOURCE}
          )
          ${where.sql}
        `)
        .get(
          ...where.parameters
        ) as
          CountRow;

    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM (
            ${UNIFIED_LOG_SOURCE}
          )
          ${where.sql}
          ORDER BY
            occurred_at DESC,
            source_id DESC
          LIMIT ?
          OFFSET ?
        `)
        .all(
          ...where.parameters,
          query.limit,
          query.offset
        ) as
          UnifiedLogRow[];

    return {
      items:
        rows.map(
          row =>
            this.mapRow(
              row
            )
        ),

      total:
        totalRow.count,

      limit:
        query.limit,

      offset:
        query.offset
    };
  }

  public summary(
    hours:
      number
  ): LogSummary {
    const since =
      new Date(
        Date.now() -
        hours *
        60 *
        60 *
        1000
      ).toISOString();

    const rows =
      this.database
        .prepare(`
          SELECT
            source,
            severity,
            COUNT(*) AS count

          FROM (
            ${UNIFIED_LOG_SOURCE}
          )

          WHERE
            occurred_at >= ?

          GROUP BY
            source,
            severity
        `)
        .all(
          since
        ) as
          SummaryRow[];

    const counts = {
      total:
        0,

      debug:
        0,

      info:
        0,

      warning:
        0,

      error:
        0
    };

    const bySource = {
      manager:
        0,

      palworld:
        0
    };

    for (
      const row
      of rows
    ) {
      counts.total +=
        row.count;

      counts[
        row.severity
      ] +=
        row.count;

      bySource[
        row.source
      ] +=
        row.count;
    }

    return {
      hours,

      since,

      counts,

      bySource,

      categories:
        this.categories(),

      recentSignificant:
        this.list({
          severities: [
            "warning",
            "error"
          ],

          from:
            since,

          limit:
            5,

          offset:
            0
        }).items
    };
  }

  public categories():
    string[] {
    const rows =
      this.database
        .prepare(`
          SELECT DISTINCT
            category

          FROM (
            ${UNIFIED_LOG_SOURCE}
          )

          ORDER BY
            category COLLATE NOCASE ASC
        `)
        .all() as
          Array<{
            category:
              string;
          }>;

    return rows.map(
      row =>
        row.category
    );
  }

  public pruneConsoleLogs():
    void {
    const cutoff =
      new Date(
        Date.now() -
        CONSOLE_RETENTION_DAYS *
        24 *
        60 *
        60 *
        1000
      ).toISOString();

    const transaction =
      this.database
        .transaction(
          () => {
            this.database
              .prepare(`
                DELETE FROM palworld_console_logs
                WHERE occurred_at < ?
              `)
              .run(
                cutoff
              );

            const count =
              this.database
                .prepare(`
                  SELECT
                    COUNT(*) AS count
                  FROM palworld_console_logs
                `)
                .get() as
                  CountRow;

            if (
              count.count <=
              MAX_CONSOLE_ROWS
            ) {
              return;
            }

            this.database
              .prepare(`
                DELETE FROM palworld_console_logs
                WHERE id NOT IN (
                  SELECT id
                  FROM palworld_console_logs
                  ORDER BY id DESC
                  LIMIT ?
                )
              `)
              .run(
                MAX_CONSOLE_ROWS
              );
          }
        );

    transaction();
  }

  private buildWhere(
    query:
      LogListQuery
  ): {
    sql:
      string;

    parameters:
      Array<
        string |
        number
      >;
  } {
    const clauses:
      string[] = [];

    const parameters:
      Array<
        string |
        number
      > = [];

    if (
      query.source
    ) {
      clauses.push(
        "source = ?"
      );

      parameters.push(
        query.source
      );
    }

    if (
      query.severities &&
      query.severities.length >
        0
    ) {
      clauses.push(
        `severity IN (${
          query.severities
            .map(
              () =>
                "?"
            )
            .join(
              ", "
            )
        })`
      );

      parameters.push(
        ...query.severities
      );
    }

    if (
      query.category
    ) {
      clauses.push(
        "category = ?"
      );

      parameters.push(
        query.category
      );
    }

    if (
      query.search
    ) {
      const pattern =
        `%${query.search}%`;

      clauses.push(`
        (
          message LIKE ?
          OR category LIKE ?
          OR action LIKE ?
          OR COALESCE(
            entity_type,
            ''
          ) LIKE ?
          OR COALESCE(
            entity_id,
            ''
          ) LIKE ?
        )
      `);

      parameters.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern
      );
    }

    if (
      query.from
    ) {
      clauses.push(
        "occurred_at >= ?"
      );

      parameters.push(
        query.from
      );
    }

    if (
      query.to
    ) {
      clauses.push(
        "occurred_at <= ?"
      );

      parameters.push(
        query.to
      );
    }

    return {
      sql:
        clauses.length >
          0
          ? `WHERE ${
              clauses.join(
                " AND "
              )
            }`
          : "",

      parameters
    };
  }

  private mapRow(
    row:
      UnifiedLogRow
  ): LogEntry {
    return {
      id:
        row.source ===
          "manager"
          ? row.source_id
          : `palworld:${row.source_id}`,

      occurredAt:
        row.occurred_at,

      source:
        row.source,

      severity:
        row.severity,

      category:
        row.category,

      action:
        row.action,

      message:
        row.message,

      entityType:
        row.entity_type,

      entityId:
        row.entity_id,

      metadata:
        this.parseMetadata(
          row.metadata_json
        ),

      stream:
        row.stream,

      truncated:
        row.truncated ===
        1
    };
  }

  private parseMetadata(
    value:
      string |
      null
  ): Record<
    string,
    unknown
  > | null {
    if (!value) {
      return null;
    }

    try {
      const parsed:
        unknown =
          JSON.parse(
            value
          );

      if (
        typeof parsed ===
          "object" &&
        parsed !==
          null &&
        !Array.isArray(
          parsed
        )
      ) {
        return parsed as
          Record<
            string,
            unknown
          >;
      }
    } catch {
      return null;
    }

    return null;
  }
}