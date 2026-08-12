import type { RefObject } from 'react';

import type { DocumentLoadState } from './workspace-types';

export async function waitForDocumentPathLoaded(
  pathRef: RefObject<string | null>,
  loadStateRef: RefObject<DocumentLoadState>,
  expectedPath: string,
  timeoutMs = 15_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (pathRef.current !== expectedPath) {
      return false;
    }
    if (loadStateRef.current === 'loaded') {
      return true;
    }
    if (loadStateRef.current === 'error') {
      return false;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 32);
    });
  }

  return (
    pathRef.current === expectedPath && loadStateRef.current === 'loaded'
  );
}
