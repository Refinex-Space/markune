'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface WorkspaceResizeHandleProps {
  'aria-label': string;
  className?: string;
  direction: 'left' | 'right';
  max: number;
  min: number;
  value: number;
  onResize: (width: number) => void;
}

function clampWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function WorkspaceResizeHandle({
  'aria-label': ariaLabel,
  className,
  direction,
  max,
  min,
  value,
  onResize,
}: WorkspaceResizeHandleProps) {
  const dragStateRef = React.useRef<{
    startPointerX: number;
    startWidth: number;
  } | null>(null);
  const pendingWidthRef = React.useRef<number | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const delta =
        direction === 'left'
          ? event.clientX - dragState.startPointerX
          : dragState.startPointerX - event.clientX;

      pendingWidthRef.current = clampWidth(
        dragState.startWidth + delta,
        min,
        max,
      );

      if (animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;

        if (pendingWidthRef.current === null) {
          return;
        }

        const pendingWidth = pendingWidthRef.current;
        pendingWidthRef.current = null;
        onResize(pendingWidth);
      });
    };

    const handlePointerUp = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (pendingWidthRef.current !== null) {
        onResize(pendingWidthRef.current);
        pendingWidthRef.current = null;
      }

      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingWidthRef.current = null;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);
    };
  }, [direction, isDragging, max, min, onResize]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStateRef.current = {
      startPointerX: event.clientX,
      startWidth: value,
    };
    setIsDragging(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      onResize(min);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onResize(max);
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();

    const keyboardDelta = event.key === 'ArrowRight' ? 16 : -16;
    const signedDelta = direction === 'left' ? keyboardDelta : -keyboardDelta;

    onResize(clampWidth(value + signedDelta, min, max));
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        'group relative z-10 flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center outline-none',
        className,
      )}
      data-dragging={isDragging ? 'true' : 'false'}
      role="separator"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-12 w-px rounded-full bg-border/0 transition-[background-color,width,opacity] duration-150',
          'group-hover:w-0.5 group-hover:bg-[#3574f0]/60',
          'group-focus-visible:w-0.5 group-focus-visible:bg-[#3574f0]/70',
          isDragging && 'w-0.5 bg-[#3574f0]/80',
        )}
      />
    </div>
  );
}
