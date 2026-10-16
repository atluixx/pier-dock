import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface Pointer {
  x: number;
  y: number;
  inside: boolean;
}

/**
 * macOS: o WebView da dock e dos painéis não recebe o movimento do mouse (a janela nunca é a
 * janela-chave), então o Rust manda a posição do cursor e aqui se geram os eventos que o navegador
 * geraria. `mouseover`/`mouseout` são de onde o React tira o `onMouseEnter`/`onMouseLeave`, e o
 * atributo `data-hover` faz o papel do `:hover` no CSS.
 */
export function startPointerBridge() {
  let last: Element | null = null;
  let hovered: Element[] = [];

  const setHoverChain = (el: Element | null) => {
    const chain: Element[] = [];
    for (let e = el; e; e = e.parentElement) chain.push(e);
    for (const e of hovered) if (!chain.includes(e)) e.removeAttribute("data-hover");
    for (const e of chain) e.setAttribute("data-hover", "");
    hovered = chain;
  };

  void getCurrentWebviewWindow().listen<Pointer>("pointer-bridge", ({ payload: p }) => {
    const el = p.inside ? document.elementFromPoint(p.x, p.y) : null;
    const init = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window };
    if (el !== last) {
      last?.dispatchEvent(new MouseEvent("mouseout", { ...init, relatedTarget: el }));
      el?.dispatchEvent(new MouseEvent("mouseover", { ...init, relatedTarget: last }));
      last = el;
      setHoverChain(el);
    }
    el?.dispatchEvent(new MouseEvent("mousemove", init));
  });
}
