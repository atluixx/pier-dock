# Pier

A dock para macOS, Windows e Linux (GNOME). Substitui a barra nativa do sistema: apps fixados e abertos, player do Spotify/YouTube Music, widgets do GitHub (PRs, revisões, contribuições), rede, volume, bateria e relógio, em vidro líquido nativo.

Feita com Tauri 2 (Rust) + React/TypeScript. Antes se chamava WinDock: na primeira execução o Pier leva a configuração, o token do GitHub e o início automático do WinDock. No GNOME, a extensão precisa ser reinstalada pelas Configurações (a antiga é removida).

## Instalando

Baixe o instalador da sua plataforma na [página de Releases](https://github.com/pier-dock/pier-dock/releases/latest). Depois de instalado, o Pier procura versões novas sozinho (e em Configurações → Geral) e se atualiza com um clique.

Os instaladores ainda não têm assinatura de código, então o sistema avisa na primeira abertura:

- **Windows** (`Pier_x.y.z_x64-setup.exe`): no aviso do SmartScreen, clique em **Mais informações** → **Executar assim mesmo**. O Pier é instalado em `%LOCALAPPDATA%\Pier`, sem pedir administrador.
- **macOS** (`Pier_x.y.z_universal.dmg`, Intel e Apple Silicon): arraste o Pier para Aplicativos e abra. Quando o macOS disser que não pôde verificar o app, vá em **Ajustes do Sistema → Privacidade e Segurança** e clique em **Abrir mesmo assim**. Ou, no Terminal: `xattr -dr com.apple.quarantine /Applications/Pier.app`. Sem assinatura da Apple, o macOS pede a permissão de Acessibilidade de novo a cada atualização.
- **Linux** (GNOME): `sudo apt install ./Pier_x.y.z_amd64.deb`, ou o AppImage (`chmod +x Pier_x.y.z_amd64.AppImage` e execute). A atualização automática funciona no AppImage; no `.deb`, instale a versão nova pelo Releases.

## Rodando a partir do código

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
%LOCALAPPDATA%\Pier\pier.exe --restore-taskbar               # Windows
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

## Publicando uma versão

```sh
./scripts/release.sh 0.2.0     # atualiza as versões, faz o commit e cria a tag v0.2.0
git push --follow-tags
```

O push da tag dispara `.github/workflows/release.yml`, que compila no macOS (binário universal), no Windows e no Linux e cria um Release **rascunho** com os instaladores e o `latest.json` do atualizador. Confira os arquivos e publique o rascunho: só então os apps instalados enxergam a versão nova. Para só testar o build, rode o workflow à mão (aba Actions → Release → Run workflow); os instaladores ficam como artefatos da execução.

Os pacotes de atualização são assinados com a chave do atualizador (a pública está em `src-tauri/tauri.conf.json`). A privada e a senha ficam nos secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` do repositório. Sem a mesma chave, os apps já instalados recusam as atualizações, então guarde uma cópia dela.

Para assinar e notarizar o app do macOS no futuro (conta Apple Developer): adicione os secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID`, passe-os no `env` do passo `tauri-action` e remova o `"signingIdentity": "-"` de `src-tauri/tauri.macos.conf.json`.
