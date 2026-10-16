import type { AppEntry, Config } from "../../lib/ipc";
import { labels } from "../../lib/platform";
import { shortDate } from "../../lib/format";
import { useIcon } from "../../hooks/useIcon";
import { useNow } from "../../hooks/useSystem";
import { iconKeyForEntry } from "../../dock/apps";
import { ACCENTS } from "../../theme/accents";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";

/** Magnificação quando o usuário liga "ampliar" sem ter escolhido um valor. */
const DEFAULT_MAGNIFICATION = 1.6;

function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-field">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <span className="mono-value">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function PreviewIcon({ entry, size, active }: { entry: AppEntry; size: number; active: boolean }) {
  const src = useIcon(iconKeyForEntry(entry));
  return (
    <span className="preview-app">
      {src ? <img src={src} alt="" style={{ width: size, height: size }} /> : <span className="preview-fallback" style={{ width: size, height: size }} />}
      <span className={`indicator on ${active ? "active" : ""}`} />
    </span>
  );
}

/** A dock em miniatura sobre um fundo colorido, com o material, a opacidade e o destaque atuais. */
function LivePreview({ config }: { config: Config }) {
  const now = useNow(30_000);
  const apps = config.pinnedApps.slice(0, 5);
  return (
    <div className="preview-stage" aria-hidden>
      <span className="preview-window">
        <span />
        <span />
        <span />
      </span>
      <div className="preview-bar dock-like" data-glass>
        {apps.map((app, i) => (
          <PreviewIcon key={app.id} entry={app} size={config.iconSize} active={i === Math.min(apps.length - 1, 3)} />
        ))}
        <span className="divider" />
        <span className="preview-clock">
          <span className="clock-time">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="clock-date">{shortDate(now)}</span>
        </span>
      </div>
    </div>
  );
}

export function AppearanceTab({ config, update, platform }: TabProps) {
  const glassAvailable = platform?.glass !== false;
  const glass = config.material === "glass" && glassAvailable;
  const magnify = config.magnification > 1;

  return (
    <div className="split">
      <div className="split-list form">
        <div className="field">
          <SectionLabel>Material</SectionLabel>
          <Segmented
            label="Material"
            value={glass ? "glass" : "solid"}
            onChange={(material) => update({ material })}
            options={glassAvailable ? [{ value: "glass", label: "Vidro líquido" }, { value: "solid", label: "Sólido" }] : [{ value: "solid", label: "Sólido" }]}
          />
          {!glassAvailable && <p className="field-hint">Este sistema não desenha vidro atrás das janelas; a dock usa o material sólido.</p>}
        </div>
        {glass && (
          <Slider
            id="opacity"
            label="Opacidade do vidro"
            value={Math.round(config.glassOpacity * 100)}
            display={`${Math.round(config.glassOpacity * 100)}%`}
            min={15}
            max={90}
            step={5}
            onChange={(v) => update({ glassOpacity: v / 100 })}
          />
        )}
        <Slider id="icon-size" label="Tamanho dos ícones" value={config.iconSize} display={`${config.iconSize} px`} min={32} max={72} step={2} onChange={(iconSize) => update({ iconSize })} />
        <div className="field">
          <span className="field-label" id="accent-label">
            Cor de destaque
          </span>
          <div className="swatches" role="radiogroup" aria-labelledby="accent-label">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                role="radio"
                aria-checked={config.accent === a.key}
                aria-label={a.name}
                title={a.name}
                className="swatch"
                style={{ background: `var(--${a.key})` }}
                onClick={() => update({ accent: a.key })}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Ocultar automaticamente</span>
          <Segmented
            label="Ocultar automaticamente"
            value={config.autoHide}
            onChange={(autoHide) => update({ autoHide })}
            options={[
              { value: "smart", label: "Com app em uso" },
              { value: "always", label: "Sempre" },
              { value: "never", label: "Nunca" },
            ]}
          />
          <p className="field-hint">
            {config.autoHide === "never" ? labels.autoHideNever : "Encoste o mouse na borda de baixo da tela para a dock aparecer."}
          </p>
        </div>
        <Card>
          <Row label="Ampliar ícones ao passar o mouse">
            <Switch checked={magnify} label="Ampliar ícones ao passar o mouse" onChange={(on) => update({ magnification: on ? DEFAULT_MAGNIFICATION : 1 })} />
          </Row>
          {magnify && (
            <div className="row">
              <Slider
                id="magnification"
                label="Ampliação"
                value={config.magnification}
                display={`${config.magnification.toFixed(1)}×`}
                min={1.1}
                max={2.2}
                step={0.1}
                onChange={(magnification) => update({ magnification })}
              />
            </div>
          )}
          <Row label="Mostrar apps abertos que não estão fixados">
            <Switch checked={config.showRunningUnpinned} label="Mostrar apps abertos que não estão fixados" onChange={(showRunningUnpinned) => update({ showRunningUnpinned })} />
          </Row>
        </Card>
      </div>
      <div className="split-detail">
        <SectionLabel>Pré-visualização ao vivo</SectionLabel>
        <LivePreview config={config} />
        <p className="field-hint">
          O desfoque vem do sistema: vibrancy no macOS, Acrylic no Windows 11 e o blur do KWin no Linux. No Windows 10 e no GNOME a dock
          usa o material sólido.
        </p>
      </div>
    </div>
  );
}
