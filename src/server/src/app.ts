import fastifyMultipart from "@fastify/multipart";

import Fastify from "fastify";
import { z } from "zod";

import type {
  AppConfig
} from "./config/app-config.js";

import {
  PRODUCT_NAME,
  PRODUCT_VERSION
} from "./config/product.js";

import {
  databaseIsReady,
  type KpmDatabase
} from "./database/database.js";

import {
  registerLogRoutes
} from "./modules/logs/log-routes.js";

import type {
  LogRepository
} from "./modules/logs/log-repository.js";

import type {
  PalworldDiscoveryService
} from "./modules/palworld/discovery-service.js";

import {
  PalworldLifecycleError,
  type PalworldLifecycleService
} from "./modules/palworld/lifecycle-service.js";

import {
  registerPalworldRestRoutes
} from "./modules/palworld/rest-routes.js";

import type {
  PalworldRestService
} from "./modules/palworld/rest-service.js";

import type {
  PalworldSettingsService
} from "./modules/palworld/settings-service.js";

import {
  SettingsWriteError,
  type PalworldSettingsWriter
} from "./modules/palworld/settings-writer.js";

import type {
  SaveExportService
} from "./modules/saves/save-export-service.js";

import type {
  SaveImportService
} from "./modules/saves/save-import-service.js";

import {
  registerSaveRoutes
} from "./modules/saves/save-routes.js";

import type {
  SaveInventoryService
} from "./modules/saves/save-inventory-service.js";

import type {
  SystemService
} from "./modules/system/system-service.js";

import {
  registerSchedulerRoutes
} from "./modules/scheduler/scheduler-routes.js";

import {
  registerSchedulerNotificationRoutes
} from "./modules/scheduler/scheduler-notification-routes.js";

import type {
  SchedulerNotificationService
} from "./modules/scheduler/scheduler-notification-service.js";

import type {
  SchedulerService
} from "./modules/scheduler/scheduler-service.js";

import {
  registerSteamRoutes
} from "./modules/steam/steam-routes.js";

import type {
  SteamMetadataService
} from "./modules/steam/steam-metadata-service.js";

import {
  registerWebhookRoutes
} from "./modules/webhooks/webhook-routes.js";

import type {
  WebhookService
} from "./modules/webhooks/webhook-service.js";

const SettingValueSchema =
  z.union([
    z.string()
      .max(4096),

    z.number()
      .finite(),

    z.boolean()
  ]);

const ChangesSchema =
  z.record(
    z.string()
      .min(1)
      .max(128)
      .regex(
        /^[A-Za-z0-9_]+$/
      ),

    SettingValueSchema
  );

const PreviewRequestSchema =
  z.object({
    changes:
      ChangesSchema
  }).strict();

const ApplyRequestSchema =
  z.object({
    changes:
      ChangesSchema,

    expectedSourceSha256:
      z.string()
        .regex(
          /^[a-f0-9]{64}$/
        )
  }).strict();

export interface AppDependencies {
  config:
    Readonly<AppConfig>;

  database:
    KpmDatabase;

  systemService:
    SystemService;

  logs:
    LogRepository;

  palworldDiscovery:
    PalworldDiscoveryService;

  palworldLifecycle:
    PalworldLifecycleService;

  palworldRest:
    PalworldRestService;

  palworldSettings:
    PalworldSettingsService;

  palworldSettingsWriter:
    PalworldSettingsWriter;

  saveInventory:
    SaveInventoryService;

  saveExports:
    SaveExportService;

  saveImports:
    SaveImportService;

  steamMetadata:
    SteamMetadataService;

  scheduler:
    SchedulerService;

  schedulerNotifications:
    SchedulerNotificationService;

  webhooks:
    WebhookService;
}

export function buildApp(
  dependencies:
    AppDependencies
) {
  const app =
    Fastify({
      logger:
        true
    });

  app.register(
    fastifyMultipart,
    {
      throwFileSizeLimit:
        true,

      limits: {
        files:
          1,

        fields:
          0,

        parts:
          1,

        fileSize:
          dependencies
            .saveImports
            .maxArchiveBytes
      }
    }
  );

  app.get(
    "/health",
    async () => {
      return {
        status:
          "ok",

        product:
          PRODUCT_NAME,

        version:
          PRODUCT_VERSION,

        timestamp:
          new Date()
            .toISOString()
      };
    }
  );

  app.get(
    "/ready",
    async (
      _request,
      reply
    ) => {
      const ready =
        databaseIsReady(
          dependencies
            .database
        );

      if (!ready) {
        return reply
          .code(503)
          .send({
            status:
              "not-ready",

            database:
              "unavailable",

            timestamp:
              new Date()
                .toISOString()
          });
      }

      return {
        status:
          "ready",

        database:
          "ready",

        timestamp:
          new Date()
            .toISOString()
      };
    }
  );

  registerLogRoutes(
    app,
    dependencies.logs
  );

  registerSaveRoutes(
    app,
    dependencies.saveInventory,
    dependencies.saveExports,
    dependencies.saveImports
  );

  registerSteamRoutes(
    app,
    dependencies.steamMetadata
  );

  registerSchedulerRoutes(
    app,
    dependencies.scheduler
  );

  registerSchedulerNotificationRoutes(
    app,
    dependencies.schedulerNotifications
  );

  registerWebhookRoutes(
    app,
    dependencies.webhooks
  );

  app.get(
    "/api/v1/system",
    async () =>
      dependencies
        .systemService
        .overview()
  );

  app.get(
    "/api/v1/palworld/discovery",
    async () =>
      dependencies
        .palworldDiscovery
        .snapshot()
  );

  app.get(
    "/api/v1/palworld/runtime",
    async () =>
      dependencies
        .palworldLifecycle
        .snapshot()
  );

  const lifecycleAction =
    async (
      action:
        () => Promise<unknown>,

      reply:
        {
          code:
            (
              statusCode:
                number
            ) => {
              send:
                (
                  payload:
                    unknown
                ) => unknown
            }
        }
    ): Promise<unknown> => {
      try {
        return await action();
      } catch (
        error
      ) {
        if (
          error instanceof
          PalworldLifecycleError
        ) {
          return reply
            .code(
              error.statusCode
            )
            .send({
              error:
                error.code,

              message:
                error.message
            });
        }

        throw error;
      }
    };

  app.post(
    "/api/v1/palworld/start",
    async (
      _request,
      reply
    ) =>
      lifecycleAction(
        () =>
          dependencies
            .palworldLifecycle
            .start(),

        reply
      )
  );

  app.post(
    "/api/v1/palworld/stop",
    async (
      _request,
      reply
    ) =>
      lifecycleAction(
        () =>
          dependencies
            .palworldLifecycle
            .stop(),

        reply
      )
  );

  app.post(
    "/api/v1/palworld/restart",
    async (
      _request,
      reply
    ) =>
      lifecycleAction(
        () =>
          dependencies
            .palworldLifecycle
            .restart(),

        reply
      )
  );

  registerPalworldRestRoutes(
    app,

    dependencies.palworldRest,

    () =>
      dependencies
        .palworldLifecycle
        .snapshot()
  );

  app.get(
    "/api/v1/palworld/settings",
    async () =>
      dependencies
        .palworldSettings
        .snapshot()
  );

  app.post(
    "/api/v1/palworld/settings/preview",
    async (
      request,
      reply
    ) => {
      const parsed =
        PreviewRequestSchema
          .safeParse(
            request.body
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Settings preview request is invalid."
          });
      }

      return dependencies
        .palworldSettingsWriter
        .preview(
          parsed.data
            .changes
        );
    }
  );

  app.post(
    "/api/v1/palworld/settings/apply",
    async (
      request,
      reply
    ) => {
      const parsed =
        ApplyRequestSchema
          .safeParse(
            request.body
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Settings apply request is invalid."
          });
      }

      try {
        return dependencies
          .palworldSettingsWriter
          .apply(
            parsed.data
              .changes,

            parsed.data
              .expectedSourceSha256
          );
      } catch (
        error
      ) {
        if (
          error instanceof
          SettingsWriteError
        ) {
          return reply
            .code(
              error.statusCode
            )
            .send({
              error:
                error.code,

              message:
                error.message
            });
        }

        request.log.error(
          {
            error
          },

          "Unexpected settings write failure."
        );

        return reply
          .code(500)
          .send({
            error:
              "settings-write-failed",

            message:
              "Palworld configuration could not be updated."
          });
      }
    }
  );

  return app;
}