export type PalworldSettingValue =
  | string
  | number
  | boolean;

export interface ParsedPalworldSettings {
  sectionFound: boolean;
  optionSettingsFound: boolean;

  settings: Record<
    string,
    PalworldSettingValue
  >;
}

function decodeValue(
  raw: string
): PalworldSettingValue {
  const value = raw.trim();

  if (
    value.length >= 2 &&
    value.startsWith('"') &&
    value.endsWith('"')
  ) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  if (
    /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)
  ) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return value;
}

function splitOptionEntries(
  contents: string
): string[] {
  const entries: string[] = [];

  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of contents) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (
      quoted &&
      character === "\\"
    ) {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }

    if (
      character === "," &&
      !quoted
    ) {
      entries.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    entries.push(current);
  }

  return entries;
}

function extractOptionSettings(
  document: string
): string | null {
  const marker = "OptionSettings";
  const markerIndex =
    document.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  const equalsIndex =
    document.indexOf("=", markerIndex);

  if (equalsIndex < 0) {
    return null;
  }

  const openIndex =
    document.indexOf("(", equalsIndex);

  if (openIndex < 0) {
    return null;
  }

  let quoted = false;
  let escaped = false;
  let depth = 0;

  for (
    let index = openIndex;
    index < document.length;
    index += 1
  ) {
    const character = document[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (
      quoted &&
      character === "\\"
    ) {
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (quoted) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return document.slice(
          openIndex + 1,
          index
        );
      }
    }
  }

  return null;
}

export function parsePalworldSettings(
  document: string
): ParsedPalworldSettings {
  const sectionFound =
    document.includes(
      "[/Script/Pal.PalGameWorldSettings]"
    );

  const optionContents =
    extractOptionSettings(document);

  if (optionContents === null) {
    return {
      sectionFound,
      optionSettingsFound: false,
      settings: {}
    };
  }

  const settings: Record<
    string,
    PalworldSettingValue
  > = {};

  for (
    const entry
    of splitOptionEntries(optionContents)
  ) {
    const equalsIndex =
      entry.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key =
      entry.slice(0, equalsIndex).trim();

    const rawValue =
      entry.slice(equalsIndex + 1);

    if (!key) {
      continue;
    }

    settings[key] =
      decodeValue(rawValue);
  }

  return {
    sectionFound,
    optionSettingsFound: true,
    settings
  };
}