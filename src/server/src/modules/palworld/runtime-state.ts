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

  lastError: string | null;
}

export class PalworldRuntimeState {
  private current: PalworldRuntimeSnapshot = {
    status: "unknown",
    pid: null,
    startedAt: null,
    stoppedAt: null,
    lastError: null
  };

  public snapshot(): PalworldRuntimeSnapshot {
    return { ...this.current };
  }

  public setStatus(
    status: PalworldRuntimeStatus,
    values: Partial<
      Omit<PalworldRuntimeSnapshot, "status">
    > = {}
  ): void {
    this.current = {
      ...this.current,
      ...values,
      status
    };
  }
}