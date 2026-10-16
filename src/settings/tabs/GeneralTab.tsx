import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { labels, os } from "../../lib/platform";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Logo } from "../../ui/Logo";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";

const RESTORE_HINT = {
  windows: "Se a dock travar e a barra de tarefas não voltar, rode win-dock.exe --restore-taskbar (ou reinicie o explorer.exe e rode o comando).",
  macos: "Se a dock travar e o Dock do macOS não voltar, rode /Applications/WinDock.app/Contents/MacOS/win-dock --restore-taskbar.",
  linux: "O Dash volta sozinho se a dock for encerrada, mesmo num travamento.",
}[os];

const PERMISSION = {
  ok: "Concedida",
  "needs-accessibility": "Acessibilidade pendente",
  "needs-extension": "Extensão do GNOME não instalada",
  "needs-relogin": "Extensão instalada; entre de novo na sessão",
  unsupported: "Este ambiente não permite ver as janelas",
};

export function GeneralTab({ config, update, platform }: TabProps) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");
  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(false));
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const toggleAutostart = async (on: boolean) => {
    await (on ? enableAutostart() : disableAutostart());
    setAutostart(await autostartEnabled());
  };

  return (
    <div className="column">
      <div className="field">
        <SectionLabel>Comportamento</SectionLabel>
        <Card>
          <Row label={labels.autostart}>
            <Switch checked={!!autostart} disabled={autostart === null} label={labels.autostart} onChange={toggleAutostart} />
          </Row>
          {platform?.hideNative && (
            <Row label="Substituir a barra do sistema" description={labels.nativeBar}>
              <Switch checked={config.hideTaskbar} label="Substituir a barra do sistema" onChange={(hideTaskbar) => update({ hideTaskbar })} />
            </Row>
          )}
        </Card>
      </div>

      {platform && os !== "windows" && (
        <div className="field">
          <SectionLabel>Sistema</SectionLabel>
          <Card>
            <Row label="Janelas abertas" description={PERMISSION[platform.windowList]} />
          </Card>
        </div>
      )}

      <div className="version-card">
        <span className="version-logo">
          <Logo size={30} />
        </span>
        <div className="account-text">
          <span className="version-name">WinDock {version}</span>
          <span className="account-sub">macOS · Windows · Linux</span>
        </div>
      </div>

      <p className="field-hint">{RESTORE_HINT}</p>
    </div>
  );
}
