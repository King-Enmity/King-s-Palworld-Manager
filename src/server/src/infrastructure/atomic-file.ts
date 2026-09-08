import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";

import {
  basename,
  dirname,
  join
} from "node:path";

import { randomUUID } from "node:crypto";

export function writeTextFileAtomic(
  targetPath: string,
  contents: string
): void {
  const directory = dirname(targetPath);
  const name = basename(targetPath);

  const temporaryPath = join(
    directory,
    `.${name}.${randomUUID()}.tmp`
  );

  const oldMode = existsSync(targetPath)
    ? statSync(targetPath).mode & 0o777
    : 0o600;

  const descriptor = openSync(
    temporaryPath,
    "wx",
    oldMode
  );

  try {
    writeFileSync(
      descriptor,
      contents,
      {
        encoding: "utf8"
      }
    );

    fsyncSync(descriptor);
  } catch (error) {
    closeSync(descriptor);

    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }

    throw error;
  }

  closeSync(descriptor);

  try {
    renameSync(
      temporaryPath,
      targetPath
    );

    return;
  } catch {
    // Windows may refuse replacement of an existing target.
    // The production Linux container uses the direct atomic rename path.
  }

  const displacedPath = join(
    directory,
    `.${name}.${randomUUID()}.previous`
  );

  renameSync(
    targetPath,
    displacedPath
  );

  try {
    renameSync(
      temporaryPath,
      targetPath
    );

    unlinkSync(displacedPath);
  } catch (error) {
    if (existsSync(targetPath)) {
      unlinkSync(targetPath);
    }

    renameSync(
      displacedPath,
      targetPath
    );

    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }

    throw error;
  }
}