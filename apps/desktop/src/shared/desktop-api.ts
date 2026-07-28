export interface DesktopApi {
  readonly versions: Readonly<{
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  }>;
}
