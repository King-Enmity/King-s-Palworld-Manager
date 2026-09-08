import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  PalworldRestClient,
  PalworldRestError,
  type PalworldRestStatus
} from "./rest-client.js";

import type {
  PalworldRestInfo,
  PalworldRestMetrics,
  PalworldRestPlayer,
  PalworldRestPlayers,
  PalworldRestSettings
} from "./rest-schemas.js";

import type {
  PalworldRuntimeSnapshot
} from "./runtime-state.js";

import {
  isSensitiveSetting
} from "./settings-validation.js";

export type PalworldLiveHealth =
  | "offline"
  | "transitioning"
  | "online"
  | "degraded"
  | "crashed";

export interface PalworldLiveError {
  source:
    | "rest"
    | "info"
    | "players"
    | "metrics";

  code: string;
  message: string;
}

export interface PalworldLiveSnapshot {
  observedAt: string;

  health:
    PalworldLiveHealth;

  runtime:
    PalworldRuntimeSnapshot;

  rest:
    PalworldRestStatus | null;

  info:
    PalworldRestInfo | null;

  players:
    PalworldRestPlayer[];

  metrics:
    PalworldRestMetrics | null;

  summary: {
    playerCount: number;
    maxPlayers: number | null;

    serverFps: number | null;
    serverFrameTimeMs: number | null;

    uptimeSeconds: number | null;
    worldDays: number | null;
    baseCampCount: number | null;
  };

  errors:
    PalworldLiveError[];
}

export class PalworldRestService {
  public constructor(
    private readonly client:
      PalworldRestClient,

    private readonly audit:
      AuditRepository
  ) {}

  public status():
    Promise<PalworldRestStatus> {
    return this.client
      .status();
  }

  public info():
    Promise<PalworldRestInfo> {
    return this.client
      .info();
  }

  public players():
    Promise<PalworldRestPlayers> {
    return this.client
      .players();
  }

  public metrics():
    Promise<PalworldRestMetrics> {
    return this.client
      .metrics();
  }

  public async live(
    runtime:
      PalworldRuntimeSnapshot
  ): Promise<PalworldLiveSnapshot> {
    const observedAt =
      new Date()
        .toISOString();

    if (
      runtime.status !==
      "running"
    ) {
      let health:
        PalworldLiveHealth =
          "offline";

      if (
        runtime.status ===
        "starting" ||
        runtime.status ===
        "stopping"
      ) {
        health =
          "transitioning";
      }

      if (
        runtime.status ===
        "crashed"
      ) {
        health =
          "crashed";
      }

      return {
        observedAt,

        health,

        runtime,

        rest:
          null,

        info:
          null,

        players:
          [],

        metrics:
          null,

        summary: {
          playerCount:
            0,

          maxPlayers:
            null,

          serverFps:
            null,

          serverFrameTimeMs:
            null,

          uptimeSeconds:
            null,

          worldDays:
            null,

          baseCampCount:
            null
        },

        errors:
          []
      };
    }

    const rest =
      await this.client
        .status();

    if (!rest.available) {
      return {
        observedAt,

        health:
          "degraded",

        runtime,

        rest,

        info:
          null,

        players:
          [],

        metrics:
          null,

        summary: {
          playerCount:
            0,

          maxPlayers:
            null,

          serverFps:
            null,

          serverFrameTimeMs:
            null,

          uptimeSeconds:
            null,

          worldDays:
            null,

          baseCampCount:
            null
        },

        errors:
          rest.error
            ? [
                {
                  source:
                    "rest",

                  code:
                    rest.error.code,

                  message:
                    rest.error.message
                }
              ]
            : []
      };
    }

    const [
      infoResult,
      playersResult,
      metricsResult
    ] =
      await Promise.allSettled([
        this.client.info(),
        this.client.players(),
        this.client.metrics()
      ]);

    const errors:
      PalworldLiveError[] =
        [];

    let info:
      PalworldRestInfo | null =
        null;

    let players:
      PalworldRestPlayer[] =
        [];

    let metrics:
      PalworldRestMetrics | null =
        null;

    if (
      infoResult.status ===
      "fulfilled"
    ) {
      info =
        infoResult.value;
    }

    if (
      infoResult.status ===
      "rejected"
    ) {
      errors.push(
        this.liveError(
          "info",
          infoResult.reason
        )
      );
    }

    if (
      playersResult.status ===
      "fulfilled"
    ) {
      players =
        playersResult
          .value
          .players;
    }

    if (
      playersResult.status ===
      "rejected"
    ) {
      errors.push(
        this.liveError(
          "players",
          playersResult.reason
        )
      );
    }

    if (
      metricsResult.status ===
      "fulfilled"
    ) {
      metrics =
        metricsResult.value;
    }

    if (
      metricsResult.status ===
      "rejected"
    ) {
      errors.push(
        this.liveError(
          "metrics",
          metricsResult.reason
        )
      );
    }

    return {
      observedAt,

      health:
        errors.length === 0
          ? "online"
          : "degraded",

      runtime,

      rest,

      info,

      players,

      metrics,

      summary: {
        playerCount:
          metrics
            ?.currentplayernum ??
          players.length,

        maxPlayers:
          metrics
            ?.maxplayernum ??
          null,

        serverFps:
          metrics
            ?.serverfps ??
          null,

        serverFrameTimeMs:
          metrics
            ?.serverframetime ??
          null,

        uptimeSeconds:
          metrics
            ?.uptime ??
          null,

        worldDays:
          metrics
            ?.days ??
          null,

        baseCampCount:
          metrics
            ?.basecampnum ??
          null
      },

      errors
    };
  }

  public async settings():
    Promise<PalworldRestSettings> {
    const settings =
      await this.client
        .settings();

    const safe:
      PalworldRestSettings = {};

    for (
      const [
        key,
        value
      ]
      of Object.entries(
        settings
      )
    ) {
      if (
        isSensitiveSetting(
          key
        )
      ) {
        continue;
      }

      safe[key] =
        value;
    }

    return safe;
  }

  public async announce(
    message: string
  ): Promise<{
    announced: true;
  }> {
    await this.client
      .announce(
        message
      );

    this.audit.record({
      category:
        "palworld-rest",

      action:
        "announce",

      message:
        "Palworld announcement sent.",

      metadata: {
        messageLength:
          message.length
      }
    });

    return {
      announced:
        true
    };
  }

  public async save():
    Promise<{
      saved: true;
    }> {
    await this.client
      .save();

    this.audit.record({
      category:
        "palworld-rest",

      action:
        "save",

      message:
        "Palworld world save requested."
    });

    return {
      saved:
        true
    };
  }

  public async shutdown(
    waittime: number,
    message?: string
  ): Promise<{
    shutdown: true;
    waittime: number;
  }> {
    await this.client
      .shutdown(
        waittime,
        message
      );

    this.audit.record({
      category:
        "palworld-rest",

      action:
        "shutdown",

      message:
        "Palworld graceful shutdown requested.",

      metadata: {
        waittime,

        messageLength:
          message?.length ??
          0
      }
    });

    return {
      shutdown:
        true,

      waittime
    };
  }

  public async kick(
    userId: string,
    message?: string
  ): Promise<{
    kicked: true;
    userId: string;
  }> {
    await this.client
      .kick(
        userId,
        message
      );

    this.audit.record({
      category:
        "palworld-player",

      action:
        "kick",

      message:
        "Palworld player kicked.",

      entityType:
        "palworld-user",

      entityId:
        userId,

      metadata: {
        messageLength:
          message?.length ??
          0
      }
    });

    return {
      kicked:
        true,

      userId
    };
  }

  public async ban(
    userId: string,
    message?: string
  ): Promise<{
    banned: true;
    userId: string;
  }> {
    await this.client
      .ban(
        userId,
        message
      );

    this.audit.record({
      category:
        "palworld-player",

      action:
        "ban",

      message:
        "Palworld player banned.",

      entityType:
        "palworld-user",

      entityId:
        userId,

      metadata: {
        messageLength:
          message?.length ??
          0
      }
    });

    return {
      banned:
        true,

      userId
    };
  }

  public async unban(
    userId: string
  ): Promise<{
    unbanned: true;
    userId: string;
  }> {
    await this.client
      .unban(
        userId
      );

    this.audit.record({
      category:
        "palworld-player",

      action:
        "unban",

      message:
        "Palworld player unbanned.",

      entityType:
        "palworld-user",

      entityId:
        userId
    });

    return {
      unbanned:
        true,

      userId
    };
  }

  private liveError(
    source:
      "info" |
      "players" |
      "metrics",

    reason:
      unknown
  ): PalworldLiveError {
    if (
      reason instanceof
      PalworldRestError
    ) {
      return {
        source,

        code:
          reason.code,

        message:
          reason.message
      };
    }

    return {
      source,

      code:
        "palworld-rest-live-read-failed",

      message:
        "Palworld live data could not be read."
    };
  }
}