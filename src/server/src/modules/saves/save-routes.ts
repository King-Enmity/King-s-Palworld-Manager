import type {
  FastifyInstance,
  FastifyReply
} from "fastify";

import { z } from "zod";

import {
  SaveInventoryError,
  type SaveInventoryService
} from "./save-inventory-service.js";

const IdentifierSchema =
  z.string()
    .min(1)
    .max(128)
    .regex(
      /^[A-Za-z0-9._-]+$/
    )
    .refine(
      value =>
        value !== "." &&
        value !== ".."
    );

const WorldParamsSchema =
  z.object({
    slotId:
      IdentifierSchema,

    worldId:
      IdentifierSchema
  }).strict();

export function registerSaveRoutes(
  app:
    FastifyInstance,

  inventory:
    SaveInventoryService
): void {
  const execute =
    async (
      reply:
        FastifyReply,

      action:
        () => unknown
    ): Promise<unknown> => {
      try {
        return action();
      } catch (
        error
      ) {
        if (
          error instanceof
          SaveInventoryError
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

  app.get(
    "/api/v1/saves",
    async () =>
      inventory.snapshot()
  );

  app.get(
    "/api/v1/saves/worlds",
    async () =>
      inventory.worlds()
  );

  app.get(
    "/api/v1/saves/worlds/:slotId/:worldId",
    async (
      request,
      reply
    ) => {
      const parsed =
        WorldParamsSchema
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
              "Save world request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          inventory.world(
            parsed.data.slotId,
            parsed.data.worldId
          )
      );
    }
  );

  app.get(
    "/api/v1/saves/worlds/:slotId/:worldId/players",
    async (
      request,
      reply
    ) => {
      const parsed =
        WorldParamsSchema
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
              "Player save request is invalid."
          });
      }

      return execute(
        reply,
        () =>
          inventory.players(
            parsed.data.slotId,
            parsed.data.worldId
          )
      );
    }
  );
}