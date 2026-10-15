import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, Minus, Plus, Puzzle, Trash2 } from "lucide-react";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { ipc, type AppEntry, type Config, type PlatformInfo, type WidgetConfig } from "../lib/ipc";
import { labels, os } from "../lib/platform";
import { useConfig } from "../store/config";
import { useIcon } from "../hooks/useIcon";
import { iconKeyForEntry } from "../dock/apps";
import { addDivider, appKey, applyOrder, isDivider, removeItem, resolveOrder, START_KEY } from "../dock/order";

const TABS = ["Apps", "Widgets", "Aparência", "GitHub", "Geral"] as const;
type Tab = (typeof TABS)[number];

export const THEMES: { id: string; name: string }[] = [
  { id: "glass", name: "Vidro" },
  { id: "midnight", name: "Midnight" },
  { id: "paper", name: "Paper" },
  { id: "neon", name: "Neon" },
  { id: "aqua", name: "Aqua" },
  { id: "canarinho", name: "Canarinho" },
];

const WIDGET_NAMES: Record<string, string> = {
  media: "Player de mídia (Spotify / YouTube Music)",
  "github-review": "GitHub — PRs aguardando seu review",
  "github-mine": "GitHub — seus PRs (com status dos checks)",
  "github-commits": "GitHub — commits recentes",
  "github-contrib": "GitHub — gráfico de contribuições",
  network: "Rede",
  volume: "Volume",
  battery: "Bateria",
  clock: "Relógio e data",
};
const RESIZABLE = new Set(["media", "github-contrib"]);

function move<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function AppRowIcon({ iconKey }: { iconKey: string }) {
  const src = useIcon(iconKey);
  return src ? <img className="row-icon" src={src} alt="" /> : <div className="row-icon placeholder" />;
}

function AppsTab({ config, update }: { config: Config; update: (p: Partial<Config>) => void }) {
  const [installed, setInstalled] = useState<AppEntry[] | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    ipc.listInstalledApps().then(setInstalled).catch(() => setInstalled([]));
  }, []);
  const pinnedIds = new Set(config.pinnedApps.map((p) => p.id));
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (installed ?? []).filter((a) => !pinnedIds.has(a.id) && (!q || a.name.toLowerCase().includes(q))).slice(0, 80);
  }, [installed, query, config.pinnedApps]);

  const setPinned = (pinnedApps: AppEntry[]) => update({ pinnedApps });
  const order = resolveOrder(config);
  const appsById = new Map(config.pinnedApps.map((p) => [appKey(p.id), p]));
  const appKeys = order.filter((key) => appsById.has(key));

  const row = (key: string) => {
    const app = appsById.get(key);
    if (app) {
      const n = appKeys.indexOf(key);
      return (
        <>
          <AppRowIcon iconKey={iconKeyForEntry(app)} />
          <div className="row-main">
            <div>{app.name}</div>
            <div className="row-sub">{app.target}</div>
          </div>
          <span className="row-sub">Ctrl+Alt+{n < 9 ? n + 1 : "—"}</span>
        </>
      );
    }
    const [Icon, name] =
      key === START_KEY
        ? [LayoutGrid, `Botão ${labels.startButton}`]
        : isDivider(key)
          ? [Minus, "Separador"]
          : [Puzzle, WIDGET_NAMES[key.slice("widget:".length)] ?? key];
    return (
      <>
        <Icon className="row-icon glyph" size={18} />
        <div className="row-main">
          <div>{name}</div>
        </div>
      </>
    );
  };

  return (
    <div className="tab-grid">
      <section>
        <h3>Itens da dock</h3>
        <p className="hint">
          Apps, widgets e separadores, na ordem da dock. Arraste os itens na própria dock para reordenar, ou {labels.dropHint}.
        </p>
        <ul className="rows">
          {order.map((key, i) => (
            <li key={key}>
              {row(key)}
              <button className="icon-btn" onClick={() => update(applyOrder(config, move(order, i, -1)))}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn" onClick={() => update(applyOrder(config, move(order, i, 1)))}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-btn danger" onClick={() => update(removeItem(config, key))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="inline">
          <button className="btn ghost" onClick={() => update(addDivider(config))}>
            Adicionar separador
          </button>
          {!config.showStartButton && (
            <button className="btn ghost" onClick={() => update({ showStartButton: true })}>
              Mostrar botão {labels.startButton}
            </button>
          )}
        </div>
      </section>
      <section>
        <h3>Adicionar app</h3>
        <input className="search" placeholder="Buscar apps instalados…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {installed === null && <p className="hint">Carregando apps…</p>}
        <ul className="rows scroll">
          {results.map((app) => (
            <li key={app.id}>
              <AppRowIcon iconKey={iconKeyForEntry(app)} />
              <div className="row-main">
                <div>{app.name}</div>
              </div>
              <button className="icon-btn" onClick={() => setPinned([...config.pinnedApps, app])}>
                <Plus size={15} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WidgetsTab({ config, update }: { config: Config; update: (p: Partial<Config>) => void }) {
  const set = (widgets: WidgetConfig[]) => update({ widgets });
  return (
    <section>
      <h3>Widgets</h3>
      <p className="hint">Os widgets ligados entram no fim da dock; arraste-os na dock para misturá-los com os apps.</p>
      <ul className="rows">
        {config.widgets.map((w) => (
          <li key={w.kind}>
            <label className="check">
              <input
                type="checkbox"
                checked={w.enabled}
                onChange={(e) => set(config.widgets.map((x) => (x.kind === w.kind ? { ...x, enabled: e.target.checked } : x)))}
              />
              {WIDGET_NAMES[w.kind] ?? w.kind}
            </label>
            <div className="row-main" />
            {RESIZABLE.has(w.kind) && (
              <select
                value={w.size}
                onChange={(e) =>
                  set(config.widgets.map((x) => (x.kind === w.kind ? { ...x, size: e.target.value as WidgetConfig["size"] } : x)))
                }
              >
                <option value="small">Quadrado</option>
                <option value="wide">Largo</option>
              </select>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AppearanceTab({ config, update }: { config: Config; update: (p: Partial<Config>) => void }) {
  return (
    <>
      <section>
        <h3>Tema</h3>
        <div className="themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              data-theme={t.id}
              className={`theme-card ${config.theme === t.id ? "selected" : ""}`}
              onClick={() => update({ theme: t.id })}
            >
              <div className="theme-preview">
                <span />
                <span />
                <span />
              </div>
              {t.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Tamanho e animação</h3>
        <label className="slider">
          Tamanho dos ícones: {config.iconSize}px
          <input type="range" min={32} max={72} value={config.iconSize} onChange={(e) => update({ iconSize: Number(e.target.value) })} />
        </label>
        <label className="slider">
          Magnificação: {config.magnification <= 1 ? "desligada" : `${config.magnification.toFixed(1)}×`}
          <input
            type="range"
            min={1}
            max={2.2}
            step={0.1}
            value={config.magnification}
            onChange={(e) => update({ magnification: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={config.showRunningUnpinned}
            onChange={(e) => update({ showRunningUnpinned: e.target.checked })}
          />
          Mostrar apps abertos que não estão fixados
        </label>
      </section>
    </>
  );
}

function GithubTab({ config, update }: { config: Config; update: (p: Partial<Config>) => void }) {
  const [source, setSource] = useState<"pat" | "gh" | null | undefined>(undefined);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const refreshStatus = () => ipc.githubAuthStatus().then((s) => setSource(s.source));
  useEffect(() => {
    refreshStatus();
  }, []);

  const test = async () => {
    setResult("Testando…");
    const data = await ipc.githubFetch();
    setResult(data.error ? `Erro: ${data.error}` : `Conectado como @${data.login} — ${data.reviewCount} review(s), ${data.myPrCount} PR(s) seus.`);
  };

  return (
    <section>
      <h3>Conexão</h3>
      <p>
        {source === undefined && "Verificando…"}
        {source === "gh" && "✅ Usando o token do GitHub CLI (gh auth token)."}
        {source === "pat" && `✅ Usando o Personal Access Token salvo ${labels.keychain}.`}
        {source === null && "⚠️ Não conectado. Rode `gh auth login` no terminal ou cole um token abaixo."}
      </p>
      <div className="inline">
        <input
          className="search"
          type="password"
          placeholder="Personal Access Token (opcional — tem prioridade sobre o gh)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          className="btn"
          disabled={!token.trim()}
          onClick={async () => {
            await ipc.githubSetToken(token);
            setToken("");
            await refreshStatus();
          }}
        >
          Salvar
        </button>
        {source === "pat" && (
          <button
            className="btn ghost"
            onClick={async () => {
              await ipc.githubSetToken(null);
              await refreshStatus();
            }}
          >
            Remover token
          </button>
        )}
      </div>
      <p className="hint">O token precisa dos escopos <code>repo</code> e <code>read:user</code>. Ele nunca sai do processo nativo.</p>
      <div className="inline">
        <button className="btn" onClick={test}>
          Testar agora
        </button>
        {result && <span className="hint">{result}</span>}
      </div>
      <h3>Atualização</h3>
      <label className="slider">
        Buscar a cada {config.githubPollMinutes} min
        <input
          type="range"
          min={1}
          max={30}
          value={config.githubPollMinutes}
          onChange={(e) => update({ githubPollMinutes: Number(e.target.value) })}
        />
      </label>
    </section>
  );
}

function GeneralTab({ config, update, platform }: { config: Config; update: (p: Partial<Config>) => void; platform: PlatformInfo | null }) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);
  return (
    <section>
      <h3>Geral</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={!!autostart}
          disabled={autostart === null}
          onChange={async (e) => {
            await (e.target.checked ? enableAutostart() : disableAutostart());
            setAutostart(await autostartEnabled());
          }}
        />
        {labels.autostart}
      </label>
      <label className="inline">
        Ocultar a dock automaticamente:
        <select value={config.autoHide} onChange={(e) => update({ autoHide: e.target.value as Config["autoHide"] })}>
          <option value="smart">Quando um app estiver em uso (aparece na área de trabalho)</option>
          <option value="always">Sempre</option>
          <option value="never">{labels.autoHideNever}</option>
        </select>
      </label>
      <p className="hint">Com a dock oculta, encoste o mouse na borda de baixo da tela para ela aparecer.</p>
      {platform?.hideNative && (
        <label className="check">
          <input type="checkbox" checked={config.hideTaskbar} onChange={(e) => update({ hideTaskbar: e.target.checked })} />
          {labels.nativeBar}
        </label>
      )}
      {os === "windows" && (
        <p className="hint">
          Se a dock travar e a barra de tarefas não voltar, rode <code>win-dock.exe --restore-taskbar</code> (ou reinicie o
          explorer.exe e rode o comando).
        </p>
      )}
      {os === "macos" && (
        <p className="hint">
          Se a dock travar e o Dock do macOS não voltar, rode <code>/Applications/WinDock.app/Contents/MacOS/win-dock --restore-taskbar</code>.
        </p>
      )}
      {os === "linux" && <p className="hint">O Dash volta sozinho se a dock for encerrada, mesmo num travamento.</p>}
      <div className="inline">
        <button className="btn danger" onClick={() => ipc.quit()}>
          Sair da dock
        </button>
      </div>
    </section>
  );
}

/** Avisa quando falta algo do sistema para a dock enxergar as janelas (extensão do GNOME, permissão de Acessibilidade). */
function PlatformNotice({ platform, refresh }: { platform: PlatformInfo | null; refresh: () => void }) {
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
  let button: JSX.Element | null = null;
  switch (platform.windowList) {
    case "needs-extension":
      text = installed
        ? "Extensão instalada. Encerre a sessão e entre de novo para o GNOME carregá-la."
        : "Para a dock ver e focar as janelas abertas no GNOME, instale a extensão WinDock do GNOME Shell. Ela também reserva o espaço da dock na tela, esconde o Dash e registra os atalhos Ctrl+Alt+1..9.";
      if (!installed) {
        button = (
          <button className="btn" onClick={() => run("install-extension")}>
            Instalar extensão
          </button>
        );
      }
      break;
    case "needs-relogin":
      text = "A extensão WinDock está instalada, mas ainda não foi carregada. Encerre a sessão e entre de novo (no Wayland o GNOME só carrega extensões novas no login).";
      break;
    case "needs-accessibility":
      text = "Para listar, focar, minimizar e fechar janelas, o macOS exige a permissão de Acessibilidade (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade).";
      button = (
        <button className="btn" onClick={() => run("request-accessibility")}>
          Conceder permissão
        </button>
      );
      break;
    default:
      text = "Este ambiente não permite que a dock veja as janelas abertas (só GNOME ou sessões X11). Os apps fixados e os widgets funcionam normalmente.";
  }
  return (
    <section className="notice">
      <p>⚠️ {text}</p>
      <div className="inline">
        {button}
        <button className="btn ghost" onClick={refresh}>
          Verificar de novo
        </button>
        {error && <span className="hint">Erro: {error}</span>}
      </div>
    </section>
  );
}

export function Settings() {
  const config = useConfig((s) => s.config)!;
  const update = useConfig((s) => s.update);
  const [tab, setTab] = useState<Tab>("Apps");
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const refreshPlatform = () => void ipc.platformInfo().then(setPlatform).catch(() => {});
  useEffect(refreshPlatform, []);
  const props = { config, update: (p: Partial<Config>) => void update(p) };
  return (
    <div className="settings">
      <nav>
        <div className="brand">WinDock</div>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main>
        <PlatformNotice platform={platform} refresh={refreshPlatform} />
        {tab === "Apps" && <AppsTab {...props} />}
        {tab === "Widgets" && <WidgetsTab {...props} />}
        {tab === "Aparência" && <AppearanceTab {...props} />}
        {tab === "GitHub" && <GithubTab {...props} />}
        {tab === "Geral" && <GeneralTab {...props} platform={platform} />}
      </main>
    </div>
  );
}
