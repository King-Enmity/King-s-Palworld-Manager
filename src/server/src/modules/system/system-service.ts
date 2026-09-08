import type { AppConfig } from "../../config/app-config.js";
import {
  PRODUCT_EDITION,
  PRODUCT_NAME,
  PRODUCT_VERSION
} from "../../config/product.js";
import type { AuditRepository } from "../../infrastructure/audit-repository.js";
import type { PalworldRuntimeState } from "../palworld/runtime-state.js";

interface SystemServiceDependencies {
  config: Readonly<AppConfig>;
  audit: AuditRepository;
  palworldRuntime: PalworldRuntimeState;
  managerStartedAt: Date;
}

export class SystemService {
  public constructor(
    private readonly dependencies: SystemServiceDependencies
  ) {}

  public overview() {
    const now = Date.now();

    const uptimeSeconds = Math.max(
      0,
      Math.floor(
        (
          now -
          this.dependencies.managerStartedAt.getTime()
        ) / 1000
      )
    );

    return {
      product: PRODUCT_NAME,
      version: PRODUCT_VERSION,
      edition: PRODUCT_EDITION,

      authentication: false,

      manager: {
        status: "running",
        startedAt:
          this.dependencies.managerStartedAt.toISOString(),
        uptimeSeconds
      },

      persistence: {
        provider: "sqlite",
        status: "ready"
      },

      palworld: {
        runtime:
          this.dependencies.palworldRuntime.snapshot(),

        ports: {
          game:
            this.dependencies.config.palworldGamePort,
          query:
            this.dependencies.config.palworldQueryPort,
          rest:
            this.dependencies.config.palworldRestPort
        }
      },

      audit: {
        eventCount:
          this.dependencies.audit.count()
      }
    };
  }
}