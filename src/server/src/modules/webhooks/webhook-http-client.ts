import {
  promises as dns
} from "node:dns";

import {
  request as httpsRequest
} from "node:https";

import {
  BlockList,
  isIP
} from "node:net";

import type {
  WebhookDestinationKind
} from "./webhook-repository.js";

const MAX_URL_LENGTH =
  4096;

const MAX_REQUEST_BYTES =
  64 * 1024;

const REQUEST_TIMEOUT_MS =
  10_000;

const blocked =
  new BlockList();

[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4]
].forEach(
  entry => {
    blocked.addSubnet(
      entry[0] as string,
      entry[1] as number,
      "ipv4"
    );
  }
);

[
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
].forEach(
  entry => {
    blocked.addSubnet(
      entry[0] as string,
      entry[1] as number,
      "ipv6"
    );
  }
);

const discordHosts =
  new Set([
    "discord.com",
    "canary.discord.com",
    "ptb.discord.com",
    "discordapp.com"
  ]);

export class WebhookHttpError
  extends Error {
  public constructor(
    message:
      string,

    public readonly httpStatus:
      number |
      null = null
  ) {
    super(
      message
    );
  }
}

export interface WebhookHttpResult {
  statusCode:
    number;
}

interface ResolvedAddress {
  address:
    string;

  family:
    4 |
    6;
}

export class WebhookHttpClient {
  public normalizeUrl(
    kind:
      WebhookDestinationKind,

    raw:
      string
  ): string {
    if (
      raw.length ===
        0 ||
      raw.length >
        MAX_URL_LENGTH
    ) {
      throw new WebhookHttpError(
        "Webhook URL length is invalid."
      );
    }

    let url:
      URL;

    try {
      url =
        new URL(
          raw
        );
    } catch {
      throw new WebhookHttpError(
        "Webhook URL is invalid."
      );
    }

    if (
      url.protocol !==
      "https:"
    ) {
      throw new WebhookHttpError(
        "Webhook destinations must use HTTPS."
      );
    }

    if (
      url.username ||
      url.password
    ) {
      throw new WebhookHttpError(
        "Webhook URLs cannot contain URL credentials."
      );
    }

    if (
      url.hash
    ) {
      throw new WebhookHttpError(
        "Webhook URLs cannot contain fragments."
      );
    }

    if (
      kind ===
      "discord"
    ) {
      this.validateDiscordUrl(
        url
      );
    }

    return url
      .toString();
  }

  public urlHint(
    kind:
      WebhookDestinationKind,

    raw:
      string
  ): string {
    const url =
      new URL(
        this.normalizeUrl(
          kind,
          raw
        )
      );

    if (
      kind ===
      "discord"
    ) {
      return `${url.hostname} webhook`;
    }

    return url.port
      ? `${url.hostname}:${url.port}`
      : url.hostname;
  }

  public async post(
    kind:
      WebhookDestinationKind,

    rawUrl:
      string,

    payload:
      unknown
  ): Promise<WebhookHttpResult> {
    const url =
      new URL(
        this.normalizeUrl(
          kind,
          rawUrl
        )
      );

    const addresses =
      await this.resolvePublicAddresses(
        url.hostname
      );

    const selected =
      addresses[0];

    if (!selected) {
      throw new WebhookHttpError(
        "Webhook destination did not resolve to a public address."
      );
    }

    const body =
      Buffer.from(
        JSON.stringify(
          payload
        ),
        "utf8"
      );

    if (
      body.length >
      MAX_REQUEST_BYTES
    ) {
      throw new WebhookHttpError(
        "Webhook request payload is too large."
      );
    }

    return new Promise<
      WebhookHttpResult
    >(
      (
        resolve,
        reject
      ) => {
        let settled =
          false;

        const finishError =
          (
            error:
              Error
          ): void => {
            if (settled) {
              return;
            }

            settled =
              true;

            reject(
              error
            );
          };

        const finishSuccess =
          (
            statusCode:
              number
          ): void => {
            if (settled) {
              return;
            }

            settled =
              true;

            resolve({
              statusCode
            });
          };

        const request =
          httpsRequest(
            {
              protocol:
                "https:",

              hostname:
                selected.address,

              family:
                selected.family,

              port:
                url.port
                  ? Number(
                      url.port
                    )
                  : 443,

              servername:
                url.hostname,

              path:
                `${url.pathname}${url.search}`,

              method:
                "POST",

              rejectUnauthorized:
                true,

              headers: {
                Host:
                  url.host,

                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",

                "Content-Length":
                  String(
                    body.length
                  ),

                "User-Agent":
                  "KingsPalworldManager/0.1"
              }
            },

            response => {
              const statusCode =
                response.statusCode ??
                0;

              response.destroy();

              if (
                statusCode >=
                  200 &&
                statusCode <
                  300
              ) {
                finishSuccess(
                  statusCode
                );

                return;
              }

              finishError(
                new WebhookHttpError(
                  `Webhook destination returned HTTP ${statusCode}.`,
                  statusCode
                )
              );
            }
          );

        request.setTimeout(
          REQUEST_TIMEOUT_MS,
          () => {
            request.destroy(
              new WebhookHttpError(
                "Webhook request timed out."
              )
            );
          }
        );

        request.once(
          "error",
          error => {
            finishError(
              error instanceof
                WebhookHttpError
                ? error
                : new WebhookHttpError(
                    error.message
                  )
            );
          }
        );

        request.end(
          body
        );
      }
    );
  }

  private validateDiscordUrl(
    url:
      URL
  ): void {
    if (
      !discordHosts.has(
        url.hostname
          .toLowerCase()
      )
    ) {
      throw new WebhookHttpError(
        "Discord webhook URL uses an unexpected host."
      );
    }

    if (
      url.port &&
      url.port !==
      "443"
    ) {
      throw new WebhookHttpError(
        "Discord webhook URLs must use the standard HTTPS port."
      );
    }

    if (
      url.search
    ) {
      throw new WebhookHttpError(
        "Stored Discord webhook URLs cannot include query parameters."
      );
    }

    const pathValid =
      /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+\/?$/
        .test(
          url.pathname
        );

    if (!pathValid) {
      throw new WebhookHttpError(
        "Discord webhook URL path is invalid."
      );
    }
  }

  private async resolvePublicAddresses(
    hostname:
      string
  ): Promise<ResolvedAddress[]> {
    const literalFamily =
      isIP(
        hostname
      );

    let addresses:
      ResolvedAddress[];

    if (
      literalFamily ===
      4 ||
      literalFamily ===
      6
    ) {
      addresses = [
        {
          address:
            hostname,

          family:
            literalFamily
        }
      ];
    } else {
      const resolved =
        await dns.lookup(
          hostname,
          {
            all:
              true,

            verbatim:
              true
          }
        );

      addresses =
        resolved
          .filter(
            entry =>
              entry.family ===
                4 ||
              entry.family ===
                6
          )
          .map(
            entry => ({
              address:
                entry.address,

              family:
                entry.family as
                  4 |
                  6
            })
          );
    }

    if (
      addresses.length ===
      0
    ) {
      throw new WebhookHttpError(
        "Webhook destination DNS lookup returned no addresses."
      );
    }

    for (
      const entry
      of addresses
    ) {
      const type =
        entry.family ===
        4
          ? "ipv4"
          : "ipv6";

      if (
        blocked.check(
          entry.address,
          type
        )
      ) {
        throw new WebhookHttpError(
          "Webhook destination resolves to a private, local or reserved address."
        );
      }
    }

    return addresses;
  }
}