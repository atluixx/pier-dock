import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { ipc, type UpdateInfo } from "../../lib/ipc";
import { labels, os } from "../../lib/platform";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Logo } from "../../ui/Logo";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";

const RESTORE_HINT = {
  windows: "Se a dock travar e a barra de tarefas não voltar, rode pier.exe --restore-taskbar (ou reinicie o explorer.exe e rode o comando).",
  macos: "Se a dock travar e o Dock do macOS não voltar, rode /Applications/Pier.app/Contents/MacOS/pier --restore-taskbar.",
  linux: "O Dash volta sozinho se a dock for encerrada, mesmo num travamento.",
}[os];

const PERMISSION = {
  ok: "Concedida",
  "needs-accessibility": "Acessibilidade pendente",
  "needs-extension": "Extensão do GNOME não instalada",
  "needs-relogin": "Extensão instalada; entre de novo na sessão",
  unsupported: "Este ambiente não permite ver as janelas",
};

type UpdateStatus =
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string };

function updateText(status: UpdateStatus) {
  switch (status.kind) {
    case "checking":
      return "Procurando atualizações…";
    case "latest":
      return "Você está na versão mais recente";
    case "available":
      return `Versão ${status.version} disponível`;
    case "installing":
      return `Instalando a versão ${status.version}…`;
    case "error":
      return status.message;
  }
}

export function GeneralTab({ config, update, platform }: TabProps) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "checking" });

  const checkUpdate = () => {
    setUpdateStatus({ kind: "checking" });
    ipc
      .checkUpdate()
      .then((info) => setUpdateStatus(info ? { kind: "available", version: info.version } : { kind: "latest" }))
      .catch(() => setUpdateStatus({ kind: "error", message: "Não foi possível procurar atualizações" }));
  };

  const installUpdate = (version: string) => {
    setUpdateStatus({ kind: "installing", version });
    ipc.installUpdate().catch(() => setUpdateStatus({ kind: "error", message: "A atualização falhou. Tente de novo." }));
  };

  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(false));
    getVersion().then(setVersion).catch(() => {});
    checkUpdate();
    const unlisten = listen<UpdateInfo>("update-available", (e) =>
      setUpdateStatus((s) => (s.kind === "installing" ? s : { kind: "available", version: e.payload.version })),
    );
    return () => {
      unlisten.then((f) => f());
    };
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
          <span className="version-name">Pier {version}</span>
          <span className="account-sub">{updateText(updateStatus)}</span>
        </div>
        {updateStatus.kind === "available" ? (
          <button className="btn btn-primary" onClick={() => installUpdate(updateStatus.version)}>
            Instalar e reiniciar
          </button>
        ) : (
          <button className="btn" disabled={updateStatus.kind === "checking" || updateStatus.kind === "installing"} onClick={checkUpdate}>
            Procurar atualizações
          </button>
        )}
      </div>

      <p className="field-hint">{RESTORE_HINT}</p>
    </div>
  );
}
