// Plugin do opencode instalado pelo Pier (ver src-tauri/src/agent_sessions.rs). Ele escuta os
// eventos da sessão e grava o mesmo JSON dos hooks dos outros CLIs em
// <pasta de dados do Pier>/pier-dock/agents/. Só metadados: provider, status, cwd, projeto e hora.
//
// Alvo: API de plugins do opencode V2, que exige um export default com `id` e `setup` (ou `effect`).
// No V2 o evento chega como { type, data, location, ... }; no V1 o payload vinha em `properties`,
// então `payloadOf` aceita os dois formatos de propósito.
//
// Nunca deve travar nem falhar visivelmente: um plugin quebrado não pode atrapalhar o opencode.

import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const PROVIDER = "opencode";
const PLUGIN_ID = "pier-status";
const directories = new Map();
let pidChain = null;

function agentsDir() {
  if (process.env.PIER_AGENTS_DIR) return process.env.PIER_AGENTS_DIR;
  const home = homedir();
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "pier", "pier-dock", "agents");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "pier", "pier-dock", "agents");
  }
  return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "pier", "pier-dock", "agents");
}

function statusPath(dir, sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return join(dir, `${PROVIDER}-${safe}.json`);
}

function readPrevious(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Mapa pid -> ppid de todos os processos vivos, numa chamada só. */
function parentMap() {
  const map = new Map();
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress"],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      const rows = JSON.parse(out);
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        map.set(Number(row.ProcessId), Number(row.ParentProcessId));
      }
    } else {
      const out = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 });
      for (const line of out.trim().split("\n")) {
        const [pid, ppid] = line.trim().split(/\s+/).map(Number);
        if (!Number.isNaN(pid)) map.set(pid, ppid);
      }
    }
  } catch {
    // Sem o mapa, a cadeia fica só com o próprio processo do opencode.
  }
  return map;
}

function chain() {
  if (pidChain?.length) return pidChain;
  const map = parentMap();
  const out = [];
  let pid = process.pid;
  for (let i = 0; i < 40 && pid && !out.includes(pid); i++) {
    out.push(pid);
    pid = map.get(pid);
  }
  pidChain = out;
  return out;
}

/** V2 entrega o payload em `data`; mantemos `properties` para não quebrar no V1. */
function payloadOf(event) {
  return event?.data ?? event?.properties ?? event?.payload?.properties ?? {};
}

function sessionIdOf(data) {
  return data.sessionID || data.session_id || data.info?.id || data.id;
}

function cwdOf(data, fallback) {
  return (
    data.info?.directory ||
    data.directory ||
    data.location?.directory ||
    directories.get(sessionIdOf(data)) ||
    fallback ||
    ""
  );
}

function removeStatus(sessionId) {
  try {
    unlinkSync(statusPath(agentsDir(), sessionId));
  } catch {
    // Já não existia.
  }
}

function writeStatus(sessionId, status, cwd) {
  const dir = agentsDir();
  mkdirSync(dir, { recursive: true });
  const path = statusPath(dir, sessionId);
  const previous = readPrevious(path);
  const value = {
    provider: PROVIDER,
    sessionId,
    status,
    cwd,
    project: (cwd && basename(cwd)) || cwd || "",
    pidChain: previous?.pidChain?.length ? previous.pidChain : chain(),
    updatedAt: Date.now(),
  };
  const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, JSON.stringify(value), "utf8");
  renameSync(tmp, path);
}

function statusOf(type, data) {
  if (type === "permission.asked") return "permission";
  if (type === "permission.replied") return "running";
  if (type === "session.error") return "error";
  if (type === "session.idle") return "done";
  if (type === "session.status") {
    const status = data.status;
    if (status?.type === "idle") return "done";
    if (status?.type === "busy" || status?.type === "retry") return "running";
  }
  if (type === "session.created") return "running";
  return null;
}

function handleEvent(event, defaultDirectory) {
  const type = event?.type;
  if (!type) return;

  const data = payloadOf(event);
  const sessionId = sessionIdOf(data);
  if (!sessionId) return;

  if (type === "session.deleted") {
    directories.delete(sessionId);
    removeStatus(sessionId);
    return;
  }

  const cwd = cwdOf(data, defaultDirectory);
  if (cwd) directories.set(sessionId, cwd);
  const status = statusOf(type, data);
  if (status) writeStatus(sessionId, status, cwd);
}

export default {
  id: PLUGIN_ID,
  async setup(ctx) {
    const defaultDirectory = ctx?.location?.directory || "";
    const controller = new AbortController();

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            handleEvent(event, defaultDirectory);
          } catch {
            // Silencioso: ver o comentário do topo do arquivo.
          }
        }
      } catch {
        // Assinatura encerrada (plugin descarregado) ou serviço desconectado.
      }
    })();

    return () => controller.abort();
  },
};
