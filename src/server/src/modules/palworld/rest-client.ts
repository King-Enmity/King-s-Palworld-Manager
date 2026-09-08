import type {
  ZodType
} from "zod";

import type {
  PalworldRestConfigurationSnapshot
} from "./rest-configuration.js";

import {
  PalworldRestConfigurationProvider
} from "./rest-configuration.js";

import {
  PalworldRestInfoSchema,
  PalworldRestMetricsSchema,
  PalworldRestPlayersSchema,
  PalworldRestSettingsSchema,
  type PalworldRestInfo,
  type PalworldRestMetrics,
  type PalworldRestPlayers,
  type PalworldRestSettings
} from "./rest-schemas.js";

const MAX_REST_RESPONSE_SIZE =
  4 * 1024 * 1024;

export interface PalworldRestStatus {
  configured: boolean;

  liveSettingsPresent: boolean;
  liveSettingsValid: boolean;

  enabled: boolean;

  host: "127.0.0.1";
  port: number;

  usernameConfigured: boolean;
  adminPasswordConfigured: boolean;

  reachable: boolean;
  authenticated:
    boolean | null;

  available: boolean;

  checkedAt: string;

  error:
    | {
        code: string;
        message: string;
      }
    | null;
}

export class PalworldRestError
  extends Error {
  public constructor(
    message: string,

    public readonly statusCode:
      number,

    public readonly code:
      string,

    public readonly upstreamStatus:
      number | null = null
  ) {
    super(message);
  }
}

interface ReadyConnection {
  username: string;
  password: string;
  port: number;
}

export class PalworldRestClient {
  public constructor(
    private readonly configuration:
      PalworldRestConfigurationProvider,

    private readonly timeoutMs:
      number
  ) {}

  public async status():
    Promise<PalworldRestStatus> {
    const configuration =
      this.configuration
        .snapshot();

    const base =
      this.createStatusBase(
        configuration
      );

    try {
      await this.info();

      return {
        ...base,

        reachable:
          true,

        authenticated:
          true,

        available:
          true,

        error:
          null
      };
    } catch (
      error
    ) {
      if (
        error instanceof
        PalworldRestError
      ) {
        const reachable =
          error.upstreamStatus !==
          null;

        const authenticated =
          error.upstreamStatus ===
          401
            ? false
            : reachable
              ? null
              : null;

        return {
          ...base,

          reachable,

          authenticated,

          available:
            false,

          error: {
            code:
              error.code,

            message:
              error.message
          }
        };
      }

      return {
        ...base,

        reachable:
          false,

        authenticated:
          null,

        available:
          false,

        error: {
          code:
            "palworld-rest-status-failed",

          message:
            "Palworld REST status could not be determined."
        }
      };
    }
  }

  public info():
    Promise<PalworldRestInfo> {
    return this.requestJson(
      "GET",
      "/info",
      PalworldRestInfoSchema
    );
  }

  public players():
    Promise<PalworldRestPlayers> {
    return this.requestJson(
      "GET",
      "/players",
      PalworldRestPlayersSchema
    );
  }

  public metrics():
    Promise<PalworldRestMetrics> {
    return this.requestJson(
      "GET",
      "/metrics",
      PalworldRestMetricsSchema
    );
  }

  public settings():
    Promise<PalworldRestSettings> {
    return this.requestJson(
      "GET",
      "/settings",
      PalworldRestSettingsSchema
    );
  }

  public announce(
    message: string
  ): Promise<void> {
    return this.requestVoid(
      "POST",
      "/announce",
      {
        message
      }
    );
  }

  public save():
    Promise<void> {
    return this.requestVoid(
      "POST",
      "/save"
    );
  }

  private createStatusBase(
    configuration:
      PalworldRestConfigurationSnapshot
  ): PalworldRestStatus {
    return {
      configured:
        configuration.configured,

      liveSettingsPresent:
        configuration.liveSettingsPresent,

      liveSettingsValid:
        configuration.liveSettingsValid,

      enabled:
        configuration.enabled,

      host:
        "127.0.0.1",

      port:
        configuration.port,

      usernameConfigured:
        configuration.usernameConfigured,

      adminPasswordConfigured:
        configuration.adminPasswordConfigured,

      reachable:
        false,

      authenticated:
        null,

      available:
        false,

      checkedAt:
        new Date()
          .toISOString(),

      error:
        null
    };
  }

  private readyConnection():
    ReadyConnection {
    const resolved =
      this.configuration
        .resolve();

    const snapshot =
      resolved.snapshot;

    if (!snapshot.configured) {
      throw new PalworldRestError(
        "Palworld is not configured.",
        409,
        "palworld-not-configured"
      );
    }

    if (
      !snapshot.liveSettingsPresent ||
      !snapshot.liveSettingsValid
    ) {
      throw new PalworldRestError(
        "Live Palworld settings are unavailable.",
        409,
        "palworld-rest-settings-unavailable"
      );
    }

    if (
      snapshot.errors.length >
      0
    ) {
      throw new PalworldRestError(
        "Palworld REST configuration is invalid.",
        409,
        "palworld-rest-configuration-invalid"
      );
    }

    if (!snapshot.enabled) {
      throw new PalworldRestError(
        "Palworld REST API is disabled.",
        409,
        "palworld-rest-disabled"
      );
    }

    if (
      !resolved.password
    ) {
      throw new PalworldRestError(
        "Palworld AdminPassword is not configured.",
        409,
        "palworld-rest-credentials-missing"
      );
    }

    return {
      username:
        resolved.username,

      password:
        resolved.password,

      port:
        snapshot.port
    };
  }

  private async requestJson<T>(
    method:
      "GET" | "POST",

    path:
      string,

    schema:
      ZodType<T>,

    body?:
      unknown
  ): Promise<T> {
    return this.request(
      method,
      path,
      body,

      async (
        response
      ) => {
        const contentLength =
          response.headers.get(
            "content-length"
          );

        if (
          contentLength &&
          Number(contentLength) >
            MAX_REST_RESPONSE_SIZE
        ) {
          throw new PalworldRestError(
            "Palworld REST response exceeded the allowed size.",
            502,
            "palworld-rest-response-too-large",
            response.status
          );
        }

        const text =
          await response.text();

        if (
          Buffer.byteLength(
            text,
            "utf8"
          ) >
          MAX_REST_RESPONSE_SIZE
        ) {
          throw new PalworldRestError(
            "Palworld REST response exceeded the allowed size.",
            502,
            "palworld-rest-response-too-large",
            response.status
          );
        }

        let json:
          unknown;

        try {
          json =
            JSON.parse(
              text
            );
        } catch {
          throw new PalworldRestError(
            "Palworld REST returned invalid JSON.",
            502,
            "palworld-rest-invalid-json",
            response.status
          );
        }

        const parsed =
          schema.safeParse(
            json
          );

        if (!parsed.success) {
          throw new PalworldRestError(
            "Palworld REST returned an unexpected response.",
            502,
            "palworld-rest-invalid-response",
            response.status
          );
        }

        return parsed.data;
      }
    );
  }

  private async requestVoid(
    method:
      "POST",

    path:
      string,

    body?:
      unknown
  ): Promise<void> {
    await this.request(
      method,
      path,
      body,

      async () =>
        undefined
    );
  }

  private async request<T>(
    method:
      "GET" | "POST",

    path:
      string,

    body:
      unknown,

    read:
      (
        response:
          Response
      ) => Promise<T>
  ): Promise<T> {
    const connection =
      this.readyConnection();

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => {
          controller.abort();
        },

        this.timeoutMs
      );

    const authorization =
      Buffer
        .from(
          `${connection.username}:${connection.password}`,
          "utf8"
        )
        .toString(
          "base64"
        );

    const headers:
      Record<string, string> = {
        Accept:
          "application/json",

        Authorization:
          `Basic ${authorization}`
      };

    let encodedBody:
      string | undefined;

    if (body !== undefined) {
      headers["Content-Type"] =
        "application/json";

      encodedBody =
        JSON.stringify(
          body
        );
    }

    const url =
      `http://127.0.0.1:${connection.port}/v1/api${path}`;

    try {
      const requestInit:
        RequestInit = {
          method,

          headers,

          signal:
            controller.signal,

          redirect:
            "error"
        };

      if (
        encodedBody !==
        undefined
      ) {
        requestInit.body =
          encodedBody;
      }

      const response =
        await fetch(
          url,
          requestInit
        );

      if (!response.ok) {
        throw this.fromUpstreamStatus(
          response.status
        );
      }

      return await read(
        response
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        PalworldRestError
      ) {
        throw error;
      }

      if (
        controller.signal
          .aborted
      ) {
        throw new PalworldRestError(
          "Palworld REST request timed out.",
          504,
          "palworld-rest-timeout"
        );
      }

      throw new PalworldRestError(
        "Palworld REST API is unavailable.",
        502,
        "palworld-rest-unavailable"
      );
    } finally {
      clearTimeout(
        timer
      );
    }
  }

  private fromUpstreamStatus(
    status:
      number
  ): PalworldRestError {
    if (status === 401) {
      return new PalworldRestError(
        "Palworld REST authentication failed.",
        502,
        "palworld-rest-unauthorized",
        status
      );
    }

    if (status === 400) {
      return new PalworldRestError(
        "Palworld REST rejected the request.",
        502,
        "palworld-rest-request-rejected",
        status
      );
    }

    return new PalworldRestError(
      "Palworld REST returned an upstream error.",
      502,
      "palworld-rest-upstream-error",
      status
    );
  }
}