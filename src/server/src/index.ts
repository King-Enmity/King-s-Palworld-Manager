import {
  buildApp
} from "./app.js";

import {
  loadAppConfig
} from "./config/app-config.js";

import {
  openDatabase
} from "./database/database.js";

import {
  AuditRepository
} from "./infrastructure/audit-repository.js";

import {
  PalworldDiscoveryService
} from "./modules/palworld/discovery-service.js";

import {
  createPalworldProcessSpec
} from "./modules/palworld/launch-plan.js";

import {
  PalworldLifecycleService
} from "./modules/palworld/lifecycle-service.js";

import {
  PalworldRestClient
} from "./modules/palworld/rest-client.js";

import {
  PalworldRestConfigurationProvider
} from "./modules/palworld/rest-configuration.js";

import {
  PalworldRestService
} from "./modules/palworld/rest-service.js";

import {
  PalworldRuntimeState
} from "./modules/palworld/runtime-state.js";

import {
  PalworldSettingsService
} from "./modules/palworld/settings-service.js";

import {
  PalworldSettingsWriter
} from "./modules/palworld/settings-writer.js";

import {
  SaveInventoryService
} from "./modules/saves/save-inventory-service.js";

import {
  SystemService
} from "./modules/system/system-service.js";

async function main():
  Promise<void> {
  const managerStartedAt =
    new Date();

  const config =
    loadAppConfig();

  const database =
    openDatabase(
      config.databasePath
    );

  const audit =
    new AuditRepository(
      database
    );

  const palworldRuntime =
    new PalworldRuntimeState();

  const palworldDiscovery =
    new PalworldDiscoveryService(
      config
    );

  const palworldSettings =
    new PalworldSettingsService(
      config
    );

  const palworldSettingsWriter =
    new PalworldSettingsWriter(
      config,
      audit
    );

  const palworldRestConfiguration =
    new PalworldRestConfigurationProvider(
      config
    );

  const palworldRestClient =
    new PalworldRestClient(
      palworldRestConfiguration,
      config.palworldRestTimeoutMs
    );

  const palworldRest =
    new PalworldRestService(
      palworldRestClient,
      audit
    );

  const palworldLifecycle =
    new PalworldLifecycleService({
      runtime:
        palworldRuntime,

      audit,

      processSpec:
        createPalworldProcessSpec(
          config
        ),

      restControl:
        palworldRest,

      restShutdownWaitSeconds:
        config
          .palworldRestShutdownWaitSeconds,

      stopTimeoutMs:
        config
          .palworldStopTimeoutMs
    });

  palworldLifecycle
    .initialize();

  const saveInventory =
    new SaveInventoryService(
      config
    );

  const systemService =
    new SystemService({
      config,
      audit,
      palworldRuntime,
      managerStartedAt
    });

  const app =
    buildApp({
      config,
      database,

      systemService,

      palworldDiscovery,
      palworldLifecycle,
      palworldRest,

      palworldSettings,
      palworldSettingsWriter,

      saveInventory
    });

  audit.record({
    category:
      "manager",

    action:
      "started",

    message:
      "King's Palworld Manager started."
  });

  let shuttingDown = false;

  const shutdown =
    async (
      signal:
        string
    ): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      app.log.info(
        {
          signal
        },

        "Manager shutdown requested."
      );

      audit.record({
        category:
          "manager",

        action:
          "stopping",

        message:
          `Manager stopping after ${signal}.`
      });

      try {
        await palworldLifecycle
          .shutdown();
      } catch (
        error
      ) {
        app.log.error(
          {
            error
          },

          "Palworld shutdown during Manager exit failed."
        );
      }

      await app.close();

      database.close();
    };

  process.once(
    "SIGINT",
    () =>
      void shutdown(
        "SIGINT"
      )
  );

  process.once(
    "SIGTERM",
    () =>
      void shutdown(
        "SIGTERM"
      )
  );

  await app.listen({
    host:
      config.bindAddress,

    port:
      config.httpPort
  });

  audit.record({
    category:
      "manager",

    action:
      "listening",

    message:
      "Manager HTTP API is listening.",

    metadata: {
      bindAddress:
        config.bindAddress,

      port:
        config.httpPort
    }
  });
}

main().catch(
  (
    error:
      unknown
  ) => {
    console.error(
      "King's Palworld Manager failed to start.",
      error
    );

    process.exitCode = 1;
  }
);