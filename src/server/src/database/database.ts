import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { applyMigrations } from "./migrations.js";

export type KpmDatabase = Database.Database;

export function openDatabase(
  databasePath: string
): KpmDatabase {
  mkdirSync(
    dirname(databasePath),
    { recursive: true }
  );

  const database = new Database(databasePath);

  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");

  applyMigrations(database);

  return database;
}

export function databaseIsReady(
  database: KpmDatabase
): boolean {
  try {
    const result = database
      .prepare("SELECT 1 AS ready")
      .get() as { ready: number };

    return result.ready === 1;
  } catch {
    return false;
  }
}