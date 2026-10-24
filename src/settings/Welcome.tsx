import { os } from "../lib/platform";
import type { Config, PlatformInfo } from "../lib/ipc";
import { useT } from "../i18n";
import { Logo } from "../ui/Logo";

/**
 * Primeiro uso: a barra do sistema continua visível até o usuário escolher aqui. Qualquer escolha
 * grava a config, e as boas-vindas não voltam.
 */
export function Welcome({ platform, update, done }: { platform: PlatformInfo | null; update: (patch: Partial<Config>) => void; done: () => void }) {
  const t = useT().welcome;
  const choose = (patch: Partial<Config>) => {
    update(patch);
    done();
  };
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <Logo size={30} />
      <div className="welcome-text">
        <h2 id="welcome-title">{t.title}</h2>
        <p>{platform?.hideNative ? t.replaceQuestion[os] : t.ready}</p>
      </div>
      {platform?.hideNative ? (
        <div className="welcome-actions">
          <button className="btn" onClick={() => choose({ hideTaskbar: false })}>
            {t.keepBoth}
          </button>
          <button className="btn btn-primary" onClick={() => choose({ hideTaskbar: true })}>
            {t.replace}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => choose({})}>
          {t.gotIt}
        </button>
      )}
    </section>
  );
}
