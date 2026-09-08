import {
  createHash
} from "node:crypto";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";

import path from "node:path";

import {
  z
} from "zod";

import type {
  AppConfig
} from "../../config/app-config.js";

export const PALWORLD_STEAM_APP_ID =
  1623730;

const CACHE_MAX_AGE_MS =
  24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS =
  10_000;

const MAX_METADATA_BYTES =
  4 * 1024 * 1024;

const MAX_IMAGE_BYTES =
  16 * 1024 * 1024;

const STEAM_APP_DETAILS_URL =
  `https://store.steampowered.com/api/appdetails?appids=${PALWORLD_STEAM_APP_ID}&l=english`;

const ALLOWED_IMAGE_HOSTS =
  new Set([
    "shared.akamai.steamstatic.com",
    "cdn.akamai.steamstatic.com",
    "shared.fastly.steamstatic.com",
    "steamcdn-a.akamaihd.net"
  ]);

const SteamAppDataSchema =
  z.object({
    name:
      z.string()
        .min(1)
        .max(256),

    steam_appid:
      z.number()
        .int(),

    short_description:
      z.string()
        .max(4096)
        .optional(),

    developers:
      z.array(
        z.string()
          .max(256)
      )
        .max(32)
        .optional(),

    publishers:
      z.array(
        z.string()
          .max(256)
      )
        .max(32)
        .optional(),

    header_image:
      z.string()
        .url()
        .optional(),

    capsule_image:
      z.string()
        .url()
        .optional(),

    background:
      z.string()
        .url()
        .optional(),

    background_raw:
      z.string()
        .url()
        .optional()
  }).passthrough();

const SteamEnvelopeSchema =
  z.record(
    z.string(),
    z.object({
      success:
        z.boolean(),

      data:
        SteamAppDataSchema
          .optional()
    }).passthrough()
  );

export type SteamAssetName =
  | "header"
  | "capsule"
  | "background";

interface CachedAsset {
  sourceUrl: string;

  fileName: string;
  contentType: string;

  sizeBytes: number;
  sha256: string;
}

interface SteamCacheRecord {
  appId: number;

  name: string;
  shortDescription: string;

  developers: string[];
  publishers: string[];

  fetchedAt: string;

  assets: {
    header:
      CachedAsset |
      null;

    capsule:
      CachedAsset |
      null;

    background:
      CachedAsset |
      null;
  };
}

export interface SteamBrandingMetadata {
  appId: number;

  name: string;
  shortDescription: string;

  developers: string[];
  publishers: string[];

  fetchedAt:
    string |
    null;

  source:
    | "live"
    | "cache"
    | "unavailable";

  stale: boolean;

  assets: {
    header:
      string |
      null;

    capsule:
      string |
      null;

    background:
      string |
      null;
  };

  errors: string[];
}

export interface SteamCachedAsset {
  filePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export class SteamMetadataService {
  private readonly root:
    string;

  private readonly assetRoot:
    string;

  private readonly cachePath:
    string;

  public constructor(
    private readonly config:
      Readonly<AppConfig>
  ) {
    this.root =
      path.join(
        this.config.dataPath,
        "steam",
        "palworld"
      );

    this.assetRoot =
      path.join(
        this.root,
        "assets"
      );

    this.cachePath =
      path.join(
        this.root,
        "metadata.json"
      );

    mkdirSync(
      this.assetRoot,
      {
        recursive:
          true
      }
    );
  }

  public async metadata():
    Promise<SteamBrandingMetadata> {
    const cached =
      this.readCache();

    if (
      cached &&
      this.cacheIsFresh(
        cached
      )
    ) {
      return this.publicMetadata(
        cached,
        "cache",
        false,
        []
      );
    }

    try {
      const refreshed =
        await this.refresh();

      return this.publicMetadata(
        refreshed,
        "live",
        false,
        []
      );
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : "Steam metadata could not be refreshed.";

      if (cached) {
        return this.publicMetadata(
          cached,
          "cache",
          true,
          [
            message
          ]
        );
      }

      return {
        appId:
          PALWORLD_STEAM_APP_ID,

        name:
          "Palworld",

        shortDescription:
          "",

        developers:
          [],

        publishers:
          [],

        fetchedAt:
          null,

        source:
          "unavailable",

        stale:
          true,

        assets: {
          header:
            null,

          capsule:
            null,

          background:
            null
        },

        errors: [
          message
        ]
      };
    }
  }

  public async forceRefresh():
    Promise<SteamBrandingMetadata> {
    const refreshed =
      await this.refresh();

    return this.publicMetadata(
      refreshed,
      "live",
      false,
      []
    );
  }

  public asset(
    name:
      SteamAssetName
  ): SteamCachedAsset | null {
    const cache =
      this.readCache();

    if (!cache) {
      return null;
    }

    const asset =
      cache.assets[
        name
      ];

    if (!asset) {
      return null;
    }

    const filePath =
      path.join(
        this.assetRoot,
        asset.fileName
      );

    if (
      !existsSync(
        filePath
      )
    ) {
      return null;
    }

    const stat =
      statSync(
        filePath
      );

    if (
      !stat.isFile()
    ) {
      return null;
    }

    return {
      filePath,

      contentType:
        asset.contentType,

      sizeBytes:
        stat.size,

      sha256:
        asset.sha256
    };
  }

  private async refresh():
    Promise<SteamCacheRecord> {
    const response =
      await this.fetchWithTimeout(
        STEAM_APP_DETAILS_URL
      );

    if (!response.ok) {
      throw new Error(
        `Steam metadata returned HTTP ${response.status}.`
      );
    }

    const bytes =
      await this.readResponseBytes(
        response,
        MAX_METADATA_BYTES
      );

    let json:
      unknown;

    try {
      json =
        JSON.parse(
          bytes.toString(
            "utf8"
          )
        );
    } catch {
      throw new Error(
        "Steam metadata response was not valid JSON."
      );
    }

    const envelope =
      SteamEnvelopeSchema
        .safeParse(
          json
        );

    if (!envelope.success) {
      throw new Error(
        "Steam metadata did not match the expected response shape."
      );
    }

    const entry =
      envelope.data[
        String(
          PALWORLD_STEAM_APP_ID
        )
      ];

    if (
      !entry ||
      !entry.success ||
      !entry.data
    ) {
      throw new Error(
        "Steam did not return Palworld application metadata."
      );
    }

    if (
      entry.data.steam_appid !==
      PALWORLD_STEAM_APP_ID
    ) {
      throw new Error(
        "Steam metadata returned an unexpected application ID."
      );
    }

    const previous =
      this.readCache();

    const header =
      await this.downloadAsset(
        "header",
        entry.data
          .header_image,
        previous?.assets
          .header ??
        null
      );

    const capsule =
      await this.downloadAsset(
        "capsule",
        entry.data
          .capsule_image ??
        entry.data
          .header_image,
        previous?.assets
          .capsule ??
        null
      );

    const background =
      await this.downloadAsset(
        "background",
        entry.data
          .background_raw ??
        entry.data
          .background,
        previous?.assets
          .background ??
        null
      );

    const record:
      SteamCacheRecord = {
        appId:
          PALWORLD_STEAM_APP_ID,

        name:
          entry.data.name,

        shortDescription:
          entry.data
            .short_description ??
          "",

        developers:
          entry.data
            .developers ??
          [],

        publishers:
          entry.data
            .publishers ??
          [],

        fetchedAt:
          new Date()
            .toISOString(),

        assets: {
          header,
          capsule,
          background
        }
      };

    this.writeCache(
      record
    );

    return record;
  }

  private async downloadAsset(
    name:
      SteamAssetName,

    sourceUrl:
      string |
      undefined,

    previous:
      CachedAsset |
      null
  ): Promise<CachedAsset | null> {
    if (!sourceUrl) {
      return previous;
    }

    this.assertSteamImageUrl(
      sourceUrl
    );

    if (
      previous?.sourceUrl ===
      sourceUrl
    ) {
      const previousPath =
        path.join(
          this.assetRoot,
          previous.fileName
        );

      if (
        existsSync(
          previousPath
        )
      ) {
        return previous;
      }
    }

    const response =
      await this.fetchWithTimeout(
        sourceUrl
      );

    if (!response.ok) {
      if (previous) {
        return previous;
      }

      throw new Error(
        `Steam ${name} artwork returned HTTP ${response.status}.`
      );
    }

    const contentType =
      (
        response.headers
          .get(
            "content-type"
          ) ??
        ""
      )
        .split(
          ";"
        )[0]
        ?.trim()
        .toLowerCase() ??
      "";

    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif"
      ].includes(
        contentType
      )
    ) {
      throw new Error(
        `Steam ${name} artwork returned an unsupported content type.`
      );
    }

    const bytes =
      await this.readResponseBytes(
        response,
        MAX_IMAGE_BYTES
      );

    const sha256 =
      createHash(
        "sha256"
      )
        .update(
          bytes
        )
        .digest(
          "hex"
        );

    const fileName =
      `${name}.asset`;

    const finalPath =
      path.join(
        this.assetRoot,
        fileName
      );

    const temporaryPath =
      `${finalPath}.tmp`;

    rmSync(
      temporaryPath,
      {
        force:
          true
      }
    );

    writeFileSync(
      temporaryPath,
      bytes,
      {
        flag:
          "wx"
      }
    );

    renameSync(
      temporaryPath,
      finalPath
    );

    return {
      sourceUrl,
      fileName,
      contentType,

      sizeBytes:
        bytes.length,

      sha256
    };
  }

  private publicMetadata(
    record:
      SteamCacheRecord,

    source:
      "live" |
      "cache",

    stale:
      boolean,

    errors:
      string[]
  ): SteamBrandingMetadata {
    return {
      appId:
        record.appId,

      name:
        record.name,

      shortDescription:
        record.shortDescription,

      developers:
        record.developers,

      publishers:
        record.publishers,

      fetchedAt:
        record.fetchedAt,

      source,
      stale,

      assets: {
        header:
          record.assets
            .header
            ? "/api/v1/steam/palworld/assets/header"
            : null,

        capsule:
          record.assets
            .capsule
            ? "/api/v1/steam/palworld/assets/capsule"
            : null,

        background:
          record.assets
            .background
            ? "/api/v1/steam/palworld/assets/background"
            : null
      },

      errors
    };
  }

  private cacheIsFresh(
    record:
      SteamCacheRecord
  ): boolean {
    const timestamp =
      Date.parse(
        record.fetchedAt
      );

    if (
      Number.isNaN(
        timestamp
      )
    ) {
      return false;
    }

    return (
      Date.now() -
      timestamp
    ) <
      CACHE_MAX_AGE_MS;
  }

  private readCache():
    SteamCacheRecord | null {
    try {
      if (
        !existsSync(
          this.cachePath
        )
      ) {
        return null;
      }

      const raw =
        JSON.parse(
          readFileSync(
            this.cachePath,
            "utf8"
          )
        ) as
          SteamCacheRecord;

      if (
        raw.appId !==
          PALWORLD_STEAM_APP_ID ||
        typeof raw.name !==
          "string" ||
        typeof raw.fetchedAt !==
          "string" ||
        !raw.assets
      ) {
        return null;
      }

      return raw;
    } catch {
      return null;
    }
  }

  private writeCache(
    record:
      SteamCacheRecord
  ): void {
    const temporaryPath =
      `${this.cachePath}.tmp`;

    rmSync(
      temporaryPath,
      {
        force:
          true
      }
    );

    writeFileSync(
      temporaryPath,

      JSON.stringify(
        record,
        null,
        2
      ) + "\n",

      {
        encoding:
          "utf8",

        flag:
          "wx"
      }
    );

    renameSync(
      temporaryPath,
      this.cachePath
    );
  }

  private assertSteamImageUrl(
    value:
      string
  ): void {
    let url:
      URL;

    try {
      url =
        new URL(
          value
        );
    } catch {
      throw new Error(
        "Steam artwork URL is invalid."
      );
    }

    if (
      url.protocol !==
      "https:"
    ) {
      throw new Error(
        "Steam artwork URL must use HTTPS."
      );
    }

    if (
      !ALLOWED_IMAGE_HOSTS
        .has(
          url.hostname
            .toLowerCase()
        )
    ) {
      throw new Error(
        "Steam artwork URL used an unexpected host."
      );
    }
  }

  private async fetchWithTimeout(
    url:
      string
  ): Promise<Response> {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        FETCH_TIMEOUT_MS
      );

    try {
      return await fetch(
        url,
        {
          method:
            "GET",

          redirect:
            "error",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json,image/avif,image/webp,image/png,image/jpeg,*/*",

            "User-Agent":
              "KingsPalworldManager/0.1"
          }
        }
      );
    } catch (
      error
    ) {
      if (
        controller.signal
          .aborted
      ) {
        throw new Error(
          "Steam request timed out."
        );
      }

      throw error;
    } finally {
      clearTimeout(
        timer
      );
    }
  }

  private async readResponseBytes(
    response:
      Response,

    maximumBytes:
      number
  ): Promise<Buffer> {
    const advertised =
      response.headers
        .get(
          "content-length"
        );

    if (advertised) {
      const parsed =
        Number(
          advertised
        );

      if (
        Number.isFinite(
          parsed
        ) &&
        parsed >
          maximumBytes
      ) {
        throw new Error(
          "Steam response exceeded the allowed size."
        );
      }
    }

    const buffer =
      Buffer.from(
        await response
          .arrayBuffer()
      );

    if (
      buffer.length >
      maximumBytes
    ) {
      throw new Error(
        "Steam response exceeded the allowed size."
      );
    }

    return buffer;
  }
}