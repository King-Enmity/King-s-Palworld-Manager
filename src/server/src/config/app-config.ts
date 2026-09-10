import path from "node:path";

import { z } from "zod";

const EnvironmentSchema = z.object({
  KPM_BIND_ADDRESS:
    z.string()
      .min(1)
      .default("127.0.0.1"),

  KPM_HTTP_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(8080),

  KPM_DATA_PATH:
    z.string()
      .min(1)
      .optional(),

  KPM_WEB_ROOT:
    z.string()
      .min(1)
      .optional(),

  KPM_DB_FILENAME:
    z.string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default("kpm.db"),

  KPM_PALWORLD_ROOT:
    z.string()
      .min(1)
      .optional(),

  KPM_PALWORLD_GAME_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(8211),

  KPM_PALWORLD_QUERY_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(27015),

  KPM_PALWORLD_REST_PORT:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(8212),

  KPM_PALWORLD_REST_USERNAME:
    z.string()
      .regex(/^[^:\r\n]{1,128}$/)
      .default("admin"),

  KPM_PALWORLD_REST_TIMEOUT_MS:
    z.coerce
      .number()
      .int()
      .min(250)
      .max(30000)
      .default(5000),

  KPM_PALWORLD_REST_SHUTDOWN_WAIT_SECONDS:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(1),

  KPM_PALWORLD_STOP_TIMEOUT_MS:
    z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(30000)
});

export interface AppConfig {
  bindAddress: string;
  httpPort: number;

  dataPath: string;
  databasePath: string;

  webRoot: string | null;

  palworldRoot: string | null;

  palworldGamePort: number;
  palworldQueryPort: number;
  palworldRestPort: number;

  palworldRestUsername: string;
  palworldRestTimeoutMs: number;
  palworldRestShutdownWaitSeconds: number;

  palworldStopTimeoutMs: number;
}

export function loadAppConfig(
  environment:
    NodeJS.ProcessEnv = process.env
): Readonly<AppConfig> {
  const parsed =
    EnvironmentSchema.parse(
      environment
    );

  const dataPath =
    path.resolve(
      parsed.KPM_DATA_PATH ??
        path.join(
          process.cwd(),
          "data"
        )
    );

  return Object.freeze({
    bindAddress:
      parsed.KPM_BIND_ADDRESS,

    httpPort:
      parsed.KPM_HTTP_PORT,

    dataPath,

    databasePath:
      path.join(
        dataPath,
        parsed.KPM_DB_FILENAME
      ),

    webRoot:
      parsed.KPM_WEB_ROOT
        ? path.resolve(
            parsed.KPM_WEB_ROOT
          )
        : null,

    palworldRoot:
      parsed.KPM_PALWORLD_ROOT
        ? path.resolve(
            parsed.KPM_PALWORLD_ROOT
          )
        : null,

    palworldGamePort:
      parsed.KPM_PALWORLD_GAME_PORT,

    palworldQueryPort:
      parsed.KPM_PALWORLD_QUERY_PORT,

    palworldRestPort:
      parsed.KPM_PALWORLD_REST_PORT,

    palworldRestUsername:
      parsed.KPM_PALWORLD_REST_USERNAME,

    palworldRestTimeoutMs:
      parsed.KPM_PALWORLD_REST_TIMEOUT_MS,

    palworldRestShutdownWaitSeconds:
      parsed.KPM_PALWORLD_REST_SHUTDOWN_WAIT_SECONDS,

    palworldStopTimeoutMs:
      parsed.KPM_PALWORLD_STOP_TIMEOUT_MS
  });
}