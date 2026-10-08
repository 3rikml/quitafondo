import { Brush, Image as ImageIcon, Maximize, PaintBucket, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

/** The editor's tools, in rail order; the number key opens each one. */
export type EditorTool = "background" | "adjust" | "retouch" | "size" | "image";

export const TOOLS: { id: EditorTool; label: MessageKey; icon: LucideIcon; key: string }[] = [
  { id: "background", label: "tool.background", icon: PaintBucket, key: "1" },
  { id: "adjust", label: "tool.adjust", icon: SlidersHorizontal, key: "2" },
  { id: "retouch", label: "tool.retouch", icon: Brush, key: "3" },
  { id: "size", label: "tool.size", icon: Maximize, key: "4" },
  { id: "image", label: "tool.image", icon: ImageIcon, key: "5" },
];
