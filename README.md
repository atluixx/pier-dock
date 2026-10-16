# Pier

A dock para macOS, Windows e Linux (GNOME). Substitui a barra nativa do sistema: apps fixados e abertos, player do Spotify/YouTube Music, widgets do GitHub (PRs, revisões, contribuições), rede, volume, bateria e relógio, em vidro líquido nativo.

Feita com Tauri 2 (Rust) + React/TypeScript. Antes se chamava WinDock: na primeira execução o Pier leva a configuração, o token do GitHub e o início automático do WinDock. No GNOME, a extensão precisa ser reinstalada pelas Configurações (a antiga é removida).

## Rodando

Pré-requisitos: Node 22+, Rust (toolchain `stable-x86_64-pc-windows-msvc`), Visual Studio Build Tools com C++ e o Windows SDK.

```sh
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # instalador em src-tauri/target/release/bundle/nsis
```

## macOS

Pré-requisitos: Node 22+, Xcode Command Line Tools (`xcode-select --install`) e Rust via [rustup](https://rustup.rs).

```sh
npm install
npm run tauri dev      # desenvolvimento
npm run tauri build    # Pier.app e .dmg em src-tauri/target/release/bundle/
```

Permissões que o macOS pede:

- **Acessibilidade** (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade): listar, focar, minimizar e fechar janelas. Sem ela a dock ainda mostra os apps abertos e consegue focá-los, escondê-los e encerrá-los. As Configurações da dock mostram um aviso com o botão para pedir a permissão.
- **Automação**, na primeira vez que o Spotify ou o Música tocarem algo: o widget de mídia lê e controla esses apps por AppleScript.

No `npm run tauri dev` as permissões ficam com o terminal que rodou o comando, não com o Pier.

Diferenças em relação ao Windows:

- O macOS não deixa outros apps reservarem área da tela, então janelas maximizadas passam por baixo da dock (use "ocultar automaticamente").
- O Dock nativo não pode ser removido: o Pier o deixa em "ocultar automaticamente" com um atraso enorme para reaparecer, e devolve as preferências originais ao sair.
- O widget de mídia só enxerga o Spotify e o Música.
- O nome da rede Wi‑Fi só aparece se o app tiver permissão de Localização; sem ela o widget mostra "Wi‑Fi".
- Os atalhos são **Control+Option+1..9**.

## Usando

- **Clique** num app abre ou foca. Clicar no app ativo minimiza; com várias janelas, alterna entre elas. **Shift+clique** abre uma nova instância.
- **Botão direito** num app: lista de janelas, fixar/desafixar, fechar.
- **Botão direito** no fundo da dock: configurações e sair.
- **Ctrl+Alt+1..9** abre/foca o app na posição N.
- **Reordenar:** arraste os apps fixados. **Fixar:** solte um `.exe`/atalho na dock ou use Configurações → Apps.
- **Widgets:** clique para abrir o painel. No volume, a roda do mouse ajusta e o botão direito silencia.
- **GitHub:** usa o token do `gh auth login` automaticamente. Um Personal Access Token colado nas configurações tem prioridade.

A configuração fica em `%APPDATA%\pier\config.json` (no macOS, `~/Library/Application Support/pier/config.json`).

## Se a barra de tarefas não voltar

Ao sair, a dock restaura a barra de tarefas (ou o Dock do macOS). Se o processo for encerrado à força, rode:

```sh
pier.exe --restore-taskbar                                  # Windows
/Applications/Pier.app/Contents/MacOS/pier --restore-taskbar   # macOS
```

## Ícones

Os ícones de todas as plataformas saem de `app-icon.svg` e `src-tauri/icons/source/` (versão simplificada para 32px ou menos e o ícone monocromático da bandeja):

```sh
./scripts/icons.sh     # precisa do macOS (iconutil)
```

## Pré-visualização no navegador

`npm run dev` fora do Tauri responde o IPC com dados de exemplo, para conferir as telas no navegador: `?view=dock`, `?view=panel&kind=media` (ou `github-mine`, `github-review`, `github-contrib`) e `?view=settings`.

## Testes

```sh
npm test                         # ordem da dock (frontend)
cd src-tauri
cargo test                       # testes unitários
cargo test -- --ignored --nocapture   # smoke tests contra o sistema real (janelas, apps, mídia, GitHub)
```
