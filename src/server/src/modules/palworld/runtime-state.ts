export type PalworldRuntimeStatus =
  | "unknown"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

export interface PalworldRuntimeSnapshot {
  status: PalworldRuntimeStatus;

  pid: number | null;

  startedAt: string | null;
  stoppedAt: string | null;

  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;

  lastError: string | null;
  lastTransitionAt: string;
}

export class PalworldRuntimeState {
  private current:
    PalworldRuntimeSnapshot = {
      status: "unknown",

      pid: null,

      startedAt: null,
      stoppedAt: null,

      exitCode: null,
      exitSignal: null,

      lastError: null,

      lastTransitionAt:
        new Date().toISOString()
    };

  public snapshot():
    PalworldRuntimeSnapshot {
    return {
      ...this.current
    };
  }

  public setStatus(
    status: PalworldRuntimeStatus,

    values: Partial<
      Omit<
        PalworldRuntimeSnapshot,
        "status" |
        "lastTransitionAt"
      >
    > = {}
  ): void {
    this.current = {
      ...this.current,
      ...values,

      status,

      lastTransitionAt:
        new Date().toISOString()
    };
  }
}