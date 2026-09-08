import {
  createReadStream
} from "node:fs";

import type {
  FastifyInstance,
  FastifyReply
} from "fastify";

import { z } from "zod";

import {
  SaveExportError,
  type SaveExportArtifact,
  type SaveExportService
} from "./save-export-service.js";

import {
  SaveImportError,
  type SaveImportService
} from "./save-import-service.js";

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

const PlayerParamsSchema =
  z.object({
    slotId:
      IdentifierSchema,

    worldId:
      IdentifierSchema,

    playerId:
      IdentifierSchema
  }).strict();

function statusCodeOf(
  error:
    unknown
): number | null {
  if (
    typeof error !==
      "object" ||
    error ===
      null ||
    !(
      "statusCode"
      in error
    )
  ) {
    return null;
  }

  const statusCode =
    (
      error as {
        statusCode?:
          unknown;
      }
    ).statusCode;

  return typeof statusCode ===
    "number"
      ? statusCode
      : null;
}

export function registerSaveRoutes(
  app:
    FastifyInstance,

  inventory:
    SaveInventoryService,

  exports:
    SaveExportService,

  imports:
    SaveImportService
): void {
  const sendError =
    (
      reply:
        FastifyReply,

      error:
        unknown
    ): unknown => {
      if (
        error instanceof
          SaveInventoryError ||
        error instanceof
          SaveExportError ||
        error instanceof
          SaveImportError
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

      if (
        statusCodeOf(
          error
        ) ===
        413
      ) {
        return reply
          .code(413)
          .send({
            error:
              "save-import-archive-too-large",

            message:
              "Save import archive exceeds the maximum allowed size."
          });
      }

      throw error;
    };

  const sendArtifact =
    (
      reply:
        FastifyReply,

      artifact:
        SaveExportArtifact
    ): unknown => {
      const stream =
        createReadStream(
          artifact.filePath
        );

      let cleaned =
        false;

      const cleanup =
        (): void => {
          if (cleaned) {
            return;
          }

          cleaned =
            true;

          artifact.cleanup();
        };

      stream.once(
        "close",
        cleanup
      );

      stream.once(
        "error",
        cleanup
      );

      return reply
        .header(
          "Content-Type",
          artifact.contentType
        )
        .header(
          "Content-Disposition",
          `attachment; filename="${artifact.fileName}"`
        )
        .header(
          "X-KPM-Archive-SHA256",
          artifact.archiveSha256
        )
        .send(
          stream
        );
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

      try {
        return inventory.world(
          parsed.data.slotId,
          parsed.data.worldId
        );
      } catch (
        error
      ) {
        return sendError(
          reply,
          error
        );
      }
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

      try {
        return inventory.players(
          parsed.data.slotId,
          parsed.data.worldId
        );
      } catch (
        error
      ) {
        return sendError(
          reply,
          error
        );
      }
    }
  );

  app.get(
    "/api/v1/saves/worlds/:slotId/:worldId/export",
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
              "World export request is invalid."
          });
      }

      try {
        const artifact =
          await exports.world(
            parsed.data.slotId,
            parsed.data.worldId
          );

        return sendArtifact(
          reply,
          artifact
        );
      } catch (
        error
      ) {
        return sendError(
          reply,
          error
        );
      }
    }
  );

  app.get(
    "/api/v1/saves/worlds/:slotId/:worldId/players/:playerId/export",
    async (
      request,
      reply
    ) => {
      const parsed =
        PlayerParamsSchema
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
              "Player export request is invalid."
          });
      }

      try {
        const artifact =
          await exports.player(
            parsed.data.slotId,
            parsed.data.worldId,
            parsed.data.playerId
          );

        return sendArtifact(
          reply,
          artifact
        );
      } catch (
        error
      ) {
        return sendError(
          reply,
          error
        );
      }
    }
  );

  app.post(
    "/api/v1/saves/import/preview",

    {
      bodyLimit:
        imports.maxRequestBytes
    },

    async (
      request,
      reply
    ) => {
      let upload:
        ReturnType<
          SaveImportService[
            "beginUpload"
          ]
        > | null =
          null;

      try {
        const part =
          await request.file({
            limits: {
              files:
                1,

              fields:
                0,

              parts:
                1,

              fileSize:
                imports
                  .maxArchiveBytes
            }
          });

        if (!part) {
          return reply
            .code(400)
            .send({
              error:
                "save-import-file-missing",

              message:
                "A save import archive is required."
            });
        }

        if (
          part.fieldname !==
          "archive"
        ) {
          part.file.resume();

          return reply
            .code(400)
            .send({
              error:
                "save-import-invalid-field",

              message:
                "The upload field must be named archive."
            });
        }

        upload =
          imports.beginUpload();

        const stored =
          await imports
            .storeArchive(
              upload,
              part.file
            );

        if (
          part.file
            .truncated
        ) {
          throw new SaveImportError(
            "Save import archive exceeds the maximum allowed size.",
            413,
            "save-import-archive-too-large"
          );
        }

        return await imports
          .preview(
            upload,
            stored,
            part.filename
          );
      } catch (
        error
      ) {
        if (upload) {
          imports.discard(
            upload.operationId
          );
        }

        return sendError(
          reply,
          error
        );
      }
    }
  );
}