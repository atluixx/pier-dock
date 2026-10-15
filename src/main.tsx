import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { os } from "./lib/platform";
import { startPointerBridge } from "./lib/pointerBridge";
import { currentView } from "./lib/view";
import "./styles.css";

// O macOS desenha vidro nativo atrás do WebView; o CSS só tinge (ver `html[data-os="macos"]`).
document.documentElement.dataset.os = os;
// A janela de configurações é uma janela comum, com hover nativo.
if (os === "macos" && currentView.view !== "settings") startPointerBridge();

// Sem menu de contexto do navegador: a dock usa menus nativos.
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
