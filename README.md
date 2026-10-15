# WinDock

Dock customizável para Windows 11 que substitui a barra de tarefas: apps fixados e abertos, player do Spotify/YouTube Music, widgets do GitHub (PRs, commits, contribuições), rede, volume, bateria e relógio.

Feita com Tauri 2 (Rust) + React/TypeScript.

## Rodando

Pré-requisitos: Node 22+, Rust (toolchain `stable-x86_64-pc-windows-msvc`), Visual Studio Build Tools com C++ e o Windows SDK.

```sh
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle/nsis
```

## Usando

- **Clique** num app abre ou foca. Clicar no app ativo minimiza; com várias janelas, alterna entre elas. **Shift+clique** abre uma nova instância.
- **Botão direito** num app: lista de janelas, fixar/desafixar, fechar.
- **Botão direito** no fundo da dock: configurações e sair.
- **Ctrl+Alt+1..9** abre/foca o app na posição N.
- **Reordenar:** arraste os apps fixados. **Fixar:** solte um `.exe`/atalho na dock ou use Configurações → Apps.
- **Widgets:** clique para abrir o painel. No volume, a roda do mouse ajusta e o botão direito silencia.
- **GitHub:** usa o token do `gh auth login` automaticamente. Um Personal Access Token colado nas configurações tem prioridade.

A configuração fica em `%APPDATA%\win-dock\config.json`.

## Se a barra de tarefas não voltar

Ao sair, a dock restaura a barra de tarefas. Se o processo for encerrado à força, rode:

```sh
win-dock.exe --restore-taskbar
```

## Testes

```sh
cd src-tauri
cargo test                       # testes unitários
cargo test -- --ignored --nocapture   # smoke tests contra o sistema real (janelas, apps, mídia, GitHub)
```
