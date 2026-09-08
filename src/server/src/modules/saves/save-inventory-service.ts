import {
  existsSync,
  lstatSync,
  readdirSync,
  type Stats
} from "node:fs";

import path from "node:path";

import type {
  AppConfig
} from "../../config/app-config.js";

import {
  getPalworldPaths
} from "../palworld/paths.js";

const MAX_SCAN_FILES =
  500_000;

const SAFE_IDENTIFIER =
  /^[A-Za-z0-9._-]{1,128}$/;

export interface SavePlayerSummary {
  playerId: string;

  fileName: string;

  sizeBytes: number;

  modifiedAt: string;
}

export interface SaveWorldSummary {
  slotId: string;
  worldId: string;

  fileCount: number;
  totalBytes: number;

  modifiedAt:
    string | null;

  playerCount: number;

  players:
    SavePlayerSummary[];

  hasLevelSav: boolean;
  hasLevelMetaSav: boolean;
  hasWorldOptionSav: boolean;

  backupDirectoryPresent:
    boolean;

  safe: boolean;

  warnings:
    string[];
}

export interface SaveInventorySnapshot {
  configured: boolean;

  saveGamesPresent:
    boolean;

  worlds:
    SaveWorldSummary[];

  summary: {
    worldCount: number;
    playerCount: number;
    totalBytes: number;
  };

  warnings:
    string[];
}

export class SaveInventoryError
  extends Error {
  public constructor(
    message: string,

    public readonly statusCode:
      number,

    public readonly code:
      string
  ) {
    super(message);
  }
}

export class SaveInventoryService {
  public constructor(
    private readonly config:
      Readonly<AppConfig>
  ) {}

  public snapshot():
    SaveInventorySnapshot {
    if (!this.config.palworldRoot) {
      return {
        configured:
          false,

        saveGamesPresent:
          false,

        worlds:
          [],

        summary: {
          worldCount:
            0,

          playerCount:
            0,

          totalBytes:
            0
        },

        warnings: [
          "Palworld root is not configured."
        ]
      };
    }

    const saveGames =
      getPalworldPaths(
        this.config
          .palworldRoot
      ).saveGames;

    if (!existsSync(saveGames)) {
      return {
        configured:
          true,

        saveGamesPresent:
          false,

        worlds:
          [],

        summary: {
          worldCount:
            0,

          playerCount:
            0,

          totalBytes:
            0
        },

        warnings: [
          "Palworld SaveGames directory does not exist."
        ]
      };
    }

    const worlds =
      this.discoverWorlds(
        saveGames
      );

    return {
      configured:
        true,

      saveGamesPresent:
        true,

      worlds,

      summary: {
        worldCount:
          worlds.length,

        playerCount:
          worlds.reduce(
            (
              total,
              world
            ) =>
              total +
              world.playerCount,
            0
          ),

        totalBytes:
          worlds.reduce(
            (
              total,
              world
            ) =>
              total +
              world.totalBytes,
            0
          )
      },

      warnings:
        []
    };
  }

  public worlds():
    SaveWorldSummary[] {
    return this.snapshot()
      .worlds;
  }

  public world(
    slotId: string,
    worldId: string
  ): SaveWorldSummary {
    this.validateIdentifier(
      slotId,
      "slot"
    );

    this.validateIdentifier(
      worldId,
      "world"
    );

    const world =
      this.worlds()
        .find(
          candidate =>
            candidate.slotId ===
              slotId &&
            candidate.worldId ===
              worldId
        );

    if (!world) {
      throw new SaveInventoryError(
        "Palworld save world was not found.",
        404,
        "save-world-not-found"
      );
    }

    return world;
  }

  public players(
    slotId: string,
    worldId: string
  ): {
    slotId: string;
    worldId: string;
    players: SavePlayerSummary[];
  } {
    const world =
      this.world(
        slotId,
        worldId
      );

    return {
      slotId:
        world.slotId,

      worldId:
        world.worldId,

      players:
        world.players
    };
  }

  private discoverWorlds(
    saveGames:
      string
  ): SaveWorldSummary[] {
    const worlds:
      SaveWorldSummary[] =
        [];

    for (
      const slotEntry
      of this.safeDirectoryEntries(
        saveGames
      )
    ) {
      if (
        !this.isSafeIdentifier(
          slotEntry
        )
      ) {
        continue;
      }

      const slotPath =
        path.join(
          saveGames,
          slotEntry
        );

      const slotStat =
        this.safeLstat(
          slotPath
        );

      if (
        !slotStat ||
        !slotStat.isDirectory() ||
        slotStat.isSymbolicLink()
      ) {
        continue;
      }

      for (
        const worldEntry
        of this.safeDirectoryEntries(
          slotPath
        )
      ) {
        if (
          !this.isSafeIdentifier(
            worldEntry
          )
        ) {
          continue;
        }

        const worldPath =
          path.join(
            slotPath,
            worldEntry
          );

        const worldStat =
          this.safeLstat(
            worldPath
          );

        if (
          !worldStat ||
          !worldStat.isDirectory() ||
          worldStat.isSymbolicLink()
        ) {
          continue;
        }

        if (
          !this.looksLikeWorld(
            worldPath
          )
        ) {
          continue;
        }

        worlds.push(
          this.scanWorld(
            slotEntry,
            worldEntry,
            worldPath
          )
        );
      }
    }

    worlds.sort(
      (
        left,
        right
      ) => {
        const slot =
          left.slotId
            .localeCompare(
              right.slotId
            );

        if (slot !== 0) {
          return slot;
        }

        return left.worldId
          .localeCompare(
            right.worldId
          );
      }
    );

    return worlds;
  }

  private looksLikeWorld(
    worldPath:
      string
  ): boolean {
    return (
      existsSync(
        path.join(
          worldPath,
          "Level.sav"
        )
      ) ||
      existsSync(
        path.join(
          worldPath,
          "LevelMeta.sav"
        )
      ) ||
      existsSync(
        path.join(
          worldPath,
          "Players"
        )
      )
    );
  }

  private scanWorld(
    slotId:
      string,

    worldId:
      string,

    worldPath:
      string
  ): SaveWorldSummary {
    const players:
      SavePlayerSummary[] =
        [];

    const warnings =
      new Set<string>();

    let fileCount =
      0;

    let totalBytes =
      0;

    let newestModifiedMs =
      0;

    let hasLevelSav =
      false;

    let hasLevelMetaSav =
      false;

    let hasWorldOptionSav =
      false;

    let backupDirectoryPresent =
      false;

    let safe =
      true;

    const queue:
      Array<{
        absolute: string;
        relativeParts: string[];
      }> = [
        {
          absolute:
            worldPath,

          relativeParts:
            []
        }
      ];

    while (
      queue.length >
      0
    ) {
      const current =
        queue.shift();

      if (!current) {
        break;
      }

      for (
        const name
        of this.safeDirectoryEntries(
          current.absolute
        )
      ) {
        const absolute =
          path.join(
            current.absolute,
            name
          );

        const relativeParts = [
          ...current.relativeParts,
          name
        ];

        const stat =
          this.safeLstat(
            absolute
          );

        if (!stat) {
          safe =
            false;

          warnings.add(
            "unreadable-entry"
          );

          continue;
        }

        if (
          stat.isSymbolicLink()
        ) {
          safe =
            false;

          warnings.add(
            "symbolic-link-detected"
          );

          continue;
        }

        if (
          stat.isDirectory()
        ) {
          if (
            relativeParts.length ===
              1 &&
            name.toLowerCase() ===
              "backup"
          ) {
            backupDirectoryPresent =
              true;

            continue;
          }

          queue.push({
            absolute,
            relativeParts
          });

          continue;
        }

        if (!stat.isFile()) {
          safe =
            false;

          warnings.add(
            "non-regular-file-detected"
          );

          continue;
        }

        fileCount +=
          1;

        if (
          fileCount >
          MAX_SCAN_FILES
        ) {
          safe =
            false;

          warnings.add(
            "file-count-limit-exceeded"
          );

          queue.length =
            0;

          break;
        }

        totalBytes +=
          stat.size;

        newestModifiedMs =
          Math.max(
            newestModifiedMs,
            stat.mtimeMs
          );

        if (
          relativeParts.length ===
          1
        ) {
          if (
            name ===
            "Level.sav"
          ) {
            hasLevelSav =
              true;
          }

          if (
            name ===
            "LevelMeta.sav"
          ) {
            hasLevelMetaSav =
              true;
          }

          if (
            name ===
            "WorldOption.sav"
          ) {
            hasWorldOptionSav =
              true;
          }
        }

        if (
          relativeParts.length ===
            2 &&
          relativeParts[0] ===
            "Players" &&
          name.toLowerCase()
            .endsWith(
              ".sav"
            )
        ) {
          const playerId =
            name.slice(
              0,
              -4
            );

          if (
            this.isSafeIdentifier(
              playerId
            )
          ) {
            players.push({
              playerId,

              fileName:
                name,

              sizeBytes:
                stat.size,

              modifiedAt:
                stat.mtime
                  .toISOString()
            });
          }

          if (
            !this.isSafeIdentifier(
              playerId
            )
          ) {
            safe =
              false;

            warnings.add(
              "invalid-player-save-name"
            );
          }
        }
      }
    }

    players.sort(
      (
        left,
        right
      ) =>
        left.playerId
          .localeCompare(
            right.playerId
          )
    );

    return {
      slotId,
      worldId,

      fileCount,
      totalBytes,

      modifiedAt:
        newestModifiedMs >
        0
          ? new Date(
              newestModifiedMs
            ).toISOString()
          : null,

      playerCount:
        players.length,

      players,

      hasLevelSav,
      hasLevelMetaSav,
      hasWorldOptionSav,

      backupDirectoryPresent,

      safe,

      warnings:
        [...warnings]
          .sort()
    };
  }

  private validateIdentifier(
    value: string,
    kind: string
  ): void {
    if (
      !this.isSafeIdentifier(
        value
      )
    ) {
      throw new SaveInventoryError(
        `Invalid ${kind} identifier.`,
        400,
        "invalid-save-identifier"
      );
    }
  }

  private isSafeIdentifier(
    value: string
  ): boolean {
    return (
      SAFE_IDENTIFIER.test(
        value
      ) &&
      value !== "." &&
      value !== ".."
    );
  }

  private safeDirectoryEntries(
    directory:
      string
  ): string[] {
    try {
      return readdirSync(
        directory
      );
    } catch {
      return [];
    }
  }

  private safeLstat(
    filePath:
      string
  ): Stats | null {
    try {
      return lstatSync(
        filePath
      );
    } catch {
      return null;
    }
  }
}