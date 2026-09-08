import { z } from "zod";

export const PalworldRestInfoSchema =
  z.object({
    version:
      z.string(),

    servername:
      z.string(),

    description:
      z.string(),

    worldguid:
      z.string()
  }).passthrough();

export const PalworldRestPlayerSchema =
  z.object({
    name:
      z.string(),

    accountName:
      z.string(),

    playerId:
      z.string(),

    userId:
      z.string(),

    ip:
      z.string(),

    ping:
      z.number(),

    location_x:
      z.number(),

    location_y:
      z.number(),

    level:
      z.number()
        .int(),

    building_count:
      z.number()
        .int()
  }).passthrough();

export const PalworldRestPlayersSchema =
  z.object({
    players:
      z.array(
        PalworldRestPlayerSchema
      )
  }).passthrough();

export const PalworldRestMetricsSchema =
  z.object({
    serverfps:
      z.number()
        .int(),

    currentplayernum:
      z.number()
        .int(),

    serverframetime:
      z.number(),

    maxplayernum:
      z.number()
        .int(),

    uptime:
      z.number()
        .int(),

    basecampnum:
      z.number()
        .int(),

    days:
      z.number()
        .int()
  }).passthrough();

export const PalworldRestSettingsSchema =
  z.record(
    z.string(),
    z.unknown()
  );

export type PalworldRestInfo =
  z.infer<
    typeof PalworldRestInfoSchema
  >;

export type PalworldRestPlayers =
  z.infer<
    typeof PalworldRestPlayersSchema
  >;

export type PalworldRestMetrics =
  z.infer<
    typeof PalworldRestMetricsSchema
  >;

export type PalworldRestSettings =
  z.infer<
    typeof PalworldRestSettingsSchema
  >;