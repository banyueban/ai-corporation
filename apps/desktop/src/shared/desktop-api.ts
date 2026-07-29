import type { HealthResult } from "@ai-corporation/protocols";

export interface DesktopApi {
  health(): Promise<HealthResult>;
  readonly versions: Readonly<{
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  }>;
}
