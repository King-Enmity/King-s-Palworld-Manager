import {
  existsSync
} from "node:fs";

import {
  spawn,
  type ChildProcess
} from "node:child_process";

import type {
  AuditRepository
} from "../../infrastructure/audit-repository.js";

import type {
  PalworldProcessSpec
} from "./launch-plan.js";

import {
  PalworldRuntimeState,
  type PalworldRuntimeSnapshot
} from "./runtime-state.js";

export class PalworldLifecycleError
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

export interface PalworldLifecycleRestControl {
  save():
    Promise<unknown>;

  shutdown(
    waittime: number,
    message?: string
  ): Promise<unknown>;
}

export interface PalworldLifecycleDependencies {
  runtime:
    PalworldRuntimeState;

  audit:
    AuditRepository;

  processSpec:
    PalworldProcessSpec | null;

  restControl:
    PalworldLifecycleRestControl | null;

  restShutdownWaitSeconds:
    number;

  stopTimeoutMs:
    number;
}

export class PalworldLifecycleService {
  private child:
    ChildProcess | null = null;

  private expectedStop = false;

  private operationTail:
    Promise<void> =
      Promise.resolve();

  public constructor(
    private readonly dependencies:
      PalworldLifecycleDependencies
  ) {}

  public initialize(): void {
    const spec =
      this.dependencies.processSpec;

    if (!spec) {
      this.dependencies
        .runtime
        .setStatus(
          "unknown",
          {
            pid: null,
            lastError:
              "Palworld root is not configured."
          }
        );

      return;
    }

    if (!existsSync(spec.executable)) {
      this.dependencies
        .runtime
        .setStatus(
          "unknown",
          {
            pid: null,
            lastError:
              "Palworld launch executable was not found."
          }
        );

      return;
    }

    this.dependencies
      .runtime
      .setStatus(
        "stopped",
        {
          pid: null,

          startedAt: null,
          stoppedAt: null,

          exitCode: null,
          exitSignal: null,

          lastError: null
        }
      );
  }

  public snapshot():
    PalworldRuntimeSnapshot {
    return this.dependencies
      .runtime
      .snapshot();
  }

  public start():
    Promise<PalworldRuntimeSnapshot> {
    return this.enqueue(
      () => this.startInternal()
    );
  }

  public stop():
    Promise<PalworldRuntimeSnapshot> {
    return this.enqueue(
      () => this.stopInternal()
    );
  }

  public restart():
    Promise<PalworldRuntimeSnapshot> {
    return this.enqueue(
      async () => {
        this.dependencies
          .audit
          .record({
            category:
              "palworld-lifecycle",

            action:
              "restart-requested",

            message:
              "Palworld restart requested."
          });

        await this.stopInternal();

        return this.startInternal();
      }
    );
  }

  public shutdown():
    Promise<PalworldRuntimeSnapshot> {
    return this.enqueue(
      () => this.stopInternal()
    );
  }

  private enqueue<T>(
    operation:
      () => Promise<T>
  ): Promise<T> {
    const run =
      this.operationTail.then(
        operation,
        operation
      );

    this.operationTail =
      run.then(
        () => undefined,
        () => undefined
      );

    return run;
  }

  private async startInternal():
    Promise<PalworldRuntimeSnapshot> {
    const spec =
      this.dependencies.processSpec;

    if (!spec) {
      throw new PalworldLifecycleError(
        "Palworld is not configured.",
        409,
        "palworld-not-configured"
      );
    }

    if (!existsSync(spec.executable)) {
      throw new PalworldLifecycleError(
        "Palworld launch executable does not exist.",
        409,
        "palworld-executable-missing"
      );
    }

    if (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      throw new PalworldLifecycleError(
        "Palworld is already running.",
        409,
        "palworld-already-running"
      );
    }

    const current =
      this.dependencies
        .runtime
        .snapshot();

    if (
      current.status === "starting" ||
      current.status === "running" ||
      current.status === "stopping"
    ) {
      throw new PalworldLifecycleError(
        `Palworld cannot start while runtime status is ${current.status}.`,
        409,
        "palworld-runtime-busy"
      );
    }

    this.expectedStop = false;

    this.dependencies
      .runtime
      .setStatus(
        "starting",
        {
          pid: null,

          startedAt: null,
          stoppedAt: null,

          exitCode: null,
          exitSignal: null,

          lastError: null
        }
      );

    this.dependencies
      .audit
      .record({
        category:
          "palworld-lifecycle",

        action:
          "starting",

        message:
          "Starting Palworld dedicated server.",

        metadata: {
          executable:
            spec.executable,

          arguments:
            [...spec.args]
        }
      });

    const child =
      spawn(
        spec.executable,
        [...spec.args],
        {
          cwd:
            spec.cwd,

          shell:
            false,

          detached:
            process.platform !==
            "win32",

          windowsHide:
            true,

          stdio:
            "ignore"
        }
      );

    this.child = child;

    child.once(
      "exit",
      (
        code,
        signal
      ) => {
        this.handleExit(
          child,
          code,
          signal
        );
      }
    );

    return new Promise<
      PalworldRuntimeSnapshot
    >(
      (
        resolve,
        reject
      ) => {
        let settled = false;

        child.once(
          "spawn",
          () => {
            if (settled) {
              return;
            }

            settled = true;

            this.dependencies
              .runtime
              .setStatus(
                "running",
                {
                  pid:
                    child.pid ?? null,

                  startedAt:
                    new Date()
                      .toISOString(),

                  stoppedAt:
                    null,

                  exitCode:
                    null,

                  exitSignal:
                    null,

                  lastError:
                    null
                }
              );

            this.dependencies
              .audit
              .record({
                category:
                  "palworld-lifecycle",

                action:
                  "started",

                message:
                  "Palworld dedicated server process started.",

                metadata: {
                  pid:
                    child.pid ?? null
                }
              });

            resolve(
              this.dependencies
                .runtime
                .snapshot()
            );
          }
        );

        child.once(
          "error",
          (
            error
          ) => {
            if (settled) {
              const snapshot =
                this.dependencies
                  .runtime
                  .snapshot();

              this.dependencies
                .runtime
                .setStatus(
                  snapshot.status,
                  {
                    lastError:
                      error.message
                  }
                );

              return;
            }

            settled = true;

            if (
              this.child ===
              child
            ) {
              this.child = null;
            }

            this.dependencies
              .runtime
              .setStatus(
                "stopped",
                {
                  pid: null,

                  stoppedAt:
                    new Date()
                      .toISOString(),

                  lastError:
                    error.message
                }
              );

            this.dependencies
              .audit
              .record({
                category:
                  "palworld-lifecycle",

                action:
                  "start-failed",

                severity:
                  "error",

                message:
                  "Palworld process could not be started.",

                metadata: {
                  error:
                    error.message
                }
              });

            reject(
              new PalworldLifecycleError(
                "Palworld process could not be started.",
                500,
                "palworld-start-failed"
              )
            );
          }
        );
      }
    );
  }

  private async stopInternal():
    Promise<PalworldRuntimeSnapshot> {
    const spec =
      this.dependencies.processSpec;

    if (!spec) {
      throw new PalworldLifecycleError(
        "Palworld is not configured.",
        409,
        "palworld-not-configured"
      );
    }

    const child =
      this.child;

    if (
      !child ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      this.child = null;

      const current =
        this.dependencies
          .runtime
          .snapshot();

      if (
        current.status !==
        "stopped"
      ) {
        this.dependencies
          .runtime
          .setStatus(
            "stopped",
            {
              pid: null,

              stoppedAt:
                current.stoppedAt ??
                new Date()
                  .toISOString()
            }
          );
      }

      return this.dependencies
        .runtime
        .snapshot();
    }

    this.expectedStop = true;

    this.dependencies
      .runtime
      .setStatus(
        "stopping",
        {
          pid:
            child.pid ?? null,

          lastError:
            null
        }
      );

    this.dependencies
      .audit
      .record({
        category:
          "palworld-lifecycle",

        action:
          "stopping",

        message:
          "Stopping Palworld dedicated server.",

        metadata: {
          pid:
            child.pid ?? null
        }
      });

    const restControl =
      this.dependencies
        .restControl;

    let restShutdownAccepted =
      false;

    if (restControl) {
      try {
        await restControl
          .save();

        this.dependencies
          .audit
          .record({
            category:
              "palworld-lifecycle",

            action:
              "rest-save-succeeded",

            message:
              "Palworld world save completed before shutdown."
          });
      } catch (
        error
      ) {
        this.dependencies
          .audit
          .record({
            category:
              "palworld-lifecycle",

            action:
              "rest-save-failed",

            severity:
              "warning",

            message:
              "Palworld REST save failed; shutdown will continue.",

            metadata: {
              errorType:
                error instanceof Error
                  ? error.name
                  : typeof error
            }
          });
      }

      try {
        await restControl
          .shutdown(
            this.dependencies
              .restShutdownWaitSeconds,

            "Server shutdown requested by King's Palworld Manager."
          );

        restShutdownAccepted =
          true;

        this.dependencies
          .audit
          .record({
            category:
              "palworld-lifecycle",

            action:
              "rest-shutdown-accepted",

            message:
              "Palworld accepted the graceful REST shutdown request.",

            metadata: {
              waitSeconds:
                this.dependencies
                  .restShutdownWaitSeconds
            }
          });
      } catch (
        error
      ) {
        this.dependencies
          .audit
          .record({
            category:
              "palworld-lifecycle",

            action:
              "rest-shutdown-failed",

            severity:
              "warning",

            message:
              "Palworld graceful REST shutdown was unavailable; using process fallback.",

            metadata: {
              errorType:
                error instanceof Error
                  ? error.name
                  : typeof error
            }
          });
      }
    }

    if (restShutdownAccepted) {
      const restGraceTimeoutMs =
        Math.min(
          this.dependencies
            .stopTimeoutMs,

          Math.max(
            (
              this.dependencies
                .restShutdownWaitSeconds +
              5
            ) * 1000,

            5000
          )
        );

      const exitedFromRest =
        await this.waitForExit(
          child,
          restGraceTimeoutMs
        );

      if (exitedFromRest) {
        return this.dependencies
          .runtime
          .snapshot();
      }

      this.dependencies
        .audit
        .record({
          category:
            "palworld-lifecycle",

          action:
            "rest-shutdown-timeout",

          severity:
            "warning",

          message:
            "Palworld did not exit after accepting the REST shutdown request.",

          metadata: {
            timeoutMs:
              restGraceTimeoutMs
          }
        });
    }

    this.dependencies
      .audit
      .record({
        category:
          "palworld-lifecycle",

        action:
          "signal-fallback",

        severity:
          restShutdownAccepted
            ? "warning"
            : "info",

        message:
          "Stopping Palworld using SIGTERM process fallback.",

        metadata: {
          pid:
            child.pid ?? null
        }
      });

    this.signalProcess(
      child,
      "SIGTERM"
    );

    const graceful =
      await this.waitForExit(
        child,
        this.dependencies
          .stopTimeoutMs
      );

    if (!graceful) {
      this.dependencies
        .audit
        .record({
          category:
            "palworld-lifecycle",

          action:
            "force-stop",

          severity:
            "warning",

          message:
            "Palworld exceeded the graceful stop timeout; forcing termination.",

          metadata: {
            pid:
              child.pid ?? null,

            timeoutMs:
              this.dependencies
                .stopTimeoutMs
          }
        });

      this.signalProcess(
        child,
        "SIGKILL"
      );

      const forced =
        await this.waitForExit(
          child,
          5000
        );

      if (!forced) {
        this.dependencies
          .runtime
          .setStatus(
            "crashed",
            {
              pid:
                child.pid ?? null,

              lastError:
                "Palworld process could not be terminated."
            }
          );

        throw new PalworldLifecycleError(
          "Palworld process could not be terminated.",
          500,
          "palworld-stop-failed"
        );
      }
    }

    return this.dependencies
      .runtime
      .snapshot();
  }

  private handleExit(
    child: ChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    if (
      this.child !== child
    ) {
      return;
    }

    const expected =
      this.expectedStop ||
      this.dependencies
        .runtime
        .snapshot()
        .status === "stopping";

    this.child = null;
    this.expectedStop = false;

    const stoppedAt =
      new Date()
        .toISOString();

    if (expected) {
      this.dependencies
        .runtime
        .setStatus(
          "stopped",
          {
            pid: null,

            stoppedAt,

            exitCode:
              code,

            exitSignal:
              signal,

            lastError:
              null
          }
        );

      this.dependencies
        .audit
        .record({
          category:
            "palworld-lifecycle",

          action:
            "stopped",

          message:
            "Palworld dedicated server stopped.",

          metadata: {
            exitCode:
              code,

            exitSignal:
              signal
          }
        });

      return;
    }

    const reason =
      signal
        ? `signal ${signal}`
        : `exit code ${code ?? "unknown"}`;

    this.dependencies
      .runtime
      .setStatus(
        "crashed",
        {
          pid: null,

          stoppedAt,

          exitCode:
            code,

          exitSignal:
            signal,

          lastError:
            `Palworld exited unexpectedly with ${reason}.`
        }
      );

    this.dependencies
      .audit
      .record({
        category:
          "palworld-lifecycle",

        action:
          "crashed",

        severity:
          "error",

        message:
          "Palworld dedicated server exited unexpectedly.",

        metadata: {
          exitCode:
            code,

          exitSignal:
            signal
        }
      });
  }

  private signalProcess(
    child: ChildProcess,
    signal: NodeJS.Signals
  ): void {
    const pid =
      child.pid;

    if (!pid) {
      return;
    }

    if (
      process.platform !==
      "win32"
    ) {
      try {
        process.kill(
          -pid,
          signal
        );

        return;
      } catch (
        error
      ) {
        const code =
          (
            error as
              NodeJS.ErrnoException
          ).code;

        if (code === "ESRCH") {
          return;
        }
      }
    }

    try {
      child.kill(
        signal
      );
    } catch (
      error
    ) {
      const code =
        (
          error as
            NodeJS.ErrnoException
        ).code;

      if (code !== "ESRCH") {
        throw error;
      }
    }
  }

  private waitForExit(
    child: ChildProcess,
    timeoutMs: number
  ): Promise<boolean> {
    if (
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return Promise.resolve(
        true
      );
    }

    return new Promise<boolean>(
      (
        resolve
      ) => {
        let completed = false;

        const finish = (
          value: boolean
        ): void => {
          if (completed) {
            return;
          }

          completed = true;

          clearTimeout(
            timer
          );

          child.removeListener(
            "exit",
            onExit
          );

          resolve(
            value
          );
        };

        const onExit =
          (): void => {
            finish(
              true
            );
          };

        const timer =
          setTimeout(
            () => {
              finish(
                false
              );
            },
            timeoutMs
          );

        child.once(
          "exit",
          onExit
        );
      }
    );
  }
}