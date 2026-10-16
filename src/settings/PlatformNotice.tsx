import { useState } from "react";
import { ipc, type PlatformInfo } from "../lib/ipc";

/** Faixa âmbar quando falta algo do sistema para a dock enxergar as janelas. */
export function PlatformNotice({ platform, refresh }: { platform: PlatformInfo | null; refresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  if (!platform || platform.windowList === "ok") return null;
  const run = async (action: "install-extension" | "request-accessibility") => {
    setError(null);
    try {
      await ipc.platformSetup(action);
      if (action === "install-extension") setInstalled(true);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };
  let text: string;
  let action: { label: string; run: () => void } | null = null;
  switch (platform.windowList) {
    case "needs-extension":
      text = installed
        ? "Extensão instalada. Encerre a sessão e entre de novo para o GNOME carregá-la."
        : "Instale a extensão WinDock do GNOME Shell para a dock ver e focar as janelas, reservar o espaço na tela, esconder o Dash e registrar os atalhos.";
      if (!installed) action = { label: "Instalar extensão", run: () => run("install-extension") };
      break;
    case "needs-relogin":
      text = "A extensão WinDock está instalada, mas o GNOME só a carrega no próximo login. Encerre a sessão e entre de novo.";
      break;
    case "needs-accessibility":
      text = "Permissão de Acessibilidade necessária para listar, focar, minimizar e fechar janelas.";
      action = { label: "Conceder permissão", run: () => run("request-accessibility") };
      break;
    default:
      text = "Este ambiente não deixa a dock ver as janelas abertas (só GNOME ou sessões X11). Apps fixados e widgets funcionam normalmente.";
  }
  return (
    <div className="notice" role="status">
      <span className="notice-dot" aria-hidden />
      <span className="notice-text">
        {text}
        {error && ` Erro: ${error}`}
      </span>
      <button className="btn-text" onClick={refresh}>
        Verificar de novo
      </button>
      {action && (
        <button className="btn btn-warning" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
