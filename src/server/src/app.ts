import Fastify from "fastify";
import { z } from "zod";

import type { AppConfig } from "./config/app-config.js";
import {
  PRODUCT_NAME,
  PRODUCT_VERSION
} from "./config/product.js";

import {
  databaseIsReady,
  type KpmDatabase
} from "./database/database.js";

import type { PalworldDiscoveryService } from "./modules/palworld/discovery-service.js";
import type { PalworldSettingsService } from "./modules/palworld/settings-service.js";

import {
  SettingsWriteError,
  type PalworldSettingsWriter
} from "./modules/palworld/settings-writer.js";

import type { SystemService } from "./modules/system/system-service.js";

const SettingValueSchema = z.union([
  z.string().max(4096),
  z.number().finite(),
  z.boolean()
]);

const ChangesSchema =
  z.record(
    z.string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_]+$/),
    SettingValueSchema
  );

const PreviewRequestSchema =
  z.object({
    changes: ChangesSchema
  }).strict();

const ApplyRequestSchema =
  z.object({
    changes: ChangesSchema,

    expectedSourceSha256:
      z.string()
        .regex(/^[a-f0-9]{64}$/)
  }).strict();

export interface AppDependencies {
  config: Readonly<AppConfig>;
  database: KpmDatabase;

  systemService:
    SystemService;

  palworldDiscovery:
    PalworldDiscoveryService;

  palworldSettings:
    PalworldSettingsService;

  palworldSettingsWriter:
    PalworldSettingsWriter;
}

export function buildApp(
  dependencies: AppDependencies
) {
  const app = Fastify({
    logger: true
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      product: PRODUCT_NAME,
      version: PRODUCT_VERSION,
      timestamp: new Date().toISOString()
    };
  });

  app.get("/ready", async (_request, reply) => {
    const ready =
      databaseIsReady(
        dependencies.database
      );

    if (!ready) {
      return reply.code(503).send({
        status: "not-ready",
        database: "unavailable",
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: "ready",
      database: "ready",
      timestamp: new Date().toISOString()
    };
  });

  app.get(
    "/api/v1/system",
    async () =>
      dependencies.systemService.overview()
  );

  app.get(
    "/api/v1/palworld/discovery",
    async () =>
      dependencies.palworldDiscovery.snapshot()
  );

  app.get(
    "/api/v1/palworld/settings",
    async () =>
      dependencies.palworldSettings.snapshot()
  );

  app.post(
    "/api/v1/palworld/settings/preview",
    async (request, reply) => {
      const parsed =
        PreviewRequestSchema.safeParse(
          request.body
        );

      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid-request",
          message:
            "Settings preview request is invalid."
        });
      }

      return dependencies
        .palworldSettingsWriter
        .preview(
          parsed.data.changes
        );
    }
  );

  app.post(
    "/api/v1/palworld/settings/apply",
    async (request, reply) => {
      const parsed =
        ApplyRequestSchema.safeParse(
          request.body
        );

      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid-request",
          message:
            "Settings apply request is invalid."
        });
      }

      try {
        return dependencies
          .palworldSettingsWriter
          .apply(
            parsed.data.changes,
            parsed.data.expectedSourceSha256
          );
      } catch (error) {
        if (error instanceof SettingsWriteError) {
          return reply
            .code(error.statusCode)
            .send({
              error: error.code,
              message: error.message
            });
        }

        request.log.error(
          { error },
          "Unexpected settings write failure."
        );

        return reply.code(500).send({
          error: "settings-write-failed",
          message:
            "Palworld configuration could not be updated."
        });
      }
    }
  );

  return app;
}