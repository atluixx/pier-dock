import { invoke } from "@tauri-apps/api/core";
import type { Accent } from "../theme/accents";

export interface AppEntry {
  id: string;
  name: string;
  target: string;
  exe?: string | null;
  aumid?: string | null;
}

export type WidgetKind =
  | "media"
  | "github-review"
  | "github-mine"
  | "github-commits"
  | "github-contrib"
  | "network"
  | "volume"
  | "battery"
  | "clock";

export interface WidgetConfig {
  kind: WidgetKind;
  enabled: boolean;
  size: "small" | "wide";
}

export interface Config {
  pinnedApps: AppEntry[];
  widgets: WidgetConfig[];
  material: "glass" | "solid";
  /** Opacidade da tinta sobre o vidro da dock (0 a 1). */
  glassOpacity: number;
  accent: Accent;
  iconSize: number;
  magnification: number;
  showRunningUnpinned: boolean;
  hideTaskbar: boolean;
  autoHide: "never" | "smart" | "always";
  githubPollMinutes: number;
  /** Ordem dos itens na dock: `start`, `app:<id>`, `widget:<kind>` e `divider:<id>`. */
  dockOrder: string[];
  showStartButton: boolean;
}

export interface WindowInfo {
  /** Identificador opaco da janela (HWND no Windows, id do Mutter/X11 no Linux, CGWindowID no macOS). */
  id: number;
  title: string;
  exe: string;
  aumid?: string | null;
  minimized: boolean;
}

export interface WindowsSnapshot {
  windows: WindowInfo[];
  foreground: number;
}

export interface MediaSession {
  id: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  updatedAtMs: number;
  thumbnailKey?: string | null;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
}

export interface MediaState {
  sessions: MediaSession[];
  current?: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  authorAvatar: string;
  isDraft: boolean;
  updatedAt: string;
  checks?: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
  reviewDecision?: string | null;
}

export interface Commit {
  sha: string;
  message: string;
  repo: string;
  url: string;
  date: string;
}

export interface GithubData {
  login: string;
  avatarUrl: string;
  reviewCount: number;
  reviewRequests: PullRequest[];
  myPrCount: number;
  myPrs: PullRequest[];
  commits: Commit[];
  totalContributions: number;
  weeks: { date: string; count: number }[][];
  fetchedAt: number;
  error?: string | null;
}

export interface SystemStatus {
  battery: { present: boolean; percent: number; charging: boolean };
  network: { connected: boolean; internet: boolean; wifi: boolean; signalBars?: number | null; name: string };
}

export interface Volume {
  level: number;
  muted: boolean;
}

export interface PlatformInfo {
  os: "windows" | "linux" | "macos";
  windowList: "ok" | "needs-extension" | "needs-relogin" | "needs-accessibility" | "unsupported";
  hideNative: boolean;
  shortcuts: boolean;
  /** O sistema desenha o vidro; sem ele o material é sempre sólido. */
  glass: boolean;
}

export interface UpdateInfo {
  version: string;
  notes?: string | null;
}

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  saveConfig: (config: Config) => invoke<void>("save_config", { config }),
  quit: () => invoke<void>("quit_app"),

  setDockLayout: (layout: { reservedHeight: number; windowHeight: number; hoverHeadroom: number }) =>
    invoke<void>("set_dock_layout", { layout }),
  setHitRect: (rect: { x: number; y: number; width: number; height: number; radius: number }) =>
    invoke<void>("set_hit_rect", { rect }),
  dockVisible: () => invoke<boolean>("dock_visible"),
  setDockHover: (hovering: boolean) => invoke<void>("set_dock_hover", { hovering }),

  getWindows: () => invoke<WindowsSnapshot>("get_windows"),
  toggleAppWindows: (ids: number[]) => invoke<void>("toggle_app_windows", { ids }),
  activateWindow: (id: number) => invoke<void>("activate_window", { id }),
  closeWindows: (ids: number[]) => invoke<void>("close_windows", { ids }),

  listInstalledApps: () => invoke<AppEntry[]>("list_installed_apps"),
  launchApp: (target: string) => invoke<void>("launch_app", { target }),
  resolveAppPath: (path: string) => invoke<AppEntry>("resolve_app_path", { path }),
  getIcon: (key: string) => invoke<string>("get_icon", { key }),

  mediaState: () => invoke<MediaState>("media_state"),
  mediaThumbnail: (key: string) => invoke<string | null>("media_thumbnail", { key }),
  mediaControl: (id: string, action: "toggle" | "next" | "prev" | "seek", positionMs?: number) =>
    invoke<void>("media_control", { id, action, positionMs }),

  systemStatus: () => invoke<SystemStatus>("system_status"),
  getVolume: () => invoke<Volume>("get_volume"),
  setVolume: (args: { level?: number; muted?: boolean }) => invoke<void>("set_volume", args),
  openShell: (kind: "start" | "quick-settings" | "notifications") => invoke<void>("open_shell", { kind }),

  githubFetch: () => invoke<GithubData>("github_fetch"),
  githubCached: () => invoke<GithubData | null>("github_cached"),
  githubAuthStatus: () => invoke<{ source: "pat" | "gh" | null }>("github_auth_status"),
  githubSetToken: (token: string | null) => invoke<void>("github_set_token", { token }),

  openPanel: (kind: string, anchorX: number, width: number, height: number) =>
    invoke<void>("open_panel", { kind, anchorX, width, height }),
  closePanel: () => invoke<void>("close_panel"),
  openSettings: () => invoke<void>("open_settings"),

  platformInfo: () => invoke<PlatformInfo>("platform_info"),
  platformSetup: (action: "install-extension" | "request-accessibility") => invoke<void>("platform_setup", { action }),

  checkUpdate: () => invoke<UpdateInfo | null>("check_update"),
  installUpdate: () => invoke<void>("install_update"),
};
