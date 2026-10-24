import { useEffect, useState } from "react";
import { ipc, type PlatformInfo } from "../lib/ipc";

/** Estados que o usuário resolve (instalar a extensão, relogar, dar permissão); os outros são limites do ambiente. */
const ACTIONABLE: PlatformInfo["windowList"][] = ["needs-extension", "needs-relogin", "needs-accessibility"];
const RECHECK_MS = 30_000;

/** A configuração é feita em outra janela (ou fora do Pier), então a dock confere de tempos em tempos até resolver. */
export function useSetupNeeded(): boolean {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const check = () =>
      ipc
        .platformInfo()
        .then((p) => {
          const pending = ACTIONABLE.includes(p.windowList);
          setNeeded(pending);
          if (!pending) clearInterval(id);
        })
        .catch(() => {});
    const id = setInterval(check, RECHECK_MS);
    check();
    return () => clearInterval(id);
  }, []);
  return needed;
}
