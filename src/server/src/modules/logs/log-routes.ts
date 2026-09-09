import type {
  FastifyInstance
} from "fastify";

import {
  z
} from "zod";

import {
  type LogRepository,
  type LogSeverity
} from "./log-repository.js";

const ListQuerySchema =
  z.object({
    source:
      z.enum([
        "all",
        "manager",
        "palworld"
      ])
        .default(
          "all"
        ),

    severity:
      z.string()
        .trim()
        .max(64)
        .optional(),

    category:
      z.string()
        .trim()
        .min(1)
        .max(128)
        .optional(),

    q:
      z.string()
        .trim()
        .min(1)
        .max(200)
        .optional(),

    from:
      z.string()
        .datetime({
          offset:
            true
        })
        .optional(),

    to:
      z.string()
        .datetime({
          offset:
            true
        })
        .optional(),

    limit:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .default(100),

    offset:
      z.coerce
        .number()
        .int()
        .min(0)
        .max(100_000)
        .default(0)
  })
    .strict();

const SummaryQuerySchema =
  z.object({
    hours:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(720)
        .default(24)
  })
    .strict();

const allowedSeverities =
  new Set<
    LogSeverity
  >([
    "debug",
    "info",
    "warning",
    "error"
  ]);

function parseSeverities(
  value:
    string |
    undefined
): LogSeverity[] | null {
  if (!value) {
    return [];
  }

  const result =
    [
      ...new Set(
        value
          .split(
            ","
          )
          .map(
            item =>
              item
                .trim()
                .toLowerCase()
          )
          .filter(
            Boolean
          )
      )
    ];

  if (
    result.length ===
    0
  ) {
    return [];
  }

  for (
    const severity
    of result
  ) {
    if (
      !allowedSeverities
        .has(
          severity as
            LogSeverity
        )
    ) {
      return null;
    }
  }

  return result as
    LogSeverity[];
}

export function registerLogRoutes(
  app:
    FastifyInstance,

  logs:
    LogRepository
): void {
  app.get(
    "/api/v1/logs",

    async (
      request,
      reply
    ) => {
      const parsed =
        ListQuerySchema
          .safeParse(
            request.query
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Log query is invalid."
          });
      }

      const severities =
        parseSeverities(
          parsed.data
            .severity
        );

      if (
        severities ===
        null
      ) {
        return reply
          .code(400)
          .send({
            error:
              "log-severity-invalid",

            message:
              "Log severity filter is invalid."
          });
      }

      if (
        parsed.data.from &&
        parsed.data.to &&
        Date.parse(
          parsed.data.from
        ) >
        Date.parse(
          parsed.data.to
        )
      ) {
        return reply
          .code(400)
          .send({
            error:
              "log-range-invalid",

            message:
              "Log start time must not be later than end time."
          });
      }

      return logs.list({
        source:
          parsed.data.source ===
            "all"
            ? undefined
            : parsed.data.source,

        severities,

        category:
          parsed.data.category,

        search:
          parsed.data.q,

        from:
          parsed.data.from,

        to:
          parsed.data.to,

        limit:
          parsed.data.limit,

        offset:
          parsed.data.offset
      });
    }
  );

  app.get(
    "/api/v1/logs/summary",

    async (
      request,
      reply
    ) => {
      const parsed =
        SummaryQuerySchema
          .safeParse(
            request.query
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Log summary query is invalid."
          });
      }

      return logs
        .summary(
          parsed.data.hours
        );
    }
  );
}