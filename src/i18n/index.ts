import { create } from "zustand";
import { en } from "./en.ts";
import { pt, type Dict } from "./pt.ts";

export type { Dict };
export type Lang = "pt" | "en";
/** O que fica salvo na config: "system" segue o idioma do sistema. */
export type LanguageSetting = "system" | Lang;

const DICTS: Record<Lang, Dict> = { pt, en };

export const useLang = create<{ lang: Lang }>(() => ({ lang: "pt" }));

export const setLang = (lang: Lang) => useLang.setState({ lang });
export const resolveLang = (setting: LanguageSetting, system: Lang): Lang => (setting === "system" ? system : setting);

/** Dicionário do idioma atual, para código fora de componentes (formatação, rótulos). */
export const dict = (): Dict => DICTS[useLang.getState().lang];
export const locale = () => (useLang.getState().lang === "pt" ? "pt-BR" : "en-US");

/** Dicionário do idioma atual; o componente re-renderiza quando o idioma muda. */
export const useT = (): Dict => DICTS[useLang((s) => s.lang)];
