import type {
  FastifyInstance,
  FastifyReply
} from "fastify";

import {
  z
} from "zod";

import {
  WebhookServiceError,
  type WebhookService
} from "./webhook-service.js";

const IdSchema =
  z.object({
    id:
      z.string()
        .uuid()
  }).strict();

const CreateSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(1)
        .max(128),

    kind:
      z.enum([
        "discord",
        "generic"
      ]),

    url:
      z.string()
        .min(1)
        .max(4096),

    enabled:
      z.boolean()
        .default(
          true
        )
  }).strict();

const UpdateSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(1)
        .max(128)
        .optional(),

    url:
      z.string()
        .min(1)
        .max(4096)
        .optional(),

    enabled:
      z.boolean()
        .optional()
  })
    .strict()
    .refine(
      value =>
        Object.keys(
          value
        ).length >
        0,
      {
        message:
          "At least one update is required."
      }
    );

const TestSchema =
  z.object({
    message:
      z.string()
        .trim()
        .min(1)
        .max(2000)
        .default(
          "King's Palworld Manager webhook test."
        )
  }).strict();

const SendSchema =
  z.object({
    eventType:
      z.string()
        .trim()
        .min(1)
        .max(64)
        .regex(
          /^[A-Za-z0-9._:-]+$/
        ),

    message:
      z.string()
        .trim()
        .min(1)
        .max(2000),

    data:
      z.record(
        z.string(),
        z.unknown()
      )
        .optional()
  }).strict();

const DeliveryQuerySchema =
  z.object({
    limit:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(
          50
        )
  }).strict();

function serviceError(
  error:
    unknown,

  reply:
    FastifyReply
) {
  if (
    error instanceof
    WebhookServiceError
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

export function registerWebhookRoutes(
  app:
    FastifyInstance,

  webhooks:
    WebhookService
): void {
  app.get(
    "/api/v1/webhooks/destinations",

    async () =>
      webhooks.list()
  );

  app.get(
    "/api/v1/webhooks/deliveries",

    async (
      request,
      reply
    ) => {
      const parsed =
        DeliveryQuerySchema
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
              "Webhook delivery query is invalid."
          });
      }

      return webhooks
        .deliveries(
          parsed.data.limit
        );
    }
  );

  app.post(
    "/api/v1/webhooks/destinations",

    async (
      request,
      reply
    ) => {
      const parsed =
        CreateSchema
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
              "Webhook destination request is invalid."
          });
      }

      try {
        return reply
          .code(201)
          .send(
            webhooks.create(
              parsed.data
            )
          );
      } catch (
        error
      ) {
        return serviceError(
          error,
          reply
        );
      }
    }
  );

  app.patch(
    "/api/v1/webhooks/destinations/:id",

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
        UpdateSchema
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
              "Webhook destination update is invalid."
          });
      }

      try {
        return webhooks
          .update(
            params.data.id,
            body.data
          );
      } catch (
        error
      ) {
        return serviceError(
          error,
          reply
        );
      }
    }
  );

  app.delete(
    "/api/v1/webhooks/destinations/:id",

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
              "Webhook destination ID is invalid."
          });
      }

      try {
        webhooks.delete(
          parsed.data.id
        );

        return reply
          .code(204)
          .send();
      } catch (
        error
      ) {
        return serviceError(
          error,
          reply
        );
      }
    }
  );

  app.post(
    "/api/v1/webhooks/destinations/:id/test",

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
        TestSchema
          .safeParse(
            request.body ??
            {}
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
              "Webhook test request is invalid."
          });
      }

      try {
        return await webhooks
          .test(
            params.data.id,
            body.data.message
          );
      } catch (
        error
      ) {
        return serviceError(
          error,
          reply
        );
      }
    }
  );

  app.post(
    "/api/v1/webhooks/destinations/:id/send",

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
        SendSchema
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
              "Webhook send request is invalid."
          });
      }

      try {
        return await webhooks
          .send(
            params.data.id,
            body.data
          );
      } catch (
        error
      ) {
        return serviceError(
          error,
          reply
        );
      }
    }
  );
}