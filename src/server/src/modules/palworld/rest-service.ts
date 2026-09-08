import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import {
  isSensitiveSetting
} from "./settings-validation.js";

import {
  PalworldRestClient,
  type PalworldRestStatus
} from "./rest-client.js";

import type {
  PalworldRestInfo,
  PalworldRestMetrics,
  PalworldRestPlayers,
  PalworldRestSettings
} from "./rest-schemas.js";

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
}