import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  WebhookHttpClient,
  WebhookHttpError
} from "./webhook-http-client.js";

import {
  WebhookRepository,
  type WebhookDestination,
  type WebhookDestinationKind,
  type WebhookDelivery
} from "./webhook-repository.js";

import {
  WebhookSecretVault,
  type SealedWebhookSecret
} from "./webhook-secret-vault.js";

export class WebhookServiceError
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

export interface WebhookServiceDependencies {
  repository:
    WebhookRepository;

  audit:
    AuditRepository;

  vault:
    WebhookSecretVault;

  http:
    WebhookHttpClient;
}

export class WebhookService {
  public constructor(
    private readonly dependencies:
      WebhookServiceDependencies
  ) {}

  public list():
    WebhookDestination[] {
    return this.dependencies
      .repository
      .list();
  }

  public deliveries(
    limit:
      number
  ): WebhookDelivery[] {
    return this.dependencies
      .repository
      .listDeliveries(
        limit
      );
  }

  public create(
    input: {
      name: string;

      kind:
        WebhookDestinationKind;

      url:
        string;

      enabled:
        boolean;
    }
  ): WebhookDestination {
    const normalizedUrl =
      this.normalizeUrl(
        input.kind,
        input.url
      );

    const secret =
      this.dependencies
        .vault
        .seal(
          normalizedUrl
        );

    const destination =
      this.dependencies
        .repository
        .create({
          name:
            input.name,

          kind:
            input.kind,

          enabled:
            input.enabled,

          secretJson:
            JSON.stringify(
              secret
            ),

          urlHint:
            this.dependencies
              .http
              .urlHint(
                input.kind,
                normalizedUrl
              )
        });

    this.dependencies
      .audit
      .record({
        category:
          "webhook",

        action:
          "created",

        message:
          "Webhook destination created.",

        entityType:
          "webhook-destination",

        entityId:
          destination.id,

        metadata: {
          kind:
            destination.kind,

          enabled:
            destination.enabled
        }
      });

    return destination;
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

      url?:
        string |
        undefined;
    }
  ): WebhookDestination {
    const current =
      this.dependencies
        .repository
        .findStored(
          id
        );

    if (!current) {
      throw new WebhookServiceError(
        "Webhook destination was not found.",
        404,
        "webhook-not-found"
      );
    }

    let secretJson:
      string |
      undefined;

    let urlHint:
      string |
      undefined;

    if (
      input.url !==
      undefined
    ) {
      const normalizedUrl =
        this.normalizeUrl(
          current.kind,
          input.url
        );

      secretJson =
        JSON.stringify(
          this.dependencies
            .vault
            .seal(
              normalizedUrl
            )
        );

      urlHint =
        this.dependencies
          .http
          .urlHint(
            current.kind,
            normalizedUrl
          );
    }

    const updated =
      this.dependencies
        .repository
        .update(
          id,
          {
            name:
              input.name,

            enabled:
              input.enabled,

            secretJson,

            urlHint
          }
        );

    if (!updated) {
      throw new WebhookServiceError(
        "Webhook destination was not found.",
        404,
        "webhook-not-found"
      );
    }

    this.dependencies
      .audit
      .record({
        category:
          "webhook",

        action:
          "updated",

        message:
          "Webhook destination updated.",

        entityType:
          "webhook-destination",

        entityId:
          id,

        metadata: {
          urlReplaced:
            input.url !==
            undefined,

          enabled:
            updated.enabled
        }
      });

    return updated;
  }

  public delete(
    id:
      string
  ): void {
    const removed =
      this.dependencies
        .repository
        .delete(
          id
        );

    if (!removed) {
      throw new WebhookServiceError(
        "Webhook destination was not found.",
        404,
        "webhook-not-found"
      );
    }

    this.dependencies
      .audit
      .record({
        category:
          "webhook",

        action:
          "deleted",

        message:
          "Webhook destination deleted.",

        entityType:
          "webhook-destination",

        entityId:
          id
      });
  }

  public test(
    id:
      string,

    message:
      string
  ) {
    return this.deliver(
      id,
      {
        eventType:
          "test",

        message,

        data:
          undefined,

        allowDisabled:
          true
      }
    );
  }

  public send(
    id:
      string,

    input: {
      eventType:
        string;

      message:
        string;

      data?:
        Record<
          string,
          unknown
        > |
        undefined;
    }
  ) {
    return this.deliver(
      id,
      {
        ...input,

        allowDisabled:
          false
      }
    );
  }

  private async deliver(
    id:
      string,

    input: {
      eventType:
        string;

      message:
        string;

      data?:
        Record<
          string,
          unknown
        > |
        undefined;

      allowDisabled:
        boolean;
    }
  ) {
    const destination =
      this.dependencies
        .repository
        .findStored(
          id
        );

    if (!destination) {
      throw new WebhookServiceError(
        "Webhook destination was not found.",
        404,
        "webhook-not-found"
      );
    }

    if (
      !destination.enabled &&
      !input.allowDisabled
    ) {
      throw new WebhookServiceError(
        "Webhook destination is disabled.",
        409,
        "webhook-disabled"
      );
    }

    const message =
      input.message
        .trim();

    if (!message) {
      throw new WebhookServiceError(
        "Webhook message cannot be empty.",
        400,
        "webhook-message-empty"
      );
    }

    if (
      message.length >
      2000
    ) {
      throw new WebhookServiceError(
        "Webhook message cannot exceed 2000 characters.",
        400,
        "webhook-message-too-long"
      );
    }

    const secret =
      this.parseSecret(
        destination.secretJson
      );

    let url:
      string;

    try {
      url =
        this.dependencies
          .vault
          .open(
            secret
          );
    } catch {
      throw new WebhookServiceError(
        "Stored webhook secret could not be decrypted.",
        500,
        "webhook-secret-invalid"
      );
    }

    const payload =
      destination.kind ===
        "discord"
        ? {
            content:
              message,

            allowed_mentions: {
              parse:
                []
            }
          }
        : {
            source:
              "kings-palworld-manager",

            eventType:
              input.eventType,

            message,

            sentAt:
              new Date()
                .toISOString(),

            data:
              input.data ??
              {}
          };

    const deliveryId =
      this.dependencies
        .repository
        .beginDelivery(
          destination.id,
          input.eventType
        );

    try {
      const result =
        await this.dependencies
          .http
          .post(
            destination.kind,
            url,
            payload
          );

      this.dependencies
        .repository
        .completeDelivery(
          deliveryId,
          result.statusCode
        );

      this.dependencies
        .repository
        .recordDestinationResult(
          destination.id,
          {
            success:
              true,

            httpStatus:
              result.statusCode,

            error:
              null
          }
        );

      this.dependencies
        .audit
        .record({
          category:
            "webhook",

          action:
            "delivered",

          message:
            "Webhook message delivered.",

          entityType:
            "webhook-destination",

          entityId:
            destination.id,

          metadata: {
            kind:
              destination.kind,

            eventType:
              input.eventType,

            httpStatus:
              result.statusCode,

            messageLength:
              message.length
          }
        });

      return {
        sent:
          true,

        deliveryId,

        destinationId:
          destination.id,

        httpStatus:
          result.statusCode
      };
    } catch (
      error
    ) {
      const httpStatus =
        error instanceof
          WebhookHttpError
          ? error.httpStatus
          : null;

      const errorMessage =
        error instanceof
          Error
          ? error.message
          : "Webhook delivery failed.";

      this.dependencies
        .repository
        .failDelivery(
          deliveryId,
          errorMessage,
          httpStatus
        );

      this.dependencies
        .repository
        .recordDestinationResult(
          destination.id,
          {
            success:
              false,

            httpStatus,

            error:
              errorMessage
          }
        );

      this.dependencies
        .audit
        .record({
          category:
            "webhook",

          action:
            "delivery-failed",

          severity:
            "warning",

          message:
            "Webhook delivery failed.",

          entityType:
            "webhook-destination",

          entityId:
            destination.id,

          metadata: {
            kind:
              destination.kind,

            eventType:
              input.eventType,

            httpStatus,

            errorType:
              error instanceof
                Error
                ? error.name
                : typeof error
          }
        });

      throw new WebhookServiceError(
        errorMessage,
        502,
        "webhook-delivery-failed"
      );
    }
  }

  private normalizeUrl(
    kind:
      WebhookDestinationKind,

    url:
      string
  ): string {
    try {
      return this.dependencies
        .http
        .normalizeUrl(
          kind,
          url
        );
    } catch (
      error
    ) {
      throw new WebhookServiceError(
        error instanceof
          Error
          ? error.message
          : "Webhook URL is invalid.",
        400,
        "webhook-url-invalid"
      );
    }
  }

  private parseSecret(
    value:
      string
  ): SealedWebhookSecret {
    let parsed:
      unknown;

    try {
      parsed =
        JSON.parse(
          value
        );
    } catch {
      throw new WebhookServiceError(
        "Stored webhook secret is invalid.",
        500,
        "webhook-secret-invalid"
      );
    }

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null
    ) {
      throw new WebhookServiceError(
        "Stored webhook secret is invalid.",
        500,
        "webhook-secret-invalid"
      );
    }

    const candidate =
      parsed as
        Partial<
          SealedWebhookSecret
        >;

    if (
      typeof candidate.iv !==
        "string" ||
      typeof candidate.tag !==
        "string" ||
      typeof candidate.ciphertext !==
        "string"
    ) {
      throw new WebhookServiceError(
        "Stored webhook secret is invalid.",
        500,
        "webhook-secret-invalid"
      );
    }

    return {
      iv:
        candidate.iv,

      tag:
        candidate.tag,

      ciphertext:
        candidate.ciphertext
    };
  }
}