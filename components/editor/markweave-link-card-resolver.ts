import type {
  MarkweaveLinkCardMetadata,
  MarkweaveLinkCardResolver,
} from '@markweave/react';

import {
  isTauriRuntime,
  resolveLinkPreview,
} from '@/components/workspace/workspace-api';
import type { LinkPreviewMetadata } from '@/components/workspace/workspace-types';

export const resolveMarkweaveLinkCard: MarkweaveLinkCardResolver = async ({
  href,
  signal,
  title,
}) => {
  if (signal.aborted) {
    return null;
  }

  try {
    const metadata = isTauriRuntime()
      ? await waitForPreviewOrAbort(resolveLinkPreview(title, href), signal)
      : await resolveWebLinkPreview(href, title, signal);

    return metadata ? toMarkweaveLinkCardMetadata(metadata) : null;
  } catch {
    return null;
  }
};

async function resolveWebLinkPreview(
  href: string,
  title: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ title, url: href });
  const response = await fetch(`/api/link-preview?${params.toString()}`, {
    signal,
  });

  if (!response.ok || signal.aborted) {
    return null;
  }

  return (await response.json()) as LinkPreviewMetadata;
}

function waitForPreviewOrAbort<T>(
  request: Promise<T>,
  signal: AbortSignal,
): Promise<T | null> {
  if (signal.aborted) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const finish = (value: T | null) => {
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);

    signal.addEventListener('abort', onAbort, { once: true });
    request.then(
      (value) => finish(signal.aborted ? null : value),
      () => finish(null),
    );
  });
}

function toMarkweaveLinkCardMetadata(
  metadata: LinkPreviewMetadata,
): MarkweaveLinkCardMetadata | null {
  if (metadata.error || typeof metadata.title !== 'string') {
    return null;
  }

  return {
    title: metadata.title,
    ...(typeof metadata.description === 'string'
      ? { description: metadata.description }
      : {}),
    ...(typeof metadata.domain === 'string'
      ? { siteName: metadata.domain }
      : {}),
    ...(typeof metadata.image === 'string' ? { imageUrl: metadata.image } : {}),
  };
}
