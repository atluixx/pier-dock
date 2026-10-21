#!/usr/bin/env node
// Hook dos CLIs de IA instalado pelo Pier (ver src-tauri/src/agent_sessions.rs). Lê o JSON do hook
// no stdin e grava um status por sessão em <pasta de dados do Pier>/pier-dock/agents/, que o Pier lê
// para mostrar o agent no dock e focar a janela que o lançou.
//
// Uso: pier-status.mjs --provider claude|codex|gemini --dir <pasta de status>
//
// Nunca deve travar nem falhar visivelmente: um hook quebrado não pode atrapalhar a CLI.

import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function defaultStatusDir() {
  const base = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || process.env.USERPROFILE || ".", ".claude");
  return join(base, "pier-dock", "agents");
}

function statusPath(dir, provider, sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return join(dir, `${provider}-${safe}.json`);
}

function legacyStatusPath(dir, sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return join(dir, `${safe}.json`);
}

function readPrevious(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Mapa pid -> ppid de todos os processos vivos, numa chamada só (reaproveitado para a cadeia inteira). */
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
    // Sem o mapa, a cadeia fica só com o próprio processo do hook.
  }
  return map;
}

/**
 * A cadeia de pids até a raiz — o terminal ou IDE que lançou a sessão está nela, só não sabemos em
 * qual nível. Só é calculada uma vez por sessão (no SessionStart) e reaproveitada depois: o
 * processo do hook muda a cada invocação, mas o terminal/IDE dono da sessão não.
 */
function pidChain() {
  const map = parentMap();
  const chain = [];
  let pid = process.pid;
  for (let i = 0; i < 40 && pid && !chain.includes(pid); i++) {
    chain.push(pid);
    pid = map.get(pid);
  }
  return chain;
}

/** `tool_response` varia por CLI; só os erros explícitos mais comuns são reconhecidos. */
function toolFailed(response) {
  if (!response || typeof response !== "object") return false;
  return response.is_error === true || response.isError === true || response.success === false || !!response.error;
}

/**
 * Best effort: na dúvida, fica "running" — melhor não marcar erro do que marcar um errado.
 */
function statusFor(provider, eventName, payload) {
  switch (eventName) {
    case "Notification":
    case "PermissionRequest":
      return "permission";
    case "Stop":
    case "SubagentStop":
    case "AfterAgent":
      return "done";
    case "PostToolUse":
    case "AfterTool":
      return toolFailed(payload.tool_response) ? "error" : "running";
    case "UserPromptSubmit":
    case "BeforeAgent":
    case "SessionStart":
    default:
      return "running";
  }
}

function projectName(cwd) {
  return (cwd && basename(cwd)) || cwd || "";
}

function writeAtomic(dir, path, data) {
  const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, data, "utf8");
  renameSync(tmp, path);
}

function removeStatus(dir, provider, sessionId) {
  for (const path of [statusPath(dir, provider, sessionId), legacyStatusPath(dir, sessionId)]) {
    try {
      unlinkSync(path);
    } catch {
      // Já não existia.
    }
  }
}

function main() {
  const payload = JSON.parse(readStdin() || "{}");
  const provider = arg("--provider") || "claude";
  const dir = arg("--dir") || defaultStatusDir();
  const sessionId = payload.session_id || payload.sessionId;
  const eventName = payload.hook_event_name || payload.hookEventName;
  if (!sessionId || !eventName) return;

  if (eventName === "SessionEnd") {
    removeStatus(dir, provider, sessionId);
    return;
  }

  mkdirSync(dir, { recursive: true });
  const path = statusPath(dir, provider, sessionId);
  const previous = readPrevious(path);
  const needsChain = eventName === "SessionStart" || !previous?.pidChain?.length;
  const cwd = payload.cwd || previous?.cwd || process.cwd();

  const status = {
    provider,
    sessionId,
    status: statusFor(provider, eventName, payload),
    cwd,
    project: projectName(cwd),
    pidChain: needsChain ? pidChain() : previous.pidChain,
    updatedAt: Date.now(),
  };

  writeAtomic(dir, path, JSON.stringify(status));
}

try {
  main();
} catch {
  // Silencioso: ver o comentário do topo do arquivo.
}
