import type { Config, PlatformInfo } from "../lib/ipc";

export interface TabProps {
  config: Config;
  update: (patch: Partial<Config> | ((c: Config) => Partial<Config>)) => void;
  platform: PlatformInfo | null;
}
