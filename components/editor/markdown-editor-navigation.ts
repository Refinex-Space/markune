import type { getMarkweaveDocumentViewportCoordinator } from 'markweave';
type MarkweaveDocumentViewportCoordinator = NonNullable<
  ReturnType<typeof getMarkweaveDocumentViewportCoordinator>
>;

// refinex: Virtual blocks can change height after revealPosition releases its navigation pin.
export async function settleEditorNavigation(
  coordinator: MarkweaveDocumentViewportCoordinator,
  position: number,
  signal: AbortSignal,
  isCurrent: () => boolean,
  interrupted: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline && !signal.aborted && isCurrent()) {
    if (interrupted()) return true;
    if (!(await coordinator.nextFrame(signal))) return false;
    if (
      coordinator.snapshot.state !== 'idle' ||
      coordinator.snapshot.pendingVisualWork > 0
    )
      continue;
    if (!(await coordinator.nextFrame(signal))) return false;
    if (signal.aborted || !isCurrent()) return false;
    if (interrupted()) return true;
    if (
      coordinator.snapshot.state !== 'idle' ||
      coordinator.snapshot.pendingVisualWork > 0
    )
      continue;
    const target = coordinator.editor.view.coordsAtPos(position);
    const viewport = coordinator.getVisibleBounds();
    if (target.top >= viewport.top && target.bottom <= viewport.bottom)
      return true;
    await coordinator.revealPosition(position, {
      reason: 'host',
      align: 'center',
      focus: false,
      signal,
    });
  }
  return false;
}
