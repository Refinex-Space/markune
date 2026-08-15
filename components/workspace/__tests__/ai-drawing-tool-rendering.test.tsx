import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityDetails } from '../ai-panel';

describe('AI drawing tool rendering', () => {
  it('renders dynamic tool inputImage as a thumbnail and keeps it out of JSON detail', () => {
    const imageUrl = 'data:image/webp;base64,UklGRgAAAABXRUJQ';
    render(
      <ActivityDetails
        activity={
          {
            arguments: { title: '架构图' },
            completedAtMs: 1,
            durationMs: 10,
            error: null,
            id: 'dynamic-1',
            kind: 'dynamic',
            label: '调用 markune_drawing · preview_mermaid',
            progress: null,
            result: [
              { type: 'inputText', text: '{"previewId":"preview-1"}' },
              { type: 'inputImage', imageUrl },
            ],
            server: 'markune_drawing',
            startedAtMs: 0,
            status: 'completed',
            tool: 'preview_mermaid',
          } as never
        }
        onOpenDocument={() => undefined}
      />,
    );

    expect(screen.getByAltText('AI 图稿预览').getAttribute('src')).toBe(imageUrl);
    expect(screen.queryByText(/data:image\/webp/)).toBeNull();
  });
});
