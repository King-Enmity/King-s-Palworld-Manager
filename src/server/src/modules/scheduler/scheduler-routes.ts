import type {
  FastifyInstance
} from "fastify";

import {
  z
} from "zod";

import type {
  SchedulerService
} from "./scheduler-service.js";

const SettingValueSchema =
  z.union([
    z.string()
      .max(4096),

    z.number()
      .finite(),

    z.boolean()
  ]);

const SettingsChangesSchema =
  z.record(
    z.string()
      .min(1)
      .max(128)
      .regex(
        /^[A-Za-z0-9_]+$/
      ),

    SettingValueSchema
  );

const BaseJobSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(1)
        .max(128),

    scheduledFor:
      z.string()
        .datetime({
          offset:
            true
        })
  });

const CreateJobSchema =
  z.discriminatedUnion(
    "actionType",
    [
      BaseJobSchema.extend({
        actionType:
          z.literal(
            "start"
          ),

        payload:
          z.object({})
            .strict()
            .default({})
      }),

      BaseJobSchema.extend({
        actionType:
          z.literal(
            "stop"
          ),

        payload:
          z.object({})
            .strict()
            .default({})
      }),

      BaseJobSchema.extend({
        actionType:
          z.literal(
            "restart"
          ),

        payload:
          z.object({})
            .strict()
            .default({})
      }),

      BaseJobSchema.extend({
        actionType:
          z.literal(
            "save"
          ),

        payload:
          z.object({})
            .strict()
            .default({})
      }),

      BaseJobSchema.extend({
        actionType:
          z.literal(
            "announce"
          ),

        payload:
          z.object({
            message:
              z.string()
                .min(1)
                .max(512)
          }).strict()
      }),

      BaseJobSchema.extend({
        actionType:
          z.literal(
            "settings"
          ),

        payload:
          z.object({
            changes:
              SettingsChangesSchema
          }).strict()
      })
    ]
  );

const IdSchema =
  z.object({
    id:
      z.string()
        .uuid()
  }).strict();

export function registerSchedulerRoutes(
  app:
    FastifyInstance,

  scheduler:
    SchedulerService
): void {
  app.get(
    "/api/v1/scheduler/jobs",

    async () =>
      scheduler.list()
  );

  app.post(
    "/api/v1/scheduler/jobs",

    async (
      request,
      reply
    ) => {
      const parsed =
        CreateJobSchema
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
              "Scheduled job request is invalid."
          });
      }

      const scheduled =
        Date.parse(
          parsed.data
            .scheduledFor
        );

      if (
        !Number.isFinite(
          scheduled
        ) ||
        scheduled <=
          Date.now()
      ) {
        return reply
          .code(400)
          .send({
            error:
              "scheduler-time-invalid",

            message:
              "Scheduled time must be in the future."
          });
      }

      return reply
        .code(201)
        .send(
          scheduler.create({
            name:
              parsed.data.name,

            actionType:
              parsed.data
                .actionType,

            payload:
              parsed.data.payload,

            scheduledFor:
              new Date(
                scheduled
              )
                .toISOString()
          })
        );
    }
  );

  app.post(
    "/api/v1/scheduler/jobs/:id/cancel",

    async (
      request,
      reply
    ) => {
      const parsed =
        IdSchema
          .safeParse(
            request.params
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Scheduled job ID is invalid."
          });
      }

      try {
        return scheduler
          .cancel(
            parsed.data.id
          );
      } catch (
        error
      ) {
        return reply
          .code(409)
          .send({
            error:
              "scheduler-cancel-failed",

            message:
              error instanceof
                Error
                ? error.message
                : "Scheduled job could not be cancelled."
          });
      }
    }
  );

  app.delete(
    "/api/v1/scheduler/jobs/:id",

    async (
      request,
      reply
    ) => {
      const parsed =
        IdSchema
          .safeParse(
            request.params
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Scheduled job ID is invalid."
          });
      }

      try {
        scheduler.delete(
          parsed.data.id
        );

        return reply
          .code(204)
          .send();
      } catch (
        error
      ) {
        return reply
          .code(409)
          .send({
            error:
              "scheduler-delete-failed",

            message:
              error instanceof
                Error
                ? error.message
                : "Scheduled job could not be deleted."
          });
      }
    }
  );
}