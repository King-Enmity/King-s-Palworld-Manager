import {
  createReadStream
} from "node:fs";

import type {
  FastifyInstance
} from "fastify";

import {
  z
} from "zod";

import {
  type SteamAssetName,
  type SteamMetadataService
} from "./steam-metadata-service.js";

const AssetParamsSchema =
  z.object({
    name:
      z.enum([
        "header",
        "capsule",
        "background"
      ])
  }).strict();

export function registerSteamRoutes(
  app:
    FastifyInstance,

  steam:
    SteamMetadataService
): void {
  app.get(
    "/api/v1/steam/palworld",

    async () =>
      steam.metadata()
  );

  app.post(
    "/api/v1/steam/palworld/refresh",

    async (
      request,
      reply
    ) => {
      try {
        return await steam
          .forceRefresh();
      } catch (
        error
      ) {
        request.log.warn(
          {
            error
          },

          "Steam metadata refresh failed."
        );

        return reply
          .code(502)
          .send({
            error:
              "steam-metadata-refresh-failed",

            message:
              error instanceof
                Error
                ? error.message
                : "Steam metadata refresh failed."
          });
      }
    }
  );

  app.get(
    "/api/v1/steam/palworld/assets/:name",

    async (
      request,
      reply
    ) => {
      const parsed =
        AssetParamsSchema
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
              "Steam asset request is invalid."
          });
      }

      const asset =
        steam.asset(
          parsed.data.name as
            SteamAssetName
        );

      if (!asset) {
        return reply
          .code(404)
          .send({
            error:
              "steam-asset-not-found",

            message:
              "Steam artwork has not been cached yet."
          });
      }

      return reply
        .header(
          "Content-Type",
          asset.contentType
        )
        .header(
          "Content-Length",
          String(
            asset.sizeBytes
          )
        )
        .header(
          "ETag",
          `"${asset.sha256}"`
        )
        .header(
          "Cache-Control",
          "public, max-age=86400"
        )
        .send(
          createReadStream(
            asset.filePath
          )
        );
    }
  );
}