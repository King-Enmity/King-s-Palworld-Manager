import Fastify from "fastify";

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

import type {
  PalworldDiscoveryService
} from "./modules/palworld/discovery-service.js";

import type {
  PalworldSettingsService
} from "./modules/palworld/settings-service.js";

import type {
  SystemService
} from "./modules/system/system-service.js";

export interface AppDependencies {
  config: Readonly<AppConfig>;

  database: KpmDatabase;

  systemService:
    SystemService;

  palworldDiscovery:
    PalworldDiscoveryService;

  palworldSettings:
    PalworldSettingsService;
}

export function buildApp(
  dependencies: AppDependencies
) {
  const app = Fastify({
    logger: true
  });

  app.get(
    "/health",
    async () => {
      return {
        status: "ok",
        product: PRODUCT_NAME,
        version: PRODUCT_VERSION,
        timestamp:
          new Date().toISOString()
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
          dependencies.database
        );

      if (!ready) {
        return reply
          .code(503)
          .send({
            status: "not-ready",
            database: "unavailable",
            timestamp:
              new Date().toISOString()
          });
      }

      return {
        status: "ready",
        database: "ready",
        timestamp:
          new Date().toISOString()
      };
    }
  );

  app.get(
    "/api/v1/system",
    async () => {
      return dependencies
        .systemService
        .overview();
    }
  );

  app.get(
    "/api/v1/palworld/discovery",
    async () => {
      return dependencies
        .palworldDiscovery
        .snapshot();
    }
  );

  app.get(
    "/api/v1/palworld/settings",
    async () => {
      return dependencies
        .palworldSettings
        .snapshot();
    }
  );

  return app;
}