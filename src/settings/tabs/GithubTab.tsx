import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { ipc, type WidgetKind } from "../../lib/ipc";
import { labels } from "../../lib/platform";
import { timeAgo } from "../../lib/format";
import { useGithub } from "../../hooks/useGithub";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";

const DOCK_WIDGETS: { kind: WidgetKind; label: string; description: string }[] = [
  { kind: "github-mine", label: "Pull requests abertos", description: "PRs criados por você, com o estado dos checks" },
  { kind: "github-review", label: "Revisões pendentes", description: "PRs aguardando sua revisão, com contador" },
  { kind: "github-contrib", label: "Contribuições do ano", description: "Total e mapa das últimas 20 semanas" },
  { kind: "github-commits", label: "Commits recentes", description: "Seus commits e quantos foram feitos hoje" },
];

const INTERVALS = [1, 3, 5, 15, 30];

export function GithubTab({ config, update }: TabProps) {
  const data = useGithub();
  const [source, setSource] = useState<"pat" | "gh" | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const refreshStatus = () => ipc.githubAuthStatus().then((s) => setSource(s.source));
  useEffect(() => {
    refreshStatus();
  }, []);

  const connected = !!source && !data?.error;
  const login = data?.login;
  const description =
    source === "gh"
      ? "Token do GitHub CLI (gh auth token)"
      : source === "pat"
        ? `Token pessoal · escopos repo, read:user · guardado ${labels.keychain}`
        : source === null
          ? "Rode gh auth login no terminal ou cole um Personal Access Token."
          : "Verificando…";

  const save = async () => {
    await ipc.githubSetToken(token);
    setToken("");
    setEditing(false);
    await refreshStatus();
    sync();
  };
  const removeToken = async () => {
    await ipc.githubSetToken(null);
    await refreshStatus();
  };
  const sync = async () => {
    setResult("Sincronizando…");
    const fresh = await ipc.githubFetch();
    setResult(fresh.error ? `Erro: ${fresh.error}` : `${fresh.reviewCount} revisão(ões) e ${fresh.myPrCount} PR(s) seus.`);
  };
  const setWidget = (kind: WidgetKind, enabled: boolean) =>
    update((c) => ({ widgets: c.widgets.map((w) => (w.kind === kind ? { ...w, enabled } : w)) }));
  const intervals = INTERVALS.includes(config.githubPollMinutes) ? INTERVALS : [...INTERVALS, config.githubPollMinutes].sort((a, b) => a - b);

  return (
    <div className="column">
      <div className="account-card">
        {data?.avatarUrl ? (
          <img className="account-avatar" src={data.avatarUrl} alt="" />
        ) : (
          <span className="account-avatar" aria-hidden>
            <GitBranch size={22} />
          </span>
        )}
        <div className="account-text">
          <span className="account-name">
            {login ? `@${login}` : "GitHub"}
            <span className={`status-pill ${connected ? "ok" : "off"}`}>{connected ? "Conectado" : source === undefined ? "…" : "Não conectado"}</span>
          </span>
          <span className="account-sub">{data?.error ?? description}</span>
        </div>
        <button className="btn" onClick={() => setEditing((e) => !e)}>
          {source === "pat" ? "Trocar token" : "Usar um token"}
        </button>
      </div>

      {(editing || source === null) && (
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) save();
          }}
        >
          <label className="visually-hidden" htmlFor="token">
            Personal Access Token
          </label>
          <input
            id="token"
            className="text-input"
            type="password"
            placeholder="Personal Access Token (tem prioridade sobre o gh)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!token.trim()}>
            Salvar
          </button>
          <p className="field-hint">O token precisa dos escopos repo e read:user e nunca sai do processo nativo.</p>
        </form>
      )}

      <div className="field">
        <SectionLabel>Na dock</SectionLabel>
        <Card>
          {DOCK_WIDGETS.map(({ kind, label, description }) => (
            <Row key={kind} label={label} description={description}>
              <Switch
                checked={!!config.widgets.find((w) => w.kind === kind)?.enabled}
                label={label}
                onChange={(on) => setWidget(kind, on)}
              />
            </Row>
          ))}
        </Card>
      </div>

      <div className="field">
        <SectionLabel>Sincronização</SectionLabel>
        <Card>
          <Row label="Atualizar a cada">
            <Segmented
              label="Atualizar a cada"
              value={String(config.githubPollMinutes)}
              onChange={(v) => update({ githubPollMinutes: Number(v) })}
              options={intervals.map((m) => ({ value: String(m), label: `${m} min` }))}
            />
          </Row>
        </Card>
      </div>

      <div className="column-footer">
        <span className="field-hint" role="status">
          {result ?? (data ? `Última sincronização ${timeAgo(data.fetchedAt)}` : "")}
        </span>
        {source === "pat" && (
          <button className="btn btn-danger" onClick={removeToken}>
            Remover token
          </button>
        )}
      </div>
    </div>
  );
}
