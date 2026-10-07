'use client';

import * as React from 'react';
import { LoaderCircle, Settings2, Zap } from 'lucide-react';
import type {
  SessionConfigOption,
  SessionModeState,
} from '@agentclientprotocol/sdk';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AgentView } from './agent-session';

export function agentOptionValue(option: SessionConfigOption): string {
  if (option.type === 'boolean')
    return option.currentValue ? '已开启' : '已关闭';
  return (
    option.options
      .flatMap((item) => ('options' in item ? item.options : [item]))
      .find((item) => item.value === option.currentValue)?.name ??
    option.currentValue
  );
}
export function fastModeState(
  agentId: string,
  option: SessionConfigOption,
): { enabled: boolean; next: boolean | string } | null {
  if (agentId !== 'codex-acp' || option.id !== 'fast-mode') return null;
  if (option.type === 'boolean')
    return { enabled: option.currentValue, next: !option.currentValue };
  const values = option.options
    .flatMap((item) => ('options' in item ? item.options : [item]))
    .map((item) => item.value);
  if (
    values.length === 2 &&
    values.includes('on') &&
    values.includes('off') &&
    ['on', 'off'].includes(option.currentValue)
  )
    return {
      enabled: option.currentValue === 'on',
      next: option.currentValue === 'on' ? 'off' : 'on',
    };
  return null;
}
interface Control {
  key: string;
  option: SessionConfigOption;
  legacy?: boolean;
}
const widths: Record<string, number> = {
  model: 144,
  mode: 128,
  thought_level: 88,
  collaboration_mode: 112,
};
const order = ['model', 'mode', 'thought_level', 'collaboration_mode'];
function controlWidth(option: SessionConfigOption) {
  const textWidth = Array.from(agentOptionValue(option)).reduce(
    (sum, character) => sum + (character.charCodeAt(0) > 127 ? 12 : 6.25),
    0,
  );
  return Math.min(widths[option.category ?? ''] ?? 144, textWidth + 38);
}
export function inlineAgentControls(
  options: SessionConfigOption[],
  width: number,
  hasFast: boolean,
): string[] {
  const selects = options.filter((option) => option.type === 'select');
  const candidates = selects
    .filter((option) => order.includes(option.category ?? ''))
    .sort((a, b) => order.indexOf(a.category!) - order.indexOf(b.category!));
  if (!candidates.length && selects.length) candidates.push(selects[0]);
  // refinex: Every item has a matching CSS width cap; reserve fixed space for speed, settings and status.
  let available = Math.max(0, width - (hasFast ? 76 : 44));
  const result: string[] = [];
  for (const option of candidates) {
    const cap = controlWidth(option);
    if (!result.length || available >= cap + 4) {
      result.push(option.id);
      available -= cap + 4;
    }
  }
  return result;
}

export function AgentConfigToolbar({
  agentId,
  options,
  modes,
  phase,
  usage,
  disabled,
  onConfigure,
  onMode,
}: {
  agentId: string;
  options: SessionConfigOption[];
  modes: SessionModeState | null;
  phase: AgentView['phase'];
  usage: AgentView['usage'];
  disabled: boolean;
  onConfigure: (id: string, value: string | boolean) => Promise<unknown>;
  onMode: (id: string) => Promise<unknown>;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(480);
  const [pending, setPending] = React.useState<string | null>(null);
  const pendingRef = React.useRef(false);
  React.useEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect().width;
      if (next > 0) setWidth(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const controls: Control[] = options.map((option) => ({
    key: `config:${option.id}`,
    option,
  }));
  if (!options.some((option) => option.category === 'mode') && modes)
    controls.push({
      key: 'legacy-mode',
      legacy: true,
      option: {
        id: '$markune-legacy-mode',
        name: '会话模式',
        category: 'mode',
        type: 'select',
        currentValue: modes.currentModeId,
        options: modes.availableModes.map((mode) => ({
          value: mode.id,
          name: mode.name,
          description: mode.description,
        })),
      },
    });
  const fast = controls.find((control) =>
    fastModeState(agentId, control.option),
  );
  const fastState = fast ? fastModeState(agentId, fast.option) : null;
  const inlineIds = inlineAgentControls(
    controls
      .filter((control) => control !== fast)
      .map((control) => ({ ...control.option, id: control.key })),
    width,
    Boolean(fast),
  );
  const inline = inlineIds
    .map((id) => controls.find((control) => control.key === id)!)
    .filter(Boolean);
  const blocked = disabled || pending !== null;
  const change = async (control: Control, value: string | boolean) => {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(control.key);
    try {
      if (control.legacy) await onMode(String(value));
      else await onConfigure(control.option.id, value);
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };
  const status = {
    idle: '未连接',
    connecting: '正在连接',
    auth: '等待登录',
    ready: '已连接',
    running: '正在执行',
    cancelling: '正在停止',
    disconnected: '连接已断开',
    error: '连接异常',
  }[phase];
  const usageText = usage
    ? `上下文 ${String(usage.used ?? '')}${usage.size ? ` / ${usage.size}` : ''}`
    : '';
  return (
    <TooltipProvider delayDuration={350}>
      <div
        ref={root}
        data-testid="agent-config-toolbar"
        className="mt-2 flex h-7 min-w-0 flex-nowrap items-center gap-1 text-xs text-muted-foreground"
      >
        {inline.map((control) => (
          <div
            key={control.key}
            className="min-w-0 shrink"
            style={{ maxWidth: controlWidth(control.option) }}
          >
            <OptionControl
              option={control.option}
              disabled={blocked}
              onChange={(value) => void change(control, value)}
              compact
            />
          </div>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {fast && fastState && (
            <Tip
              label={`${fast.option.name} · ${fastState.enabled ? '已开启' : '已关闭'}`}
              description={fast.option.description}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={fast.option.name}
                aria-pressed={fastState.enabled}
                disabled={blocked}
                data-testid="agent-fast-mode"
                className={cn(
                  'size-7 rounded-lg',
                  fastState.enabled
                    ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400'
                    : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => void change(fast, fastState.next)}
              >
                {pending === fast.key ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Zap
                    size={15}
                    fill={fastState.enabled ? 'currentColor' : 'none'}
                  />
                )}
              </Button>
            </Tip>
          )}
          {(controls.length > 0 || usage) && (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="更多会话设置"
                      className="size-7 rounded-lg text-muted-foreground hover:bg-accent data-[state=open]:bg-accent"
                    >
                      <Settings2 size={15} />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="space-y-1">
                    <span className="block">全部会话设置</span>
                    {controls
                      .filter(
                        (control) =>
                          control !== fast &&
                          !inline.some((item) => item.key === control.key),
                      )
                      .map((control) => (
                        <span
                          key={control.key}
                          className="block text-[11px] font-normal opacity-80"
                        >
                          {control.option.name}：
                          {agentOptionValue(control.option)}
                        </span>
                      ))}
                  </span>
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                aria-label="会话设置"
                side="top"
                align="end"
                collisionPadding={12}
                className="max-h-[min(70vh,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
              >
                <h3 className="mb-3 text-sm font-medium">会话设置</h3>
                <div className="space-y-3">
                  {controls.map((control) => (
                    <div key={control.key} className="space-y-1">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 text-xs">
                          {control.option.name}
                        </span>
                        <div className="min-w-0 max-w-[60%] shrink">
                          <OptionControl
                            option={control.option}
                            disabled={blocked}
                            onChange={(value) => void change(control, value)}
                          />
                        </div>
                      </div>
                      {control.option.description && (
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          {control.option.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {usage && (
                  <p
                    className="mt-3 border-t pt-3 text-xs text-muted-foreground"
                    title={JSON.stringify(usage)}
                  >
                    {usageText}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          )}
          <Tip label={status} description={usageText}>
            <span
              role="status"
              aria-label={status}
              tabIndex={0}
              className="flex h-7 w-3 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  phase === 'ready'
                    ? 'bg-emerald-500'
                    : phase === 'error'
                      ? 'bg-destructive'
                      : phase === 'running' ||
                          phase === 'connecting' ||
                          phase === 'cancelling'
                        ? 'animate-pulse bg-sky-500 motion-reduce:animate-none'
                        : 'bg-muted-foreground/50',
                )}
              />
            </span>
          </Tip>
        </div>
      </div>
    </TooltipProvider>
  );
}
function Tip({
  label,
  description,
  children,
}: {
  label: string;
  description?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">
        <span className="space-y-1">
          <span className="block">{label}</span>
          {description && (
            <span className="block max-w-64 text-[11px] font-normal opacity-80">
              {description}
            </span>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
function OptionControl({
  option,
  disabled,
  onChange,
  compact = false,
}: {
  option: SessionConfigOption;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
  compact?: boolean;
}) {
  const display = agentOptionValue(option);
  if (option.type === 'boolean')
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        aria-label={option.name}
        aria-pressed={option.currentValue}
        disabled={disabled}
        onClick={() => onChange(!option.currentValue)}
      >
        {display}
      </Button>
    );
  const trigger = (
    <SelectTrigger
      size="sm"
      aria-label={option.name}
      className={cn(
        'min-w-0 max-w-full gap-1 px-2 text-xs shadow-none hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent dark:hover:bg-accent dark:data-[state=open]:bg-accent',
        compact && 'border-transparent bg-transparent dark:bg-transparent',
      )}
    >
      <SelectValue>
        <span className="min-w-0 truncate text-foreground">{display}</span>
      </SelectValue>
    </SelectTrigger>
  );
  return (
    <Select
      value={`value:${option.currentValue}`}
      disabled={disabled}
      onValueChange={(key) => onChange(key.slice(6))}
    >
      {compact ? (
        <Tip
          label={`${option.name} · ${display}`}
          description={option.description}
        >
          <span className="block min-w-0 max-w-full">{trigger}</span>
        </Tip>
      ) : (
        trigger
      )}
      <SelectContent
        position="popper"
        side="top"
        align="start"
        collisionPadding={12}
        className="max-w-[min(24rem,calc(100vw-2rem))]"
      >
        <SelectGroup>
          <SelectLabel>{option.name}</SelectLabel>
          {option.options.map((item) =>
            'options' in item ? (
              <SelectGroup key={item.group}>
                <SelectLabel>{item.name}</SelectLabel>
                {item.options.map((choice) => (
                  <SelectItem
                    key={choice.value}
                    value={`value:${choice.value}`}
                    title={choice.description ?? undefined}
                  >
                    {choice.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : (
              <SelectItem
                key={item.value}
                value={`value:${item.value}`}
                title={item.description ?? undefined}
              >
                {item.name}
              </SelectItem>
            ),
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
