/** Sistema em que a dock está rodando, detectado pelo WebView (WebView2, WebKitGTK ou WKWebView). */
export type Os = "windows" | "linux" | "macos";

const ua = navigator.userAgent;
export const os: Os = /Windows/i.test(ua) ? "windows" : /Macintosh|Mac OS X/i.test(ua) ? "macos" : "linux";

/** Textos que mudam conforme o sistema. */
export const labels = {
  startButton: { windows: "Iniciar", linux: "Aplicativos", macos: "Aplicativos" }[os],
  autostart: { windows: "Iniciar com o Windows", linux: "Iniciar junto com a sessão", macos: "Iniciar junto com o macOS" }[os],
  nativeBar: {
    windows: "Esconder a barra de tarefas do Windows enquanto a dock estiver aberta",
    linux: "Esconder o Dash do GNOME (e o Dash to Dock / Ubuntu Dock) enquanto a dock estiver aberta",
    macos: "Esconder o Dock do macOS enquanto a dock estiver aberta",
  }[os],
  quit: { windows: "Sair da dock (restaura a taskbar)", linux: "Sair da dock", macos: "Sair da dock" }[os],
  dropHint: {
    windows: "solte um .exe/atalho nela para fixar",
    linux: "solte um arquivo .desktop, executável ou pasta nela para fixar",
    macos: "solte um app (.app) ou pasta nela para fixar",
  }[os],
  autoHideNever: {
    windows: "Nunca (reserva espaço na tela)",
    linux: "Nunca (reserva espaço na tela)",
    macos: "Nunca (fica por cima das janelas)",
  }[os],
  keychain: { windows: "no Gerenciador de Credenciais", linux: "no chaveiro do sistema", macos: "nas Chaves (Keychain)" }[os],
};
