'use client';

import * as React from 'react';
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Regex,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import type {
  MarkweaveSearchController,
  MarkweaveSearchState,
} from '@markweave/react';

import {
  defaultDocumentFindOptions,
  findDocumentTextMatches,
  replaceAllDocumentTextMatches,
  replaceDocumentTextMatch,
  type DocumentFindOptions,
} from '@/components/editor/document-find';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DocumentFindRequest {
  readonly documentKey?: string;
  readonly expandReplace: boolean;
  readonly initialQuery: string;
  readonly revision: number;
}

interface DocumentFindBarProps {
  controller: MarkweaveSearchController | null;
  onClose: () => void;
  onSourceChange?: (markdown: string) => void;
  readOnly: boolean;
  request: DocumentFindRequest;
  sourceMode: boolean;
  sourceText: string;
  sourceTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const emptySearchState: MarkweaveSearchState = {
  activeMatchIndex: -1,
  error: null,
  matchCount: 0,
  options: defaultDocumentFindOptions,
  query: '',
};

export function DocumentFindBar({
  controller,
  onClose,
  onSourceChange,
  readOnly,
  request,
  sourceMode,
  sourceText,
  sourceTextareaRef,
}: DocumentFindBarProps) {
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = React.useState(request.initialQuery);
  const [replacement, setReplacement] = React.useState('');
  const [replaceExpanded, setReplaceExpanded] = React.useState(
    request.expandReplace,
  );
  const [options, setOptions] = React.useState<DocumentFindOptions>(
    defaultDocumentFindOptions,
  );
  const [visualState, setVisualState] =
    React.useState<MarkweaveSearchState>(emptySearchState);
  const [sourceActiveIndex, setSourceActiveIndex] = React.useState(
    request.initialQuery ? 0 : -1,
  );

  const sourceResult = React.useMemo(
    () => findDocumentTextMatches(sourceText, query, options),
    [options, query, sourceText],
  );
  const sourceMatchCount = sourceResult.matches.length;
  const resolvedVisualState = controller ? visualState : emptySearchState;
  const resolvedSourceActiveIndex =
    sourceMatchCount === 0
      ? -1
      : Math.min(Math.max(sourceActiveIndex, 0), sourceMatchCount - 1);

  React.useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frameId);
  }, [request]);

  React.useEffect(() => {
    if (!controller) {
      return;
    }

    return controller.subscribe(setVisualState);
  }, [controller]);

  React.useEffect(() => {
    if (!controller) {
      return;
    }

    if (sourceMode) {
      controller.clear();
      return;
    }

    controller.setQuery(query, options);
  }, [controller, options, query, sourceMode]);

  React.useEffect(
    () => () => {
      controller?.clear();
    },
    [controller],
  );

  React.useEffect(() => {
    if (!sourceMode) {
      return;
    }

    const match = sourceResult.matches[resolvedSourceActiveIndex];
    const textarea = sourceTextareaRef.current;

    if (!match || !textarea) {
      return;
    }

    textarea.setSelectionRange(match.from, match.to);
    scrollTextareaMatchIntoView(textarea, sourceText, match.from);
  }, [
    resolvedSourceActiveIndex,
    sourceMode,
    sourceResult.matches,
    sourceText,
    sourceTextareaRef,
  ]);

  const activeMatchIndex = sourceMode
    ? resolvedSourceActiveIndex
    : resolvedVisualState.activeMatchIndex;
  const matchCount = sourceMode
    ? sourceMatchCount
    : resolvedVisualState.matchCount;
  const error = sourceMode ? sourceResult.error : resolvedVisualState.error;
  const canReplace = !readOnly && (!sourceMode || Boolean(onSourceChange));

  const moveMatch = React.useCallback(
    (direction: 'next' | 'previous') => {
      if (sourceMode) {
        if (sourceMatchCount === 0) {
          return;
        }
        setSourceActiveIndex((current) => {
          const delta = direction === 'next' ? 1 : -1;
          const resolvedCurrent = Math.min(
            Math.max(current, 0),
            sourceMatchCount - 1,
          );
          return (resolvedCurrent + delta + sourceMatchCount) % sourceMatchCount;
        });
        return;
      }

      if (direction === 'next') {
        controller?.findNext();
      } else {
        controller?.findPrevious();
      }
    },
    [controller, sourceMatchCount, sourceMode],
  );

  const toggleOption = React.useCallback(
    (option: keyof DocumentFindOptions) => {
      setSourceActiveIndex(query ? 0 : -1);
      setOptions((current) => ({
        ...current,
        [option]: !current[option],
      }));
    },
    [query],
  );

  React.useEffect(() => {
    const handleFindNavigationShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F3') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      moveMatch(event.shiftKey ? 'previous' : 'next');
    };

    window.addEventListener('keydown', handleFindNavigationShortcut, true);

    return () => {
      window.removeEventListener(
        'keydown',
        handleFindNavigationShortcut,
        true,
      );
    };
  }, [moveMatch]);

  const replaceCurrent = React.useCallback(() => {
    if (!canReplace) {
      return;
    }

    if (!sourceMode) {
      controller?.replaceCurrent(replacement);
      return;
    }

    const match = sourceResult.matches[resolvedSourceActiveIndex];
    if (match) {
      onSourceChange?.(
        replaceDocumentTextMatch(sourceText, match, replacement),
      );
    }
  }, [
    canReplace,
    controller,
    onSourceChange,
    replacement,
    resolvedSourceActiveIndex,
    sourceMode,
    sourceResult.matches,
    sourceText,
  ]);

  const replaceAllMatches = React.useCallback(() => {
    if (!canReplace) {
      return;
    }

    if (!sourceMode) {
      controller?.replaceAll(replacement);
      return;
    }

    if (sourceResult.matches.length > 0) {
      onSourceChange?.(
        replaceAllDocumentTextMatches(
          sourceText,
          sourceResult.matches,
          replacement,
        ),
      );
    }
  }, [
    canReplace,
    controller,
    onSourceChange,
    replacement,
    sourceMode,
    sourceResult.matches,
    sourceText,
  ]);

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      moveMatch(event.shiftKey ? 'previous' : 'next');
    }
  };

  return (
    <TooltipProvider>
      <aside
        aria-label="文档查找和替换"
        className="absolute top-3 right-5 z-50 w-[min(520px,calc(100%-2rem))] overflow-hidden rounded-xl border border-border/80 bg-background/96 shadow-sm backdrop-blur-xl"
        data-testid="document-find-bar"
        role="dialog"
      >
        <div className="flex h-11 items-center gap-1.5 px-2">
          <FindIconButton
            active={replaceExpanded}
            label={replaceExpanded ? '收起替换' : '展开替换'}
            onClick={() => setReplaceExpanded((current) => !current)}
          >
            <Replace size={15} strokeWidth={1.8} />
          </FindIconButton>

          <label className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              size={14}
              strokeWidth={1.8}
            />
            <input
              ref={searchInputRef}
              aria-invalid={Boolean(error)}
              aria-label="查找内容"
              autoCapitalize="off"
              autoComplete="off"
              className={cn(
                'h-8 w-full rounded-md border bg-muted/25 pr-14 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/15',
                error && 'border-destructive/70 focus:border-destructive',
              )}
              placeholder="查找"
              role="searchbox"
              spellCheck={false}
              type="search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.currentTarget.value;
                setQuery(nextQuery);
                setSourceActiveIndex(nextQuery ? 0 : -1);
              }}
              onKeyDown={handleInputKeyDown}
            />
            <span
              aria-live="polite"
              className={cn(
                'pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground',
                error && 'text-destructive',
              )}
              title={error ?? undefined}
            >
              {error
                ? '无效'
                : matchCount > 0
                  ? `${activeMatchIndex + 1}/${matchCount}`
                  : '0/0'}
            </span>
          </label>

          <FindToggleButton
            active={options.caseSensitive}
            label="区分大小写"
            onClick={() => toggleOption('caseSensitive')}
          >
            <CaseSensitive size={16} strokeWidth={1.8} />
          </FindToggleButton>
          <FindToggleButton
            active={options.wholeWord}
            label="完整词匹配"
            onClick={() => toggleOption('wholeWord')}
          >
            <WholeWord size={16} strokeWidth={1.8} />
          </FindToggleButton>
          <FindToggleButton
            active={options.regex}
            label="使用正则表达式"
            onClick={() => toggleOption('regex')}
          >
            <Regex size={15} strokeWidth={1.8} />
          </FindToggleButton>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          <FindIconButton
            disabled={matchCount === 0}
            label="上一个匹配"
            onClick={() => moveMatch('previous')}
          >
            <ChevronUp size={16} strokeWidth={1.9} />
          </FindIconButton>
          <FindIconButton
            disabled={matchCount === 0}
            label="下一个匹配"
            onClick={() => moveMatch('next')}
          >
            <ChevronDown size={16} strokeWidth={1.9} />
          </FindIconButton>
          <FindIconButton label="关闭查找" onClick={onClose}>
            <X size={15} strokeWidth={1.9} />
          </FindIconButton>
        </div>

        {replaceExpanded ? (
          <div className="flex h-11 items-center gap-1.5 border-t border-border/60 bg-muted/15 px-2 pl-10">
            <label className="relative min-w-0 flex-1">
              <Replace
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
                size={14}
                strokeWidth={1.8}
              />
              <input
                aria-label="替换为"
                autoCapitalize="off"
                autoComplete="off"
                className="h-8 w-full rounded-md border bg-background pr-3 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/15"
                placeholder="替换为"
                spellCheck={false}
                type="text"
                value={replacement}
                onChange={(event) => setReplacement(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    replaceCurrent();
                  }
                }}
              />
            </label>
            <FindIconButton
              disabled={!canReplace || matchCount === 0}
              label="替换当前匹配"
              onClick={replaceCurrent}
            >
              <Replace size={15} strokeWidth={1.8} />
            </FindIconButton>
            <FindIconButton
              disabled={!canReplace || matchCount === 0}
              label="替换全部匹配"
              onClick={replaceAllMatches}
            >
              <ReplaceAll size={15} strokeWidth={1.8} />
            </FindIconButton>
          </div>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}

function FindToggleButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <FindIconButton active={active} label={label} onClick={onClick} pressed={active}>
      {children}
    </FindIconButton>
  );
}

function FindIconButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
  pressed,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-35',
            active && 'bg-accent text-foreground',
          )}
          disabled={disabled}
          type="button"
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function scrollTextareaMatchIntoView(
  textarea: HTMLTextAreaElement,
  text: string,
  matchStart: number,
) {
  const line = text.slice(0, matchStart).split(/\r?\n/).length - 1;
  const lineHeight = 24;
  const targetTop = Math.max(0, line * lineHeight - textarea.clientHeight / 2);
  textarea.scrollTop = targetTop;
}
