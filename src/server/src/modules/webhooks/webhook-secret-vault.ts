import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";

import path from "node:path";

export interface SealedWebhookSecret {
  iv: string;
  tag: string;
  ciphertext: string;
}

export class WebhookSecretVault {
  private readonly key:
    Buffer;

  public constructor(
    dataPath:
      string
  ) {
    const secretRoot =
      path.join(
        dataPath,
        "secrets"
      );

    mkdirSync(
      secretRoot,
      {
        recursive:
          true
      }
    );

    const keyPath =
      path.join(
        secretRoot,
        "webhooks.key"
      );

    this.key =
      this.loadOrCreateKey(
        keyPath
      );
  }

  public seal(
    value:
      string
  ): SealedWebhookSecret {
    const iv =
      randomBytes(
        12
      );

    const cipher =
      createCipheriv(
        "aes-256-gcm",
        this.key,
        iv
      );

    const ciphertext =
      Buffer.concat([
        cipher.update(
          value,
          "utf8"
        ),

        cipher.final()
      ]);

    const tag =
      cipher.getAuthTag();

    return {
      iv:
        iv.toString(
          "base64"
        ),

      tag:
        tag.toString(
          "base64"
        ),

      ciphertext:
        ciphertext.toString(
          "base64"
        )
    };
  }

  public open(
    secret:
      SealedWebhookSecret
  ): string {
    const iv =
      Buffer.from(
        secret.iv,
        "base64"
      );

    const tag =
      Buffer.from(
        secret.tag,
        "base64"
      );

    const ciphertext =
      Buffer.from(
        secret.ciphertext,
        "base64"
      );

    if (
      iv.length !==
      12
    ) {
      throw new Error(
        "Webhook secret IV is invalid."
      );
    }

    if (
      tag.length !==
      16
    ) {
      throw new Error(
        "Webhook secret authentication tag is invalid."
      );
    }

    const decipher =
      createDecipheriv(
        "aes-256-gcm",
        this.key,
        iv
      );

    decipher.setAuthTag(
      tag
    );

    return Buffer.concat([
      decipher.update(
        ciphertext
      ),

      decipher.final()
    ]).toString(
      "utf8"
    );
  }

  private loadOrCreateKey(
    keyPath:
      string
  ): Buffer {
    if (
      existsSync(
        keyPath
      )
    ) {
      const key =
        Buffer.from(
          readFileSync(
            keyPath,
            "utf8"
          ).trim(),
          "base64"
        );

      if (
        key.length !==
        32
      ) {
        throw new Error(
          "Webhook secret encryption key is invalid."
        );
      }

      return key;
    }

    const key =
      randomBytes(
        32
      );

    const temporaryPath =
      `${keyPath}.tmp`;

    rmSync(
      temporaryPath,
      {
        force:
          true
      }
    );

    writeFileSync(
      temporaryPath,
      key.toString(
        "base64"
      ) + "\n",
      {
        encoding:
          "utf8",

        flag:
          "wx"
      }
    );

    if (
      process.platform !==
      "win32"
    ) {
      chmodSync(
        temporaryPath,
        0o600
      );
    }

    renameSync(
      temporaryPath,
      keyPath
    );

    return key;
  }
}