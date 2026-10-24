import { useEffect } from "react";
import { useT } from "../i18n";

const RETRY_MS = 3000;

/** A config não carregou. Tenta de novo sozinho: na janela da dock o clique pode nem chegar ao botão. */
export function LoadError({ retry }: { retry: () => void }) {
  const t = useT().common;
  useEffect(() => {
    const id = setInterval(retry, RETRY_MS);
    return () => clearInterval(id);
  }, [retry]);
  return (
    <div className="load-error" role="alert">
      <span>{t.loadFailed}</span>
      <button className="load-error-retry" onClick={retry}>
        {t.tryAgain}
      </button>
    </div>
  );
}
