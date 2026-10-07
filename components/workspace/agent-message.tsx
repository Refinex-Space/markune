'use client';

import * as React from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FilePenLine,
  FileText,
  FolderInput,
  Globe,
  Library,
  ListChecks,
  LoaderCircle,
  Plug,
  Puzzle,
  Search,
  Settings2,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiMessageContent } from './ai-message-content';
import { AgentImages } from './agent-image';
import type { AgentMessage } from './agent-session';
import {
  asRecord,
  toolPresentation,
  toolStatus,
  type ActivityKind,
} from './agent-activity';
import styles from './agent-activity.module.css';

const icons = {
  read: FileText,
  edit: FilePenLine,
  delete: Trash2,
  move: FolderInput,
  search: Search,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: Settings2,
  other: Wrench,
  web: Globe,
  skill: Library,
  mcp: Plug,
  plugin: Puzzle,
} satisfies Record<ActivityKind, typeof Wrench>;

function Disclosure({
  open,
  id,
  children,
}: {
  open: boolean;
  id: string;
  children: React.ReactNode;
}) {
  const [rendered, setRendered] = React.useState(open);
  if (open && !rendered) setRendered(true);
  return (
    <div
      id={id}
      className={styles.disclosure}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={styles.content}>{rendered ? children : null}</div>
    </div>
  );
}

function Thought({
  message,
  streaming,
}: {
  message: AgentMessage;
  streaming: boolean;
}) {
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const open = choice ?? streaming;
  const id = React.useId();
  const body = React.useRef<HTMLDivElement>(null);
  const follow = React.useRef(true);
  React.useLayoutEffect(() => {
    if (streaming && open && follow.current && body.current)
      body.current.scrollTop = body.current.scrollHeight;
  }, [message.text, streaming, open]);
  return (
    <div className="min-w-0" data-agent-thought data-streaming={streaming}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setChoice(!open)}
        className="group flex min-h-8 max-w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <Brain size={14} className="shrink-0" aria-hidden="true" />
        <span>{streaming ? '正在思考' : '思考过程'}</span>
        {streaming && (
          <LoaderCircle
            size={12}
            aria-hidden="true"
            className="shrink-0 animate-spin motion-reduce:animate-none"
          />
        )}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform duration-150 motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </button>
      <Disclosure open={open} id={id}>
        <div
          ref={body}
          onScroll={() => {
            const node = body.current;
            if (node)
              follow.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 40;
          }}
          className="ml-[15px] mt-1 max-h-60 overflow-y-auto overscroll-contain border-l border-border/70 py-1 pl-4 pr-2 text-[13px] leading-6 text-muted-foreground"
        >
          <AgentImages images={message.images} />
          <AiMessageContent markdown={message.text} streaming={streaming} />
        </div>
      </Disclosure>
    </div>
  );
}

function RawValue({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-5">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ToolDetails({ message }: { message: AgentMessage }) {
  const tool = message.tool ?? {};
  const content = Array.isArray(tool.content) ? tool.content : [];
  return (
    <div className="space-y-3">
      <p className="break-words text-xs leading-5 text-foreground">
        {message.text}
      </p>
      {typeof tool.name === 'string' && (
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          {tool.name}
        </p>
      )}
      {tool.rawInput != null && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            输入
          </p>
          <RawValue value={tool.rawInput} />
        </div>
      )}
      {Array.isArray(tool.locations) && tool.locations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            涉及文件
          </p>
          {tool.locations.map((location, index) => {
            const item = asRecord(location);
            return (
              <p className="break-all font-mono text-[11px]" key={index}>
                {String(item?.path ?? '')}
                {typeof item?.line === 'number' ? `:${item.line}` : ''}
              </p>
            );
          })}
        </div>
      )}
      <AgentImages images={message.images} />
      {content.map((entry, index) => {
        const item = asRecord(entry);
        if (!item) return null;
        const block = asRecord(item.content);
        if (item.type === 'content' && block?.type === 'text')
          return (
            <AiMessageContent
              key={index}
              markdown={String(block.text ?? '')}
            />
          );
        if (item.type === 'content' && block?.type === 'image') return null;
        if (item.type === 'diff')
          return (
            <div
              key={index}
              className="overflow-hidden rounded-md border border-border/60"
            >
              <p className="break-all bg-muted/50 px-3 py-2 font-mono text-[11px]">
                {String(item.path ?? '')}
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-5">
                <span className="block text-red-700 dark:text-red-400">
                  {typeof item.oldText === 'string'
                    ? item.oldText
                        .split('\n')
                        .map((line) => `− ${line}`)
                        .join('\n')
                    : ''}
                </span>
                <span className="block text-emerald-700 dark:text-emerald-400">
                  {String(item.newText ?? '')
                    .split('\n')
                    .map((line) => `+ ${line}`)
                    .join('\n')}
                </span>
              </pre>
            </div>
          );
        if (item.type === 'terminal')
          return (
            <p
              key={index}
              className="break-all text-xs text-muted-foreground"
            >
              终端 · {String(item.terminalId ?? '')}
            </p>
          );
        if (block?.type === 'resource_link')
          return (
            <p key={index} className="break-all text-xs">
              {String(block.name ?? '资源')} · {String(block.uri ?? '')}
            </p>
          );
        if (block?.type === 'resource') {
          const resource = asRecord(block.resource);
          return (
            <RawValue
              key={index}
              value={
                typeof resource?.text === 'string'
                  ? resource.text
                  : (resource?.uri ?? '资源')
              }
            />
          );
        }
        return <RawValue key={index} value={item} />;
      })}
      {tool.rawOutput != null && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            原始结果
          </summary>
          <div className="mt-2">
            <RawValue value={tool.rawOutput} />
          </div>
        </details>
      )}
      {!content.length &&
        !message.images?.length &&
        tool.rawOutput == null && (
          <p className="text-xs text-muted-foreground">尚无输出内容</p>
        )}
    </div>
  );
}

function Tool({
  message,
  active,
}: {
  message: AgentMessage;
  active: boolean;
}) {
  const presentation = toolPresentation(message);
  const status = toolStatus(message.tool ?? {}, active);
  const Icon = icons[presentation.category];
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const open = choice ?? status.state === 'failed';
  const id = React.useId();
  const StatusIcon = status.running
    ? LoaderCircle
    : status.state === 'completed'
      ? Check
      : status.state === 'failed'
        ? CircleAlert
        : Clock3;
  return (
    <div
      className="min-w-0"
      data-agent-tool={presentation.category}
      data-tool-status={status.state}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setChoice(!open)}
        title={presentation.title}
        className="group flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <Icon
          size={15}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="shrink-0 font-medium">{presentation.label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {presentation.title}
        </span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-[11px]',
            status.state === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          <StatusIcon
            size={12}
            aria-hidden="true"
            className={cn(
              status.running && 'animate-spin motion-reduce:animate-none',
            )}
          />
          <span>{status.label}</span>
        </span>
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </button>
      <Disclosure open={open} id={id}>
        <div className="ml-[15px] mt-1 max-h-[28rem] overflow-auto overscroll-contain border-l border-border/70 py-2 pl-4 pr-2 text-xs leading-6">
          <ToolDetails message={message} />
        </div>
      </Disclosure>
    </div>
  );
}

export const AgentMessageView = React.memo(function AgentMessageView({
  message,
  streaming = false,
  active = false,
}: {
  message: AgentMessage;
  streaming?: boolean;
  active?: boolean;
}) {
  if (message.role === 'thought')
    return <Thought message={message} streaming={streaming} />;
  if (message.role === 'tool')
    return <Tool message={message} active={active} />;
  if (message.role === 'plan')
    return (
      <details
        open
        className="rounded-lg border border-border/60 p-3 text-sm"
      >
        <summary className="cursor-pointer text-xs text-muted-foreground">
          <ListChecks size={14} aria-hidden="true" className="mr-2 inline" />
          任务计划
        </summary>
        <div className="mt-3 max-h-96 overflow-auto">
          <AiMessageContent markdown={message.text} />
        </div>
      </details>
    );
  return (
    <div
      className={cn(
        'min-w-0 break-words text-sm leading-7',
        message.role === 'user' && 'ml-6 rounded-xl bg-muted/65 px-4 py-2.5',
        message.role === 'notice' && 'text-xs text-muted-foreground',
      )}
    >
      {message.references?.length ? (
        <details className="mb-1 text-[11px] leading-5 text-muted-foreground">
          <summary className="cursor-pointer">
            本轮引用 · {message.references.length}
          </summary>
          {message.references.map((reference) => (
            <p key={reference} className="break-all">
              {reference}
            </p>
          ))}
        </details>
      ) : null}
      <AgentImages images={message.images} />
      <AiMessageContent markdown={message.text} streaming={streaming} />
    </div>
  );
});
