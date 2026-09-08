import type {
  FastifyInstance,
  FastifyReply
} from "fastify";

import {
  z
} from "zod";

import {
  SchedulerNotificationServiceError,
  type SchedulerNotificationService
} from "./scheduler-notification-service.js";

const IdSchema =
  z.object({
    id:
      z.string()
        .uuid()
  }).strict();

const CommonSchema =
  z.object({
    destinationId:
      z.string()
        .uuid(),

    messageTemplate:
      z.string()
        .trim()
        .min(1)
        .max(2000)
  });

const NotificationSchema =
  z.discriminatedUnion(
    "phase",
    [
      CommonSchema.extend({
        phase:
          z.literal(
            "before"
          ),

        minutesBefore:
          z.number()
            .int()
            .min(1)
            .max(10080)
      }).strict(),

      CommonSchema.extend({
        phase:
          z.literal(
            "start"
          )
      }).strict(),

      CommonSchema.extend({
        phase:
          z.literal(
            "success"
          )
      }).strict(),

      CommonSchema.extend({
        phase:
          z.literal(
            "failure"
          )
      }).strict()
    ]
  );

const ReplaceSchema =
  z.object({
    notifications:
      z.array(
        NotificationSchema
      )
        .max(32)
  }).strict();

function handleServiceError(
  error:
    unknown,

  reply:
    FastifyReply
) {
  if (
    error instanceof
    SchedulerNotificationServiceError
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

export function registerSchedulerNotificationRoutes(
  app:
    FastifyInstance,

  notifications:
    SchedulerNotificationService
): void {
  app.get(
    "/api/v1/scheduler/jobs/:id/notifications",

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
        return notifications
          .listForJob(
            parsed.data.id
          );
      } catch (
        error
      ) {
        return handleServiceError(
          error,
          reply
        );
      }
    }
  );

  app.put(
    "/api/v1/scheduler/jobs/:id/notifications",

    async (
      request,
      reply
    ) => {
      const params =
        IdSchema
          .safeParse(
            request.params
          );

      const body =
        ReplaceSchema
          .safeParse(
            request.body
          );

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Scheduler notification configuration is invalid."
          });
      }

      try {
        return notifications
          .replaceForJob(
            params.data.id,
            body.data.notifications
          );
      } catch (
        error
      ) {
        return handleServiceError(
          error,
          reply
        );
      }
    }
  );
}