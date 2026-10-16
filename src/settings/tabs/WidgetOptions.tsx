import { useState } from "react";
import { ipc, type WeatherLocation } from "../../lib/ipc";
import { labels } from "../../lib/platform";
import { useCalendar } from "../../hooks/useCalendar";
import { CYCLES } from "../../popovers/Pomodoro";
import { Row } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import type { TabProps } from "../shared";

type OptionsProps = Pick<TabProps, "config" | "update">;

const place = (l: WeatherLocation) => (l.admin ? `${l.name} · ${l.admin}` : l.name);

export function WeatherOptions({ config, update }: OptionsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const search = async () => {
    setStatus("Buscando…");
    try {
      const found = await ipc.weatherSearch(query);
      setResults(found);
      setStatus(found.length ? null : "Nenhuma cidade encontrada.");
    } catch (e) {
      setStatus(`Erro: ${e}`);
    }
  };
  const choose = (location: WeatherLocation) => {
    update({ weatherLocation: location });
    setResults(null);
    setQuery("");
  };

  return (
    <>
      <Row label="Cidade" description={config.weatherLocation ? place(config.weatherLocation) : "Nenhuma cidade escolhida"} />
      <div className="row row-stack">
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2) search();
          }}
        >
          <label className="visually-hidden" htmlFor="city">
            Buscar cidade
          </label>
          <input id="city" className="text-input" placeholder="Buscar cidade" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" type="submit" disabled={query.trim().length < 2}>
            Buscar
          </button>
          <p className="field-hint" role="status">
            {status ?? "Previsão do Open-Meteo, atualizada a cada 15 minutos."}
          </p>
        </form>
        {results && results.length > 0 && (
          <ul className="choice-list" aria-label="Cidades encontradas">
            {results.map((r) => (
              <li key={`${r.latitude},${r.longitude}`}>
                <button className="choice" onClick={() => choose(r)}>
                  <span>{r.name}</span>
                  <span className="row-description">{r.admin}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function MinutesInput({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(draft) || value)));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <>
      <input
        className="text-input number-input"
        type="number"
        min={min}
        max={max}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <span className="row-value">min</span>
    </>
  );
}

export function PomodoroOptions({ config, update }: OptionsProps) {
  const { pomodoro } = config;
  const set = (patch: Partial<typeof pomodoro>) => update((c) => ({ pomodoro: { ...c.pomodoro, ...patch } }));
  return (
    <>
      <Row label="Ciclo" description="Foco / pausa curta, em minutos. A pausa longa, depois de 4 sessões, dura 3× a curta.">
        <Segmented label="Ciclo" value={pomodoro.preset} onChange={(preset) => set({ preset })} options={CYCLES} />
      </Row>
      {pomodoro.preset === "custom" && (
        <>
          <Row label="Foco">
            <MinutesInput label="Minutos de foco" value={pomodoro.focusMinutes} min={5} max={120} onCommit={(focusMinutes) => set({ focusMinutes })} />
          </Row>
          <Row label="Pausa curta">
            <MinutesInput label="Minutos de pausa" value={pomodoro.breakMinutes} min={1} max={60} onCommit={(breakMinutes) => set({ breakMinutes })} />
          </Row>
        </>
      )}
      <Row label="Notificações" description="Avisa no fim de cada foco e de cada pausa." />
    </>
  );
}

export function CalendarOptions() {
  const data = useCalendar(true);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const configured = !!data?.configured;

  const save = async () => {
    try {
      await ipc.calendarSetUrl(url);
      setUrl("");
      setEditing(false);
      setStatus("Sincronizando…");
      const fresh = await ipc.calendarFetch();
      setStatus(fresh.error ? `Erro: ${fresh.error}` : null);
    } catch (e) {
      setStatus(`Erro: ${e}`);
    }
  };
  const remove = async () => {
    await ipc.calendarSetUrl(null);
    await ipc.calendarFetch();
    setStatus(null);
  };
  const today = data?.events.filter((e) => new Date(e.startMs).toDateString() === new Date().toDateString()).length ?? 0;
  const description = data?.error
    ? data.error
    : configured
      ? `Conectado · ${today} ${today === 1 ? "evento" : "eventos"} hoje`
      : "Cole o endereço secreto da sua agenda em formato iCal.";

  return (
    <>
      <Row label="Calendário (iCal)" description={description}>
        {configured && (
          <button className="btn btn-danger" onClick={remove}>
            Remover
          </button>
        )}
        <button className="btn" onClick={() => setEditing((e) => !e)}>
          {configured ? "Trocar link" : "Conectar"}
        </button>
      </Row>
      {(editing || (!configured && data !== null)) && (
        <div className="row row-stack">
          <form
            className="token-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) save();
            }}
          >
            <label className="visually-hidden" htmlFor="ical">
              Endereço iCal
            </label>
            <input id="ical" className="text-input" type="password" placeholder="https://… ou webcal://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={!url.trim()}>
              Salvar
            </button>
            <p className="field-hint" role="status">
              {status ??
                `Google Agenda: Configurações da agenda → Endereço secreto no formato iCal. Outlook: Calendário → Calendários compartilhados → Publicar um calendário (link ICS). O endereço fica guardado ${labels.keychain}.`}
            </p>
          </form>
        </div>
      )}
    </>
  );
}
