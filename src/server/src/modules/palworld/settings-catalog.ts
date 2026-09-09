export type PalworldSettingCategory =
  | "General"
  | "World & Progression"
  | "Pals"
  | "Players"
  | "Building & Bases"
  | "Guilds & PvP"
  | "Server & Network"
  | "Admin & API"
  | "Performance & Logging"
  | "Advanced";

export interface PalworldSettingMetadata {
  category:
    PalworldSettingCategory;

  label:
    string;

  description:
    string |
    null;
}

interface CatalogEntry {
  category:
    PalworldSettingCategory;

  label:
    string;

  description:
    string;
}

const CATALOG:
  Readonly<
    Record<
      string,
      CatalogEntry
    >
  > = {
    Difficulty: {
      category:
        "General",

      label:
        "Difficulty",

      description:
        "Select the Palworld difficulty preset."
    },

    DayTimeSpeedRate: {
      category:
        "World & Progression",

      label:
        "Day Length Rate",

      description:
        "Controls how quickly daytime passes."
    },

    NightTimeSpeedRate: {
      category:
        "World & Progression",

      label:
        "Night Length Rate",

      description:
        "Controls how quickly nighttime passes."
    },

    ExpRate: {
      category:
        "World & Progression",

      label:
        "Experience Rate",

      description:
        "Multiplier applied to experience gained."
    },

    PalCaptureRate: {
      category:
        "Pals",

      label:
        "Pal Capture Rate",

      description:
        "Multiplier applied to Pal capture chance."
    },

    PalSpawnNumRate: {
      category:
        "Pals",

      label:
        "Pal Spawn Rate",

      description:
        "Controls Pal appearance density. Higher values can increase server load."
    },

    PalDamageRateAttack: {
      category:
        "Pals",

      label:
        "Pal Damage Dealt",

      description:
        "Multiplier for damage dealt by Pals."
    },

    PalDamageRateDefense: {
      category:
        "Pals",

      label:
        "Pal Damage Taken",

      description:
        "Multiplier for damage received by Pals."
    },

    PalStomachDecreaceRate: {
      category:
        "Pals",

      label:
        "Pal Hunger Rate",

      description:
        "Controls how quickly Pal hunger decreases."
    },

    PalStaminaDecreaceRate: {
      category:
        "Pals",

      label:
        "Pal Stamina Drain",

      description:
        "Controls Pal stamina consumption."
    },

    PalAutoHPRegeneRate: {
      category:
        "Pals",

      label:
        "Pal Health Regeneration",

      description:
        "Multiplier for Pal automatic health regeneration."
    },

    PalAutoHpRegeneRateInSleep: {
      category:
        "Pals",

      label:
        "Palbox Health Regeneration",

      description:
        "Multiplier for Pal health regeneration while resting."
    },

    PalEggDefaultHatchingTime: {
      category:
        "Pals",

      label:
        "Egg Hatching Time",

      description:
        "Base incubation time used for large eggs, measured in hours."
    },

    PlayerDamageRateAttack: {
      category:
        "Players",

      label:
        "Player Damage Dealt",

      description:
        "Multiplier for damage dealt by players."
    },

    PlayerDamageRateDefense: {
      category:
        "Players",

      label:
        "Player Damage Taken",

      description:
        "Multiplier for damage received by players."
    },

    PlayerStomachDecreaceRate: {
      category:
        "Players",

      label:
        "Player Hunger Rate",

      description:
        "Controls how quickly player hunger decreases."
    },

    PlayerStaminaDecreaceRate: {
      category:
        "Players",

      label:
        "Player Stamina Drain",

      description:
        "Controls player stamina consumption."
    },

    PlayerAutoHPRegeneRate: {
      category:
        "Players",

      label:
        "Player Health Regeneration",

      description:
        "Multiplier for automatic player health regeneration."
    },

    PlayerAutoHpRegeneRateInSleep: {
      category:
        "Players",

      label:
        "Sleeping Health Regeneration",

      description:
        "Multiplier for player health regeneration while sleeping."
    },

    DeathPenalty: {
      category:
        "Players",

      label:
        "Death Penalty",

      description:
        "Controls what players lose when they die."
    },

    WorkSpeedRate: {
      category:
        "World & Progression",

      label:
        "Work Speed Rate",

      description:
        "Multiplier applied to work speed."
    },

    CollectionDropRate: {
      category:
        "World & Progression",

      label:
        "Gathering Drop Rate",

      description:
        "Multiplier for resources obtained from gathering."
    },

    CollectionObjectHpRate: {
      category:
        "World & Progression",

      label:
        "Resource Node Health",

      description:
        "Multiplier for gatherable object durability."
    },

    CollectionObjectRespawnSpeedRate: {
      category:
        "World & Progression",

      label:
        "Resource Respawn Rate",

      description:
        "Controls how quickly gatherable resources respawn."
    },

    EnemyDropItemRate: {
      category:
        "World & Progression",

      label:
        "Enemy Drop Rate",

      description:
        "Multiplier for items dropped by enemies."
    },

    ItemWeightRate: {
      category:
        "World & Progression",

      label:
        "Item Weight Rate",

      description:
        "Multiplier applied to item weight."
    },

    ItemCorruptionMultiplier: {
      category:
        "World & Progression",

      label:
        "Item Spoilage Rate",

      description:
        "Multiplier applied to item corruption or spoilage."
    },

    BuildObjectHpRate: {
      category:
        "Building & Bases",

      label:
        "Building Health Rate",

      description:
        "Multiplier for building durability."
    },

    BuildObjectDamageRate: {
      category:
        "Building & Bases",

      label:
        "Building Damage Rate",

      description:
        "Multiplier for damage dealt to buildings."
    },

    BuildObjectDeteriorationDamageRate: {
      category:
        "Building & Bases",

      label:
        "Building Deterioration Rate",

      description:
        "Controls damage caused by building deterioration."
    },

    BaseCampMaxNum: {
      category:
        "Building & Bases",

      label:
        "Server Base Limit",

      description:
        "Maximum number of bases allowed across the server."
    },

    BaseCampMaxNumInGuild: {
      category:
        "Building & Bases",

      label:
        "Bases Per Guild",

      description:
        "Maximum number of bases allowed for one guild."
    },

    BaseCampWorkerMaxNum: {
      category:
        "Building & Bases",

      label:
        "Pals Per Base",

      description:
        "Maximum number of worker Pals assigned to a base."
    },

    MaxBuildingLimitNum: {
      category:
        "Building & Bases",

      label:
        "Buildings Per Player",

      description:
        "Per-player building count limit. Zero means unlimited."
    },

    bBuildAreaLimit: {
      category:
        "Building & Bases",

      label:
        "Limit Building Area",

      description:
        "Enables additional restrictions on building placement."
    },

    GuildPlayerMaxNum: {
      category:
        "Guilds & PvP",

      label:
        "Guild Player Limit",

      description:
        "Maximum number of players allowed in a guild."
    },

    bAutoResetGuildNoOnlinePlayers: {
      category:
        "Guilds & PvP",

      label:
        "Auto Reset Inactive Guilds",

      description:
        "Automatically resets guilds after members remain offline long enough."
    },

    AutoResetGuildTimeNoOnlinePlayers: {
      category:
        "Guilds & PvP",

      label:
        "Inactive Guild Reset Time",

      description:
        "Offline duration before automatic guild reset is triggered."
    },

    GuildRejoinCooldownMinutes: {
      category:
        "Guilds & PvP",

      label:
        "Guild Rejoin Cooldown",

      description:
        "Cooldown before a player can rejoin a guild."
    },

    bIsPvP: {
      category:
        "Guilds & PvP",

      label:
        "PvP Enabled",

      description:
        "Enables Palworld PvP mode."
    },

    bEnablePlayerToPlayerDamage: {
      category:
        "Guilds & PvP",

      label:
        "Player Damage",

      description:
        "Allows players to damage other players."
    },

    bEnableFriendlyFire: {
      category:
        "Guilds & PvP",

      label:
        "Friendly Fire",

      description:
        "Allows damage between friendly players."
    },

    bCanPickupOtherGuildDeathPenaltyDrop: {
      category:
        "Guilds & PvP",

      label:
        "Loot Other Guild Death Drops",

      description:
        "Allows players to pick up death-penalty drops belonging to another guild."
    },

    ServerName: {
      category:
        "Server & Network",

      label:
        "Server Name",

      description:
        "Name shown to players for this Palworld server."
    },

    ServerDescription: {
      category:
        "Server & Network",

      label:
        "Server Description",

      description:
        "Description presented for the server."
    },

    ServerPlayerMaxNum: {
      category:
        "Server & Network",

      label:
        "Maximum Players",

      description:
        "Maximum number of players who can join the server."
    },

    ServerPassword: {
      category:
        "Server & Network",

      label:
        "Server Password",

      description:
        "Password required for players to join the server."
    },

    PublicIP: {
      category:
        "Server & Network",

      label:
        "Public IP",

      description:
        "External public IP advertised for community-server discovery."
    },

    PublicPort: {
      category:
        "Server & Network",

      label:
        "Public Port",

      description:
        "External port advertised for community-server discovery. This does not change the actual listening port."
    },

    CrossplayPlatforms: {
      category:
        "Server & Network",

      label:
        "Crossplay Platforms",

      description:
        "Platforms permitted to connect to the server."
    },

    Region: {
      category:
        "Server & Network",

      label:
        "Region",

      description:
        "Optional server region value."
    },

    AdminPassword: {
      category:
        "Admin & API",

      label:
        "Admin Password",

      description:
        "Password used to obtain administrative privileges."
    },

    RCONEnabled: {
      category:
        "Admin & API",

      label:
        "RCON Enabled",

      description:
        "Enables the Palworld RCON administration interface."
    },

    RCONPort: {
      category:
        "Admin & API",

      label:
        "RCON Port",

      description:
        "Listening port used by the RCON administration interface."
    },

    RESTAPIEnabled: {
      category:
        "Admin & API",

      label:
        "REST API Enabled",

      description:
        "Enables the Palworld dedicated-server REST administration API."
    },

    RESTAPIPort: {
      category:
        "Admin & API",

      label:
        "REST API Port",

      description:
        "Listening port used by the Palworld REST API."
    },

    BanListURL: {
      category:
        "Admin & API",

      label:
        "Ban List URL",

      description:
        "Remote ban-list source used by Palworld."
    },

    ChatPostLimitPerMinute: {
      category:
        "Admin & API",

      label:
        "Chat Rate Limit",

      description:
        "Maximum number of chat messages allowed per minute."
    },

    bIsShowJoinLeftMessage: {
      category:
        "Admin & API",

      label:
        "Join / Leave Messages",

      description:
        "Shows in-game notifications when players join or leave."
    },

    LogFormatType: {
      category:
        "Performance & Logging",

      label:
        "Palworld Log Format",

      description:
        "Selects the Palworld server log format."
    },

    bIsUseBackupSaveData: {
      category:
        "Performance & Logging",

      label:
        "Palworld Built-in Backups",

      description:
        "Enables Palworld's own save backup mechanism. This can increase disk activity."
    },

    ServerReplicatePawnCullDistance: {
      category:
        "Performance & Logging",

      label:
        "Pal Sync Distance",

      description:
        "Distance in centimeters at which Pal replication is synchronized to players."
    },

    ItemContainerForceMarkDirtyInterval: {
      category:
        "Performance & Logging",

      label:
        "Container Resync Interval",

      description:
        "Interval in seconds for forced container synchronization while a container UI is open."
    },

    PhysicsActiveDropItemMaxNum: {
      category:
        "Performance & Logging",

      label:
        "Physics Item Limit",

      description:
        "Maximum number of dropped items allowed to use physics behavior."
    },

    DropItemMaxNum: {
      category:
        "Performance & Logging",

      label:
        "Dropped Item Limit",

      description:
        "Maximum number of dropped items kept in the world."
    },

    DropItemMaxNum_UNKO: {
      category:
        "Performance & Logging",

      label:
        "UNKO Item Limit",

      description:
        "Maximum number of UNKO dropped items."
    },

    DropItemAliveMaxHours: {
      category:
        "Performance & Logging",

      label:
        "Dropped Item Lifetime",

      description:
        "How long dropped items remain in the world."
    },

    AutoSaveSpan: {
      category:
        "Performance & Logging",

      label:
        "Autosave Interval",

      description:
        "Interval used by Palworld automatic saving."
    },

    bEnableFastTravel: {
      category:
        "World & Progression",

      label:
        "Fast Travel",

      description:
        "Enables fast travel."
    },

    bEnableFastTravelOnlyBaseCamp: {
      category:
        "World & Progression",

      label:
        "Fast Travel From Bases Only",

      description:
        "Restricts fast travel behavior to base camps."
    },

    bEnableNonLoginPenalty: {
      category:
        "World & Progression",

      label:
        "Offline Penalty",

      description:
        "Enables penalties associated with players being offline."
    },

    bHardcore: {
      category:
        "World & Progression",

      label:
        "Hardcore Mode",

      description:
        "Enables Palworld hardcore rules."
    },

    bPalLost: {
      category:
        "World & Progression",

      label:
        "Lose Pals In Hardcore",

      description:
        "Controls Pal loss behavior in hardcore play."
    },

    bCharacterRecreateInHardcore: {
      category:
        "World & Progression",

      label:
        "Recreate Character In Hardcore",

      description:
        "Controls character recreation behavior in hardcore mode."
    },

    SupplyDropSpan: {
      category:
        "World & Progression",

      label:
        "Supply Drop Interval",

      description:
        "Interval between supply drops, measured in minutes."
    },

    EnablePredatorBossPal: {
      category:
        "Pals",

      label:
        "Predator Boss Pals",

      description:
        "Enables Predator Boss Pal encounters."
    },

    bAllowGlobalPalboxExport: {
      category:
        "Pals",

      label:
        "Global Palbox Export",

      description:
        "Allows Pals to be exported to the Global Palbox."
    },

    bAllowGlobalPalboxImport: {
      category:
        "Pals",

      label:
        "Global Palbox Import",

      description:
        "Allows Pals to be imported from the Global Palbox."
    },

    bAllowClientMod: {
      category:
        "Server & Network",

      label:
        "Allow Modded Clients",

      description:
        "Allows clients with mods enabled to connect."
    },

    bEnableVoiceChat: {
      category:
        "Server & Network",

      label:
        "Voice Chat",

      description:
        "Enables in-game voice chat."
    }
  };

function humanizeKey(
  key:
    string
): string {
  return key
    .replace(
      /^b(?=[A-Z])/,
      ""
    )
    .replace(
      /_/g,
      " "
    )
    .replace(
      /([a-z0-9])([A-Z])/g,
      "$1 $2"
    )
    .replace(
      /([A-Z]+)([A-Z][a-z])/g,
      "$1 $2"
    )
    .replace(
      /\bHp\b/g,
      "HP"
    )
    .replace(
      /\bHp(?=\s|$)/g,
      "HP"
    )
    .replace(
      /\bApi\b/g,
      "API"
    )
    .replace(
      /\bRcon\b/g,
      "RCON"
    )
    .replace(
      /\bPvp\b/g,
      "PvP"
    )
    .trim();
}

function inferCategory(
  key:
    string
): PalworldSettingCategory {
  const lower =
    key.toLowerCase();

  if (
    lower.includes(
      "pal"
    ) ||
    lower.includes(
      "egg"
    ) ||
    lower.includes(
      "monster"
    )
  ) {
    return "Pals";
  }

  if (
    lower.includes(
      "guild"
    ) ||
    lower.includes(
      "pvp"
    ) ||
    lower.includes(
      "friendlyfire"
    )
  ) {
    return "Guilds & PvP";
  }

  if (
    lower.includes(
      "build"
    ) ||
    lower.includes(
      "basecamp"
    )
  ) {
    return "Building & Bases";
  }

  if (
    lower.includes(
      "server"
    ) ||
    lower.includes(
      "public"
    ) ||
    lower.includes(
      "crossplay"
    ) ||
    lower.includes(
      "voicechat"
    )
  ) {
    return "Server & Network";
  }

  if (
    lower.includes(
      "rcon"
    ) ||
    lower.includes(
      "restapi"
    ) ||
    lower.includes(
      "admin"
    ) ||
    lower.includes(
      "ban"
    ) ||
    lower.includes(
      "chat"
    )
  ) {
    return "Admin & API";
  }

  if (
    lower.includes(
      "player"
    )
  ) {
    return "Players";
  }

  if (
    lower.includes(
      "dropitemmax"
    ) ||
    lower.includes(
      "replicate"
    ) ||
    lower.includes(
      "logformat"
    ) ||
    lower.includes(
      "autosave"
    ) ||
    lower.includes(
      "force"
    )
  ) {
    return "Performance & Logging";
  }

  if (
    lower.includes(
      "rate"
    ) ||
    lower.includes(
      "penalty"
    ) ||
    lower.includes(
      "travel"
    ) ||
    lower.includes(
      "supply"
    ) ||
    lower.includes(
      "hardcore"
    )
  ) {
    return "World & Progression";
  }

  return "Advanced";
}

export function getPalworldSettingMetadata(
  key:
    string
): PalworldSettingMetadata {
  const known =
    CATALOG[key];

  if (known) {
    return {
      ...known
    };
  }

  return {
    category:
      inferCategory(
        key
      ),

    label:
      humanizeKey(
        key
      ),

    description:
      null
  };
}