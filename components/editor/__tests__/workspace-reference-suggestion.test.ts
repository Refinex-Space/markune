import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceReferenceRenderer } from '../workspace-reference-suggestion';

const items = [0, 1, 2].map(index => ({ href: `${index}.md`, label: `文档 ${index}` }));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeEach(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  document.body.replaceChildren();
});

describe('workspace reference popup scroll ownership', () => {
  it('is positioned outside document flow before the asynchronous mount measures it', () => {
    const renderer = createWorkspaceReferenceRenderer();
    renderer.onStart?.({ items, query: '', loading: false, command: vi.fn(), clientRect: null,
      mount(element) {
        expect(element.style.position).toBe('absolute');
        expect(element.style.top).toBe('0px');
        expect(element.style.left).toBe('0px');
        document.body.append(element);
        return () => element.remove();
      },
    });
    renderer.onExit?.();
  });

  it('scrolls only the candidate list when keyboard selection moves out of view', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    let container!: HTMLElement;
    const renderer = createWorkspaceReferenceRenderer();
    const state = { items, query: '', loading: false, command: vi.fn(), clientRect: null,
      mount(element: HTMLElement) {
        container = element;
        document.body.append(element);
        Object.defineProperty(element, 'clientHeight', { value: 40 });
        return () => element.remove();
      },
    };
    renderer.onStart?.(state);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this === container ? 100 : 100 + Number(this.dataset.index) * 32 - container.scrollTop;
      return { top, bottom: top + (this === container ? 40 : 32), left: 0, right: 320, width: 320, height: this === container ? 40 : 32, x: 0, y: top, toJSON() {} };
    });
    renderer.onKeyDown?.({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) });
    expect(container.scrollTop).toBe(24);
    renderer.onKeyDown?.({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) });
    expect(container.scrollTop).toBe(56);
    expect(scrollIntoView).not.toHaveBeenCalled();
    renderer.onExit?.();
  });
});
