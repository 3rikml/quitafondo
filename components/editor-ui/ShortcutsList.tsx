"use client";

import { useT, type MessageKey } from "@/lib/i18n";

/** Shown in the preferences menu; handled in `app/page.tsx`. */
/** Keys are literal, or a message key when they contain words (e.g. "Space"). */
const SHORTCUTS: [keys: string | { label: MessageKey }, action: MessageKey][] = [
  ["1 – 5", "shortcut.tools"],
  ["D", "shortcut.download"],
  ["Ctrl/⌘ + Shift + C", "shortcut.copy"],
  ["C", "shortcut.compare"],
  ["B", "shortcut.brush"],
  ["[  ]", "shortcut.brushSize"],
  [{ label: "shortcut.zoomKeysWheel" }, "shortcut.zoom"],
  ["+  −  0", "shortcut.zoomKeys"],
  [{ label: "shortcut.panKeys" }, "shortcut.pan"],
  ["Ctrl/⌘ + Z", "shortcut.undo"],
  ["Ctrl/⌘ + Shift + Z", "shortcut.redo"],
  ["Ctrl/⌘ + V", "shortcut.paste"],
  ["Esc", "shortcut.escape"],
];

export function ShortcutsList() {
  const t = useT();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {SHORTCUTS.map(([keys, action]) => (
        <div key={action} className="contents">
          <dt>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {typeof keys === "string" ? keys : t(keys.label)}
            </kbd>
          </dt>
          <dd className="text-muted-foreground">{t(action)}</dd>
        </div>
      ))}
    </dl>
  );
}
