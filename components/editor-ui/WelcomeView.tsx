"use client";

import { useRef } from "react";
import { HeartHandshake, ImagePlus, ShieldCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * The first screen: one big, obvious way in. Dropping anywhere on the window
 * and pasting also work (see `useGlobalImageInput`); the card just says so.
 */
export function WelcomeView({ onFiles }: { onFiles: (files: File[]) => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group flex w-full flex-col items-center gap-5 rounded-3xl border-2 border-dashed border-muted-foreground/25 bg-card/60 px-8 py-14 backdrop-blur transition-colors outline-none hover:border-primary/70 hover:bg-card focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/30"
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
            <ImagePlus className="size-8" strokeWidth={1.6} />
          </span>
          <span className="flex flex-col gap-2">
            <span className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{t("welcome.title")}</span>
            <span className="text-sm text-muted-foreground sm:text-base">{t("welcome.subtitle")}</span>
          </span>
          <Button render={<span />} nativeButton={false} className="pointer-events-none h-10 px-5 text-sm font-semibold">
            {t("welcome.choose")}
          </Button>
        </button>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" />
            {t("welcome.badgeLocal")}
          </li>
          <li className="flex items-center gap-1.5">
            <HeartHandshake className="size-4 text-primary" />
            {t("welcome.badgeFree")}
          </li>
          <li className="flex items-center gap-1.5">
            <UserRoundX className="size-4 text-primary" />
            {t("welcome.badgeNoSignup")}
          </li>
        </ul>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) onFiles(files);
          }}
        />
      </div>
    </div>
  );
}
