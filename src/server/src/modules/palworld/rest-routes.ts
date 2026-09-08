import type {
  FastifyInstance,
  FastifyReply
} from "fastify";

import { z } from "zod";

import {
  PalworldRestError
} from "./rest-client.js";

import type {
  PalworldRestService
} from "./rest-service.js";

const AnnounceRequestSchema =
  z.object({
    message:
      z.string()
        .trim()
        .min(1)
        .max(512)
  }).strict();

export function registerPalworldRestRoutes(
  app:
    FastifyInstance,

  service:
    PalworldRestService
): void {
  const execute =
    async (
      reply:
        FastifyReply,

      action:
        () => Promise<unknown>
    ): Promise<unknown> => {
      try {
        return await action();
      } catch (
        error
      ) {
        if (
          error instanceof
          PalworldRestError
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

        app.log.error(
          {
            error
          },

          "Unexpected Palworld REST proxy failure."
        );

        return reply
          .code(500)
          .send({
            error:
              "palworld-rest-failed",

            message:
              "Palworld REST operation failed."
          });
      }
    };

  app.get(
    "/api/v1/palworld/rest/status",
    async () =>
      service.status()
  );

  app.get(
    "/api/v1/palworld/info",
    async (
      _request,
      reply
    ) =>
      execute(
        reply,
        () =>
          service.info()
      )
  );

  app.get(
    "/api/v1/palworld/players",
    async (
      _request,
      reply
    ) =>
      execute(
        reply,
        () =>
          service.players()
      )
  );

  app.get(
    "/api/v1/palworld/metrics",
    async (
      _request,
      reply
    ) =>
      execute(
        reply,
        () =>
          service.metrics()
      )
  );

  app.get(
    "/api/v1/palworld/rest/settings",
    async (
      _request,
      reply
    ) =>
      execute(
        reply,
        () =>
          service.settings()
      )
  );

  app.post(
    "/api/v1/palworld/announce",
    async (
      request,
      reply
    ) => {
      const parsed =
        AnnounceRequestSchema
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
              "Announcement request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          service.announce(
            parsed.data
              .message
          )
      );
    }
  );

  app.post(
    "/api/v1/palworld/save",
    async (
      _request,
      reply
    ) =>
      execute(
        reply,
        () =>
          service.save()
      )
  );
}