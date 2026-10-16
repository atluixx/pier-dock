import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Search, Trash2 } from "lucide-react";
import { ipc, type AppEntry, type Config } from "../../lib/ipc";
import { labels } from "../../lib/platform";
import { useIcon } from "../../hooks/useIcon";
import { iconKeyForEntry } from "../../dock/apps";
import { appKey, isDivider, moveAmong, removeItem, resolveOrder, START_KEY } from "../../dock/order";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Kbd } from "../../ui/Kbd";
import type { TabProps } from "../shared";

function AppIconImg({ entry, size }: { entry: AppEntry; size: number }) {
  const src = useIcon(iconKeyForEntry(entry));
  const style = { width: size, height: size };
  return src ? <img className="row-icon" style={style} src={src} alt="" /> : <span className="row-icon placeholder" style={style} />;
}

/** Itens da aba Apps: apps fixados, o botão de apps e os separadores (os widgets têm a aba deles). */
const isAppsItem = (config: Config) => {
  const ids = new Set(config.pinnedApps.map((p) => appKey(p.id)));
  return (key: string) => ids.has(key) || key === START_KEY || isDivider(key);
};

export function AppsTab({ config, update }: TabProps) {
  const [installed, setInstalled] = useState<AppEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    ipc.listInstalledApps().then(setInstalled).catch(() => setInstalled([]));
  }, []);

  const appsByKey = new Map(config.pinnedApps.map((p) => [appKey(p.id), p]));
  const among = isAppsItem(config);
  const items = resolveOrder(config).filter(among);
  const current = selected && items.includes(selected) ? selected : (items.find((k) => appsByKey.has(k)) ?? items[0]);
  const nameOf = (key: string) => appsByKey.get(key)?.name ?? (key === START_KEY ? `Botão ${labels.startButton}` : "Separador");
  const shortcutOf = (key: string) => {
    const n = config.pinnedApps.findIndex((p) => appKey(p.id) === key) + 1;
    return n >= 1 && n <= 9 ? `Ctrl Alt ${n}` : null;
  };

  const q = query.trim().toLowerCase();
  const pinnedIds = new Set(config.pinnedApps.map((p) => p.id));
  const visibleItems = items.filter((k) => !q || nameOf(k).toLowerCase().includes(q));
  const results = useMemo(
    () => (installed ?? []).filter((a) => !pinnedIds.has(a.id) && (!q || a.name.toLowerCase().includes(q))).slice(0, 80),
    [installed, q, config.pinnedApps],
  );

  const move = (key: string, delta: -1 | 1) => {
    const patch = moveAmong(config, key, delta, among);
    if (patch) update(patch);
  };
  const remove = (key: string) => update(removeItem(config, key));
  const pin = (app: AppEntry) => {
    update({ pinnedApps: [...config.pinnedApps, app] });
    setSelected(appKey(app.id));
  };

  return (
    <div className="split">
      <div className="split-list">
        <label className="search-field">
          <Search size={16} aria-hidden />
          <span className="visually-hidden">Buscar apps</span>
          <input placeholder="Buscar apps fixados e instalados…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="list-scroll">
          <SectionLabel aside={items.length}>Fixados na dock</SectionLabel>
          {visibleItems.map((key) => {
            const app = appsByKey.get(key);
            const shortcut = shortcutOf(key);
            return (
              <button key={key} className="list-item" aria-current={key === current} onClick={() => setSelected(key)}>
                {app ? <AppIconImg entry={app} size={24} /> : <span className="row-icon glyph">{key === START_KEY ? <Search size={14} /> : <Minus size={14} />}</span>}
                <span className="list-item-name">{nameOf(key)}</span>
                {shortcut && <Kbd keys={shortcut} />}
              </button>
            );
          })}
          <p className="list-hint">Arraste os itens na própria dock para reordenar, ou {labels.dropHint}.</p>
          {!config.showStartButton && (
            <button className="btn-text" onClick={() => update({ showStartButton: true })}>
              <Plus size={14} aria-hidden /> Mostrar o botão {labels.startButton}
            </button>
          )}
          <SectionLabel aside={installed ? results.length : undefined}>Instalados</SectionLabel>
          {installed === null && <p className="list-hint">Carregando apps…</p>}
          {results.map((app) => (
            <div key={app.id} className="list-item static">
              <AppIconImg entry={app} size={24} />
              <span className="list-item-name muted">{app.name}</span>
              <button className="icon-button" aria-label={`Fixar ${app.name} na dock`} title="Fixar na dock" onClick={() => pin(app)}>
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {current && (
        <ItemDetail
          name={nameOf(current)}
          app={appsByKey.get(current)}
          glyph={current === START_KEY ? <Search size={24} /> : <Minus size={24} />}
          shortcut={shortcutOf(current)}
          position={items.indexOf(current) + 1}
          total={items.length}
          onMove={(delta) => move(current, delta)}
          onRemove={() => remove(current)}
        />
      )}
    </div>
  );
}

function ItemDetail({
  name,
  app,
  glyph,
  shortcut,
  position,
  total,
  onMove,
  onRemove,
}: {
  name: string;
  app?: AppEntry;
  glyph: React.ReactNode;
  shortcut: string | null;
  position: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="split-detail">
      <div className="detail-head">
        {app ? <AppIconImg entry={app} size={56} /> : <span className="row-icon glyph large">{glyph}</span>}
        <div className="detail-title">
          <span className="detail-name">{name}</span>
          {app && <span className="detail-path">{app.target}</span>}
        </div>
      </div>
      <Card>
        {app && (
          <Row label="Atalho de teclado" description={shortcut ? "Abre ou foca o app de qualquer lugar" : "Só os 9 primeiros apps da dock têm atalho"}>
            {shortcut ? <Kbd keys={shortcut} /> : <span className="row-value">—</span>}
          </Row>
        )}
        <Row label="Posição na dock" description="Ou arraste na própria dock">
          <span className="row-value">
            {position} de {total}
          </span>
          <button className="icon-button bordered" aria-label="Mover para cima" disabled={position <= 1} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </button>
          <button className="icon-button bordered" aria-label="Mover para baixo" disabled={position >= total} onClick={() => onMove(1)}>
            <ArrowDown size={16} />
          </button>
        </Row>
      </Card>
      <div className="detail-actions">
        <button className="btn btn-danger" onClick={onRemove}>
          <Trash2 size={15} aria-hidden />
          Remover da dock
        </button>
      </div>
    </div>
  );
}
