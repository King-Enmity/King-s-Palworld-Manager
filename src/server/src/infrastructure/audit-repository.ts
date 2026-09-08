import { randomUUID } from "node:crypto";

import type { KpmDatabase } from "../database/database.js";

export type AuditSeverity =
  | "debug"
  | "info"
  | "warning"
  | "error";

export interface AuditEventInput {
  category: string;
  action: string;
  severity?: AuditSeverity;

  message: string;

  entityType?: string;
  entityId?: string;

  metadata?: Record<string, unknown>;
}

export class AuditRepository {
  public constructor(
    private readonly database: KpmDatabase
  ) {}

  public record(event: AuditEventInput): string {
    const id = randomUUID();
    const occurredAt = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO audit_events (
          id,
          occurred_at,
          category,
          action,
          severity,
          message,
          entity_type,
          entity_id,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        occurredAt,
        event.category,
        event.action,
        event.severity ?? "info",
        event.message,
        event.entityType ?? null,
        event.entityId ?? null,
        event.metadata
          ? JSON.stringify(event.metadata)
          : null
      );

    return id;
  }

  public count(): number {
    const result = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM audit_events
      `)
      .get() as { count: number };

    return result.count;
  }
}