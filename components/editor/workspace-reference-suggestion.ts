// Imperative popup renderer for the `[[` workspace document reference suggestion.
// Markweave owns trigger detection, querying and Floating UI positioning (via
// `state.mount`); this module only paints the candidate list and forwards
// keyboard/mouse selection. Kept framework-light (plain DOM) because Markweave's
// render contract is imperative. author: liyao

import type {
  MarkweaveReferenceItem,
  MarkweaveReferenceRenderer,
  MarkweaveReferenceRenderState,
} from 'markweave';

export interface WorkspaceReferenceItem extends MarkweaveReferenceItem {
  /** Muted secondary line, typically the containing folder path. */
  subtitle?: string;
}

const SUGGESTION_WIDTH = '20rem';
const CONTAINER_CLASS =
  'madora-doc-suggestion z-50 flex max-h-72 w-80 max-w-[min(20rem,calc(100vw-2rem))] min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md';
const ROW_BASE_CLASS =
  'flex w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left outline-none';
const ROW_ACTIVE_CLASS = 'bg-accent text-accent-foreground';

const DOCUMENT_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

export function createWorkspaceReferenceRenderer(options?: {
  emptyLabel?: string;
}): MarkweaveReferenceRenderer<WorkspaceReferenceItem> {
  const emptyLabel = options?.emptyLabel ?? '无匹配文档';

  let container: HTMLElement | null = null;
  let unmount: (() => void) | null = null;
  let items: readonly WorkspaceReferenceItem[] = [];
  let activeIndex = 0;
  let command: ((item: WorkspaceReferenceItem) => void) | null = null;

  const select = (index: number) => {
    const item = items[index];
    if (item && command) {
      command(item);
    }
  };

  const paint = () => {
    if (!container) {
      return;
    }

    container.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-2 py-1.5 text-muted-foreground';
      empty.textContent = emptyLabel;
      container.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === activeIndex));
      row.dataset.index = String(index);
      row.className =
        index === activeIndex
          ? `${ROW_BASE_CLASS} ${ROW_ACTIVE_CLASS}`
          : ROW_BASE_CLASS;

      const icon = document.createElement('span');
      icon.className = 'shrink-0 text-muted-foreground';
      icon.innerHTML = DOCUMENT_ICON_SVG;

      // Flex items default to min-width:auto; without min-w-0 a long title
      // expands the floating panel and collapses the page layout. author: liyao
      const title = document.createElement('span');
      title.className = 'min-w-0 flex-1 truncate';
      title.textContent = item.title ?? item.label;

      row.append(icon, title);

      if (item.subtitle) {
        const subtitle = document.createElement('span');
        subtitle.className =
          'ml-auto max-w-[40%] shrink-0 truncate text-xs text-muted-foreground';
        subtitle.textContent = item.subtitle;
        row.appendChild(subtitle);
      }

      // Keep editor focus/selection while clicking a candidate.
      row.addEventListener('mousedown', (event) => event.preventDefault());
      row.addEventListener('click', (event) => {
        event.preventDefault();
        select(index);
      });
      row.addEventListener('mousemove', () => {
        if (activeIndex !== index) {
          activeIndex = index;
          paint();
        }
      });

      container!.appendChild(row);
    });

    const activeRow = container.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    activeRow?.scrollIntoView({ block: 'nearest' });
  };

  const sync = (state: MarkweaveReferenceRenderState<WorkspaceReferenceItem>) => {
    items = state.items;
    command = state.command;
    if (activeIndex > items.length - 1) {
      activeIndex = Math.max(0, items.length - 1);
    }
    paint();
  };

  return {
    onStart(state) {
      container = document.createElement('div');
      container.className = CONTAINER_CLASS;
      // Hard-cap width so Floating UI / flex content cannot expand the panel.
      container.style.width = SUGGESTION_WIDTH;
      container.style.maxWidth = `min(${SUGGESTION_WIDTH}, calc(100vw - 2rem))`;
      container.style.boxSizing = 'border-box';
      activeIndex = 0;
      sync(state);
      unmount = state.mount(container);
    },
    onUpdate(state) {
      sync(state);
    },
    onExit() {
      unmount?.();
      unmount = null;
      container = null;
      items = [];
      command = null;
      activeIndex = 0;
    },
    onKeyDown({ event }) {
      if (!container) {
        return false;
      }

      switch (event.key) {
        case 'ArrowDown': {
          if (items.length === 0) return false;
          activeIndex = (activeIndex + 1) % items.length;
          paint();
          return true;
        }
        case 'ArrowUp': {
          if (items.length === 0) return false;
          activeIndex = (activeIndex - 1 + items.length) % items.length;
          paint();
          return true;
        }
        case 'Enter':
        case 'Tab': {
          if (items.length === 0) return false;
          select(activeIndex);
          return true;
        }
        default:
          return false;
      }
    },
  };
}
