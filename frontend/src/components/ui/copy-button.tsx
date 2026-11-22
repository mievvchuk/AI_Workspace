import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "Копіювати", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard permission denied: just don't show success */
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Скопійовано" : label} className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-subtle transition-colors hover:bg-hover hover:text-fg", className)}>
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      <span className="hidden sm:inline">{copied ? "Скопійовано" : label}</span>
    </button>
  );
}
