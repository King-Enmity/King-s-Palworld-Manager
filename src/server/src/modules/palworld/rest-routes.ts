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

import type {
  PalworldRuntimeSnapshot
} from "./runtime-state.js";

const AnnounceRequestSchema =
  z.object({
    message:
      z.string()
        .trim()
        .min(1)
        .max(512)
  }).strict();

const PlayerParamsSchema =
  z.object({
    userId:
      z.string()
        .min(1)
        .max(256)
        .regex(
          /^[^\s\x00-\x1F\x7F]+$/
        )
  }).strict();

const PlayerActionSchema =
  z.object({
    message:
      z.string()
        .trim()
        .min(1)
        .max(512)
        .optional()
  }).strict();

export function registerPalworldRestRoutes(
  app:
    FastifyInstance,

  service:
    PalworldRestService,

  runtime:
    () => PalworldRuntimeSnapshot
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
    "/api/v1/palworld/live",
    async () =>
      service.live(
        runtime()
      )
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

  app.post(
    "/api/v1/palworld/players/:userId/kick",
    async (
      request,
      reply
    ) => {
      const params =
        PlayerParamsSchema
          .safeParse(
            request.params
          );

      const body =
        PlayerActionSchema
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
              "Kick request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          service.kick(
            params.data
              .userId,

            body.data
              .message
          )
      );
    }
  );

  app.post(
    "/api/v1/palworld/players/:userId/ban",
    async (
      request,
      reply
    ) => {
      const params =
        PlayerParamsSchema
          .safeParse(
            request.params
          );

      const body =
        PlayerActionSchema
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
              "Ban request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          service.ban(
            params.data
              .userId,

            body.data
              .message
          )
      );
    }
  );

  app.post(
    "/api/v1/palworld/players/:userId/unban",
    async (
      request,
      reply
    ) => {
      const params =
        PlayerParamsSchema
          .safeParse(
            request.params
          );

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error:
              "invalid-request",

            message:
              "Unban request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          service.unban(
            params.data
              .userId
          )
      );
    }
  );
}