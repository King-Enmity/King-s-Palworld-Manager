import {
  randomUUID
} from "node:crypto";

import type {
  KpmDatabase
} from "../../database/database.js";

export type WebhookDestinationKind =
  | "discord"
  | "generic";

export type WebhookDeliveryStatus =
  | "sending"
  | "success"
  | "failed";

export interface WebhookDestination {
  id: string;

  name: string;

  kind:
    WebhookDestinationKind;

  enabled:
    boolean;

  urlHint:
    string;

  secretConfigured:
    true;

  createdAt:
    string;

  updatedAt:
    string;

  lastSentAt:
    string |
    null;

  lastStatus:
    "success" |
    "failed" |
    null;

  lastHttpStatus:
    number |
    null;

  lastError:
    string |
    null;
}

export interface StoredWebhookDestination
  extends WebhookDestination {
  secretJson:
    string;
}

export interface WebhookDelivery {
  id: string;

  destinationId:
    string;

  destinationName:
    string;

  eventType:
    string;

  status:
    WebhookDeliveryStatus;

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

interface DestinationRow {
  id: string;
  name: string;

  kind:
    WebhookDestinationKind;

  enabled:
    number;

  url_secret_json:
    string;

  url_hint:
    string;

  created_at:
    string;

  updated_at:
    string;

  last_sent_at:
    string |
    null;

  last_status:
    "success" |
    "failed" |
    null;

  last_http_status:
    number |
    null;

  last_error:
    string |
    null;
}

interface DeliveryRow {
  id: string;

  destination_id:
    string;

  destination_name:
    string;

  event_type:
    string;

  status:
    WebhookDeliveryStatus;

  created_at:
    string;

  completed_at:
    string |
    null;

  http_status:
    number |
    null;

  error:
    string |
    null;
}

export class WebhookRepository {
  public constructor(
    private readonly database:
      KpmDatabase
  ) {}

  public list():
    WebhookDestination[] {
    const rows =
      this.database
        .prepare(`
          SELECT *
          FROM webhook_destinations
          ORDER BY created_at DESC
        `)
        .all() as
          DestinationRow[];

    return rows.map(
      row =>
        this.mapDestination(
          row
        )
    );
  }

  public find(
    id:
      string
  ): WebhookDestination | null {
    const row =
      this.findRow(
        id
      );

    return row
      ? this.mapDestination(
          row
        )
      : null;
  }

  public findStored(
    id:
      string
  ): StoredWebhookDestination | null {
    const row =
      this.findRow(
        id
      );

    if (!row) {
      return null;
    }

    return {
      ...this.mapDestination(
        row
      ),

      secretJson:
        row.url_secret_json
    };
  }

  public create(
    input: {
      name: string;

      kind:
        WebhookDestinationKind;

      enabled:
        boolean;

      secretJson:
        string;

      urlHint:
        string;
    }
  ): WebhookDestination {
    const id =
      randomUUID();

    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        INSERT INTO webhook_destinations (
          id,
          name,
          kind,
          enabled,
          url_secret_json,
          url_hint,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.name,
        input.kind,
        input.enabled
          ? 1
          : 0,
        input.secretJson,
        input.urlHint,
        now,
        now
      );

    const created =
      this.find(
        id
      );

    if (!created) {
      throw new Error(
        "Created webhook destination could not be read."
      );
    }

    return created;
  }

  public update(
    id:
      string,

    input: {
      name?:
        string |
        undefined;

      enabled?:
        boolean |
        undefined;

      secretJson?:
        string |
        undefined;

      urlHint?:
        string |
        undefined;
    }
  ): WebhookDestination | null {
    const current =
      this.findStored(
        id
      );

    if (!current) {
      return null;
    }

    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE webhook_destinations
        SET
          name = ?,
          enabled = ?,
          url_secret_json = ?,
          url_hint = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.name ??
          current.name,

        (
          input.enabled ??
          current.enabled
        )
          ? 1
          : 0,

        input.secretJson ??
          current.secretJson,

        input.urlHint ??
          current.urlHint,

        now,

        id
      );

    return this.find(
      id
    );
  }

  public delete(
    id:
      string
  ): boolean {
    const result =
      this.database
        .prepare(`
          DELETE FROM webhook_destinations
          WHERE id = ?
        `)
        .run(
          id
        );

    return (
      result.changes ===
      1
    );
  }

  public beginDelivery(
    destinationId:
      string,

    eventType:
      string
  ): string {
    const id =
      randomUUID();

    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        INSERT INTO webhook_deliveries (
          id,
          destination_id,
          event_type,
          status,
          created_at
        )
        VALUES (?, ?, ?, 'sending', ?)
      `)
      .run(
        id,
        destinationId,
        eventType,
        now
      );

    return id;
  }

  public completeDelivery(
    id:
      string,

    httpStatus:
      number
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE webhook_deliveries
        SET
          status = 'success',
          completed_at = ?,
          http_status = ?,
          error = NULL
        WHERE id = ?
      `)
      .run(
        now,
        httpStatus,
        id
      );
  }

  public failDelivery(
    id:
      string,

    error:
      string,

    httpStatus:
      number |
      null
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE webhook_deliveries
        SET
          status = 'failed',
          completed_at = ?,
          http_status = ?,
          error = ?
        WHERE id = ?
      `)
      .run(
        now,
        httpStatus,
        error.slice(
          0,
          2048
        ),
        id
      );
  }

  public recordDestinationResult(
    destinationId:
      string,

    input: {
      success:
        boolean;

      httpStatus:
        number |
        null;

      error:
        string |
        null;
    }
  ): void {
    const now =
      new Date()
        .toISOString();

    this.database
      .prepare(`
        UPDATE webhook_destinations
        SET
          last_sent_at = ?,
          last_status = ?,
          last_http_status = ?,
          last_error = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        now,

        input.success
          ? "success"
          : "failed",

        input.httpStatus,

        input.error
          ? input.error.slice(
              0,
              2048
            )
          : null,

        now,

        destinationId
      );
  }

  public listDeliveries(
    limit:
      number
  ): WebhookDelivery[] {
    const rows =
      this.database
        .prepare(`
          SELECT
            deliveries.id,
            deliveries.destination_id,
            destinations.name
              AS destination_name,
            deliveries.event_type,
            deliveries.status,
            deliveries.created_at,
            deliveries.completed_at,
            deliveries.http_status,
            deliveries.error
          FROM webhook_deliveries
            AS deliveries
          INNER JOIN webhook_destinations
            AS destinations
            ON destinations.id =
               deliveries.destination_id
          ORDER BY deliveries.created_at DESC
          LIMIT ?
        `)
        .all(
          limit
        ) as
          DeliveryRow[];

    return rows.map(
      row => ({
        id:
          row.id,

        destinationId:
          row.destination_id,

        destinationName:
          row.destination_name,

        eventType:
          row.event_type,

        status:
          row.status,

        createdAt:
          row.created_at,

        completedAt:
          row.completed_at,

        httpStatus:
          row.http_status,

        error:
          row.error
      })
    );
  }

  private findRow(
    id:
      string
  ): DestinationRow | null {
    return (
      this.database
        .prepare(`
          SELECT *
          FROM webhook_destinations
          WHERE id = ?
        `)
        .get(
          id
        ) as
          DestinationRow |
          undefined
    ) ??
      null;
  }

  private mapDestination(
    row:
      DestinationRow
  ): WebhookDestination {
    return {
      id:
        row.id,

      name:
        row.name,

      kind:
        row.kind,

      enabled:
        row.enabled ===
        1,

      urlHint:
        row.url_hint,

      secretConfigured:
        true,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,

      lastSentAt:
        row.last_sent_at,

      lastStatus:
        row.last_status,

      lastHttpStatus:
        row.last_http_status,

      lastError:
        row.last_error
    };
  }
}