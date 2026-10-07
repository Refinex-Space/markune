import { describe, expect, it } from 'vitest';
import { inlineAgentImage } from '../agent-image';
describe('ACP inline image bounds', () => {
  it('accepts supported inline raster bytes only', () => {
    expect(
      inlineAgentImage({ type: 'image', mimeType: 'image/png', data: 'YWJj' }),
    ).toEqual({ mimeType: 'image/png', data: 'YWJj' });
    expect(
      inlineAgentImage({
        type: 'image',
        mimeType: 'image/svg+xml',
        data: 'YWJj',
      }),
    ).toBeNull();
    expect(
      inlineAgentImage({
        type: 'image',
        mimeType: 'image/png',
        data: 'https://example.com/image.png',
      }),
    ).toBeNull();
    expect(
      inlineAgentImage({
        type: 'image',
        mimeType: 'image/png',
        data: 'a'.repeat(4 * 1024 * 1024 + 1),
      }),
    ).toBeNull();
  });
});
