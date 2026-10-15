import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { ipc, type AppEntry, type Config, type WidgetConfig } from "../lib/ipc";
import { useConfig } from "../store/config";
import { useIcon } from "../hooks/useIcon";
import { iconKeyForEntry } from "../dock/apps";

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

  return (
    <div className="tab-grid">
      <section>
        <h3>Fixados na dock</h3>
        <p className="hint">Dica: arraste ícones na própria dock para reordenar, ou solte um .exe/atalho nela para fixar.</p>
        <ul className="rows">
          {config.pinnedApps.map((app, i) => (
            <li key={app.id}>
              <AppRowIcon iconKey={iconKeyForEntry(app)} />
              <div className="row-main">
                <div>{app.name}</div>
                <div className="row-sub">{app.target}</div>
              </div>
              <span className="row-sub">Ctrl+Alt+{i < 9 ? i + 1 : "—"}</span>
              <button className="icon-btn" onClick={() => setPinned(move(config.pinnedApps, i, -1))}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn" onClick={() => setPinned(move(config.pinnedApps, i, 1))}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-btn danger" onClick={() => setPinned(config.pinnedApps.filter((p) => p.id !== app.id))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
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
      <p className="hint">Aparecem à direita dos apps, nesta ordem.</p>
      <ul className="rows">
        {config.widgets.map((w, i) => (
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
            <button className="icon-btn" onClick={() => set(move(config.widgets, i, -1))}>
              <ArrowUp size={15} />
            </button>
            <button className="icon-btn" onClick={() => set(move(config.widgets, i, 1))}>
              <ArrowDown size={15} />
            </button>
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
        {source === "pat" && "✅ Usando o Personal Access Token salvo no Gerenciador de Credenciais."}
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

function GeneralTab({ config, update }: { config: Config; update: (p: Partial<Config>) => void }) {
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
        Iniciar com o Windows
      </label>
      <label className="inline">
        Ocultar a dock automaticamente:
        <select value={config.autoHide} onChange={(e) => update({ autoHide: e.target.value as Config["autoHide"] })}>
          <option value="smart">Quando um app estiver em uso (aparece na área de trabalho)</option>
          <option value="always">Sempre</option>
          <option value="never">Nunca (reserva espaço na tela)</option>
        </select>
      </label>
      <p className="hint">Com a dock oculta, encoste o mouse na borda de baixo da tela para ela aparecer.</p>
      <label className="check">
        <input type="checkbox" checked={config.hideTaskbar} onChange={(e) => update({ hideTaskbar: e.target.checked })} />
        Esconder a barra de tarefas do Windows enquanto a dock estiver aberta
      </label>
      <p className="hint">
        Se a dock travar e a barra de tarefas não voltar, rode <code>win-dock.exe --restore-taskbar</code> (ou reinicie o
        explorer.exe e rode o comando).
      </p>
      <div className="inline">
        <button className="btn danger" onClick={() => ipc.quit()}>
          Sair da dock
        </button>
      </div>
    </section>
  );
}

export function Settings() {
  const config = useConfig((s) => s.config)!;
  const update = useConfig((s) => s.update);
  const [tab, setTab] = useState<Tab>("Apps");
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
        {tab === "Apps" && <AppsTab {...props} />}
        {tab === "Widgets" && <WidgetsTab {...props} />}
        {tab === "Aparência" && <AppearanceTab {...props} />}
        {tab === "GitHub" && <GithubTab {...props} />}
        {tab === "Geral" && <GeneralTab {...props} />}
      </main>
    </div>
  );
}
