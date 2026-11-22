import { Command } from "cmdk";
import { Brain, Check, ChevronDown, Gauge, Search } from "lucide-react";
import { useState } from "react";
import { useModels, useUsage } from "@/lib/queries";
import type { Effort, ModelInfo } from "@/lib/types";
import { cn, formatTokens } from "@/lib/utils";
import { Badge, Progress } from "@/components/ui/feedback";
import { Popover } from "@/components/ui/overlay";
import { Tooltip } from "@/components/ui/tooltip";

const CAP_LABEL: Record<string, string> = { chat: "Чат", reasoning: "Міркування", code: "Код", multilingual: "Багатомовна", fast: "Швидка" };

const triggerCls =
  "inline-flex h-7 min-w-0 max-w-[120px] sm:max-w-[180px] items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors duration-150 hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg disabled:opacity-50";

export function ModelSelector({ value, onChange, disabled }: { value: string; onChange: (m: ModelInfo) => void; disabled?: boolean }) {
  const { data: models = [] } = useModels();
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.id === value);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      className="w-[min(340px,calc(100vw-24px))] p-0"
      trigger={
        <button type="button" disabled={disabled} className={triggerCls} aria-label="Модель">
          <span className="truncate">{current?.label ?? "Модель"}</span>
          <ChevronDown className="size-3 shrink-0" />
        </button>
      }
    >
      <Command loop className="flex max-h-[360px] flex-col">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-3.5 text-subtle" />
          <Command.Input autoFocus placeholder="Пошук моделі…" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
        </div>
        <Command.List className="overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Нічого не знайдено</Command.Empty>
          {models.map((m) => (
            <Command.Item
              key={m.id}
              value={`${m.label} ${m.provider} ${m.id}`}
              onSelect={() => {
                onChange(m);
                setOpen(false);
              }}
              className="flex cursor-default items-start gap-2.5 rounded-md px-2.5 py-2 outline-none data-[selected=true]:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{m.label}</span>
                  {m.supports_reasoning && (
                    <Tooltip content="Керований рівень міркування">
                      <Brain className="size-3.5 text-accent" />
                    </Tooltip>
                  )}
                </div>
                <div className="mt-0.5 text-2xs text-subtle">
                  {m.provider}
                  {m.context_window ? ` · ${formatTokens(m.context_window)} контекст` : ""}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.capabilities.map((c) => (
                    <Badge key={c}>{CAP_LABEL[c] ?? c}</Badge>
                  ))}
                  {!m.verified && <Badge tone="warning">Метадані не підтверджені</Badge>}
                </div>
                {m.note && <p className="mt-1 text-2xs text-muted">{m.note}</p>}
              </div>
              {m.id === value && <Check className="mt-0.5 size-3.5 text-accent" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </Popover>
  );
}

export const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Швидко, мінімум міркувань" },
  { value: "medium", label: "Medium", hint: "Збалансовано" },
  { value: "high", label: "High", hint: "Глибше міркування" },
  { value: "ultra", label: "Ultra", hint: "Максимальне міркування і довша відповідь" },
];

export function EffortSelector({ value, model, onChange, disabled }: { value: Effort; model?: ModelInfo; onChange: (e: Effort) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const supported = model?.efforts ?? ["medium"];
  const onlyDefault = supported.length <= 1;
  const current = EFFORTS.find((e) => e.value === value);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      className="w-60"
      trigger={
        <button type="button" disabled={disabled} className={triggerCls} aria-label="Рівень зусиль">
          <Gauge className="size-3.5" />
          <span className="hidden min-[360px]:inline">{current?.label}</span>
        </button>
      }
    >
      <div role="listbox" aria-label="Рівень зусиль">
        {EFFORTS.map((e) => {
          const ok = supported.includes(e.value);
          return (
            <button
              key={e.value}
              type="button"
              role="option"
              aria-selected={value === e.value}
              disabled={!ok}
              onClick={() => {
                onChange(e.value);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <div className="flex-1">
                <div className="text-sm">{e.label}</div>
                <div className="text-2xs text-subtle">{ok ? e.hint : "Модель не підтримує"}</div>
              </div>
              {value === e.value && <Check className="mt-1 size-3.5 text-accent" />}
            </button>
          );
        })}
        {onlyDefault && <p className="border-t border-line px-2.5 pt-1.5 pb-1 text-2xs text-subtle">У цієї моделі рівень міркування не керується через API.</p>}
      </div>
    </Popover>
  );
}

export function UsageIndicator({ compact }: { compact?: boolean }) {
  const { data } = useUsage();
  if (!data) return null;
  const pct = data.daily_limit ? (data.today_tokens / data.daily_limit) * 100 : 0;
  const tone = pct > 90 ? "danger" : pct > 70 ? "warning" : "muted";
  if (compact)
    return (
      <Tooltip content={`Токени сьогодні: ${formatTokens(data.today_tokens)} з ${formatTokens(data.daily_limit)}`} side="right">
        <div className="mx-auto h-1 w-6"><Progress value={pct} tone={tone} label="Використання токенів" /></div>
      </Tooltip>
    );
  return (
    <div className="space-y-1.5 px-1">
      <div className="flex justify-between text-2xs text-subtle">
        <span>Токени сьогодні</span>
        <span className={cn("tabular", pct > 90 && "text-danger")}>
          {formatTokens(data.today_tokens)} / {formatTokens(data.daily_limit)}
        </span>
      </div>
      <Progress value={pct} tone={tone} label="Використання токенів" />
    </div>
  );
}
