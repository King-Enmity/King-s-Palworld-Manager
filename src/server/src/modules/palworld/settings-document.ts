import type { PalworldSettingValue } from "./settings-parser.js";

interface OptionRange {
  contentStart: number;
  contentEnd: number;
}

interface RawEntry {
  key: string;
  valueStart: number;
  valueEnd: number;
}

interface Replacement {
  start: number;
  end: number;
  value: string;
}

function findOptionRange(document: string): OptionRange {
  const markerIndex = document.indexOf("OptionSettings");

  if (markerIndex < 0) {
    throw new Error("OptionSettings was not found.");
  }

  const equalsIndex = document.indexOf("=", markerIndex);
  const openIndex = document.indexOf("(", equalsIndex);

  if (equalsIndex < 0 || openIndex < 0) {
    throw new Error("OptionSettings has an invalid structure.");
  }

  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = openIndex; index < document.length; index += 1) {
    const character = document[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
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
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return {
          contentStart: openIndex + 1,
          contentEnd: index
        };
      }
    }
  }

  throw new Error("OptionSettings closing parenthesis was not found.");
}

function readEntries(
  document: string,
  range: OptionRange
): RawEntry[] {
  const entries: RawEntry[] = [];

  let start = range.contentStart;
  let quoted = false;
  let escaped = false;

  const consume = (end: number): void => {
    const raw = document.slice(start, end);
    const equalsOffset = raw.indexOf("=");

    if (equalsOffset <= 0) {
      return;
    }

    const key = raw.slice(0, equalsOffset).trim();

    if (!key) {
      return;
    }

    let valueStart = start + equalsOffset + 1;
    let valueEnd = end;

    while (
      valueStart < valueEnd &&
      /\s/.test(document[valueStart] ?? "")
    ) {
      valueStart += 1;
    }

    while (
      valueEnd > valueStart &&
      /\s/.test(document[valueEnd - 1] ?? "")
    ) {
      valueEnd -= 1;
    }

    entries.push({
      key,
      valueStart,
      valueEnd
    });
  };

  for (
    let index = range.contentStart;
    index < range.contentEnd;
    index += 1
  ) {
    const character = document[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      consume(index);
      start = index + 1;
    }
  }

  consume(range.contentEnd);

  return entries;
}

export function encodePalworldSettingValue(
  value: PalworldSettingValue
): string {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Numeric setting is not finite.");
    }

    return String(value);
  }

  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  return `"${escaped}"`;
}

export function patchPalworldSettingsDocument(
  document: string,
  changes: Readonly<Record<string, PalworldSettingValue>>
): string {
  const range = findOptionRange(document);
  const entries = readEntries(document, range);

  const byKey = new Map<string, RawEntry[]>();

  for (const entry of entries) {
    const existing = byKey.get(entry.key) ?? [];
    existing.push(entry);
    byKey.set(entry.key, existing);
  }

  const replacements: Replacement[] = [];
  const missing: Array<[string, PalworldSettingValue]> = [];

  for (const [key, value] of Object.entries(changes)) {
    const matches = byKey.get(key) ?? [];

    if (matches.length > 1) {
      throw new Error(
        `Setting ${key} appears multiple times and cannot be safely edited.`
      );
    }

    if (matches.length === 0) {
      missing.push([key, value]);
      continue;
    }

    const entry = matches[0];

    if (!entry) {
      throw new Error(
        `Setting ${key} could not be resolved for editing.`
      );
    }

    replacements.push({
      start: entry.valueStart,
      end: entry.valueEnd,
      value: encodePalworldSettingValue(value)
    });
  }

  if (missing.length > 0) {
    const existingContent =
      document.slice(range.contentStart, range.contentEnd).trim();

    const prefix = existingContent ? "," : "";

    const addition =
      prefix +
      missing
        .map(
          ([key, value]) =>
            `${key}=${encodePalworldSettingValue(value)}`
        )
        .join(",");

    replacements.push({
      start: range.contentEnd,
      end: range.contentEnd,
      value: addition
    });
  }

  replacements.sort((left, right) => right.start - left.start);

  let result = document;

  for (const replacement of replacements) {
    result =
      result.slice(0, replacement.start) +
      replacement.value +
      result.slice(replacement.end);
  }

  return result;
}