import { useSyncExternalStore } from "react";
import { es, type MessageKey } from "./es";
import { en } from "./en";

export type { MessageKey };
export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];

const dictionaries: Record<Locale, Record<MessageKey, string>> = { es, en };
const STORAGE_KEY = "quitafondo:locale";

/** Saved choice first, then the browser language; Spanish is the default. */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // Blocked storage: fall through to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "es";
}

let current: Locale = typeof window === "undefined" ? "es" : detectLocale();
const listeners = new Set<() => void>();

if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Interpolates `{name}` placeholders. */
function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * Translates a message in the current language. Usable outside React (e.g. for
 * error messages built in hooks); components should call `useT()` instead so
 * they re-render when the language changes.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return format(dictionaries[current][key], vars);
}

type Translator = typeof t;

/** One stable translator per language, so `useT()` results can sit in dependency lists. */
const translators: Record<Locale, Translator> = {
  es: (key, vars) => format(dictionaries.es[key], vars),
  en: (key, vars) => format(dictionaries.en[key], vars),
};

/** The current language, re-rendering the component when it changes. */
export function useLocale(): Locale {
  // The server always renders Spanish; during hydration React uses that same
  // snapshot, then re-renders with the visitor's language.
  return useSyncExternalStore(subscribe, getLocale, () => "es" as Locale);
}

/**
 * The translator for the language being rendered. It is bound to the hook's
 * snapshot (not to the module's current language), so the hydration render
 * matches the server HTML even when the visitor's language differs.
 */
export function useT(): Translator {
  return translators[useLocale()];
}
