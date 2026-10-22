# Contribuindo com o Pier

<p>
  <a href="CONTRIBUTING.md">English</a> · <b>Português</b>
</p>

Obrigado por ajudar o Pier. Este guia explica como compilar o Pier a partir do código, rodar os testes e enviar um pull request.

Para reportar um bug ou sugerir um recurso, [abra uma issue](https://github.com/pier-dock/pier-dock/issues/new/choose) e escolha o modelo correspondente.

## Estrutura do projeto

- `src/`: o frontend em React (o dock, os painéis dos widgets e a janela de configurações).
- `src-tauri/`: o backend em Rust, feito com [Tauri 2](https://tauri.app), com o código de cada plataforma para Windows, macOS e Linux.
- `gnome-extension/pier@pier.dev/`: a extensão do GNOME Shell que o Pier instala no GNOME.
- `scripts/`: scripts auxiliares para gerar os ícones e preparar uma versão.

## Ambiente de desenvolvimento

### Pré-requisitos

- [Node.js](https://nodejs.org) 22 ou mais recente
- [Rust](https://rustup.rs) (stable)
- Ferramentas de cada plataforma:
  - **Windows:** Visual Studio Build Tools com a carga de trabalho de C++ e o Windows SDK. Use o toolchain `stable-x86_64-pc-windows-msvc` do Rust.
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` e `patchelf`.

### Rodar e compilar

```sh
npm install
npm run tauri dev     # roda em modo de desenvolvimento
npm run tauri build   # gera os instaladores em src-tauri/target/release/bundle/
```

Quando você roda `npm run tauri dev` no macOS, o sistema concede as permissões ao terminal que rodou o comando, e não ao Pier.

### Pré-visualização no navegador

Fora do Tauri, o `npm run dev` responde as chamadas de IPC com dados de exemplo, para você conferir a interface no navegador. Abra `http://localhost:1420` com um destes parâmetros:

- `?view=dock`
- `?view=panel&kind=media` (ou `github-mine`, `github-review`, `github-contrib`, `volume`, `network`)
- `?view=settings`

### Testes

```sh
npm test                               # testes do frontend
cd src-tauri
cargo test                             # testes unitários do Rust
cargo test -- --ignored --nocapture    # smoke tests contra o sistema real
```

Os smoke tests usam janelas, apps, sessões de mídia e a API do GitHub de verdade, na máquina em que rodam.

### Perfil de hover e efeitos gráficos

Avalie o desempenho nativo com uma build de release, mantendo monitor, escala, quantidade de ícones e widgets iguais. Em **Configurações > Aparência**, **Reduzir efeitos visuais** usa um fundo sólido e remove as sombras decorativas da dock e dos ícones sem perder o material escolhido. Mantenha o mascote e a reprodução de mídia nas mesmas condições e não compile durante a captura.

Para um diagnóstico repetível do frontend, rode `npm run dev`, abra `http://localhost:1420/?view=dock&profile=1` e execute no console:

```js
await pierPerformance.measure({ label: "baseline", durationMs: 5000, sweep: true })
```

A varredura sintética repete o mesmo percurso e inclui o custo dos eventos e do teste de posição. Para medir o mouse real, omita `sweep` e mova o cursor pela dock durante a captura. Após aquecer a interface, repita cada caso pelo menos três vezes: vidro com sombras, material sólido com sombras, efeitos visuais reduzidos e ampliação desativada. Mude uma opção por vez. Confira o material ativo no resultado: um compositor sem suporte a vidro já usa sólido. Para isolar a sombra dos ícones, use temporariamente `document.querySelector('.dock-bar').style.setProperty('--shadow-icon', 'none')` e remova essa propriedade ao terminar.

O resultado traz mediana, percentil 95 e máximo do intervalo entre quadros, contagens acima de 16,7ms e 33,3ms, medições dos ícones, requisições `set_hit_rect` e tarefas longas quando suportadas. Esses limites não são uma contagem de quadros perdidos independente da taxa de atualização. Descarte capturas com `hiddenDuringRun` e anote build, sistema/compositor, GPU, taxa de atualização e configurações junto ao JSON. `pierPerformance.cancel()` encerra a captura. Só uma captura roda por vez, e a instrumentação é restaurada ao terminar.

Para analisar uma build nativa, cole `scripts/profile-hover.js` no inspetor do WebView e use a mesma API; a disponibilidade do inspetor depende do empacotamento. O script não envia dados nem altera configurações persistentes. O navegador com IPC falso não mede o blur nativo, o processamento do IPC ou o custo do compositor/GPU. Para isso, use também o profiler nativo do sistema/WebView e compare os rastros antes de afirmar um ganho de desempenho.

### Ícones

Os ícones de todas as plataformas saem de `app-icon.svg` e `src-tauri/icons/source/`. Para gerá-los de novo, rode `./scripts/icons.sh` no macOS (o script precisa do `iconutil`).

## Pull requests

- Mantenha cada pull request pequeno e focado em uma mudança.
- Use um título no estilo [Conventional Commits](https://www.conventionalcommits.org/pt-br), `tipo(escopo): resumo`, por exemplo `feat(dock): …` ou `fix(windows): …`, em inglês. Os pull requests entram com squash, então o título vira a mensagem do commit.
- O CI roda `npm run build` e `npm test`, e `cargo test --locked` no Windows, no macOS e no Linux. Rode tudo localmente antes de abrir o pull request.
- Se a mudança aparece para o usuário, atualize o `README.md` e o `README.pt-BR.md`.
- Não altere a versão no `package.json` nem no `src-tauri/Cargo.toml`, e não adicione seções de versão nos changelogs. Quem mantém o projeto escolhe a versão e escreve as novidades ao publicar, e o CI recusa pull requests que mudam isso.

## Licença

Ao contribuir, você concorda que suas contribuições sejam licenciadas sob a [Licença Pública Geral GNU, versão 3 ou posterior](LICENSE), a mesma licença do Pier.
