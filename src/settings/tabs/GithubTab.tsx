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
import { useT } from "../../i18n";

const DOCK_WIDGETS = ["github-mine", "github-review", "github-contrib", "github-commits"] as const satisfies WidgetKind[];

const INTERVALS = [1, 3, 5, 15, 30];

export function GithubTab({ config, update }: TabProps) {
  const data = useGithub();
  const [source, setSource] = useState<"pat" | "gh" | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const t = useT();
  const tt = t.githubTab;
  const refreshStatus = () => ipc.githubAuthStatus().then((s) => setSource(s.source));
  useEffect(() => {
    refreshStatus();
  }, []);

  const connected = !!source && !data?.error;
  const login = data?.login;
  const description =
    source === "gh"
      ? tt.ghToken
      : source === "pat"
        ? tt.patToken(labels().keychain)
        : source === null
          ? tt.notConnectedHint
          : tt.checking;

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
    setResult(t.common.syncing);
    const fresh = await ipc.githubFetch();
    setResult(fresh.error ? t.common.error(fresh.error) : tt.syncResult(fresh.reviewCount, fresh.myPrCount));
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
            <span className={`status-pill ${connected ? "ok" : "off"}`}>{connected ? tt.connected : source === undefined ? "…" : tt.notConnected}</span>
          </span>
          <span className="account-sub">{data?.error ?? description}</span>
        </div>
        <button className="btn" onClick={() => setEditing((e) => !e)}>
          {source === "pat" ? tt.changeToken : tt.useToken}
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
            placeholder={tt.tokenPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!token.trim()}>
            {t.common.save}
          </button>
          <p className="field-hint">{tt.tokenHint}</p>
        </form>
      )}

      <div className="field">
        <SectionLabel>{tt.inDock}</SectionLabel>
        <Card>
          {DOCK_WIDGETS.map((kind) => {
            const { label, description } = tt.widgets[kind];
            return (
              <Row key={kind} label={label} description={description}>
                <Switch checked={!!config.widgets.find((w) => w.kind === kind)?.enabled} label={label} onChange={(on) => setWidget(kind, on)} />
              </Row>
            );
          })}
        </Card>
      </div>

      <div className="field">
        <SectionLabel>{tt.sync}</SectionLabel>
        <Card>
          <Row label={tt.every}>
            <Segmented
              label={tt.every}
              value={String(config.githubPollMinutes)}
              onChange={(v) => update({ githubPollMinutes: Number(v) })}
              options={intervals.map((m) => ({ value: String(m), label: `${m} min` }))}
            />
          </Row>
        </Card>
      </div>

      <div className="column-footer">
        <span className="field-hint" role="status">
          {result ?? (data ? tt.lastSync(timeAgo(data.fetchedAt)) : "")}
        </span>
        {source === "pat" && (
          <button className="btn btn-danger" onClick={removeToken}>
            {tt.removeToken}
          </button>
        )}
      </div>
    </div>
  );
}
