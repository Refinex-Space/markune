import { describe, expect, it } from 'vitest';
import {
  extractDocumentFileReferences,
  isDocumentFileReference,
} from '../document-asset-references';

describe('document file references', () => {
  it('extracts images, file attachments, reference definitions and media without code examples', () => {
    const markdown =
      '![a](assets/a.png)\n[file](assets/report.pdf)\n[note](other.md)\n![ref][image]\n\n[image]: ../b.png\n\n<video src="assets/video.mp4"></video>\n\n`![code](ignored.png)`\n\n```md\n![code](ignored-too.png)\n```';
    expect(extractDocumentFileReferences(markdown)).toEqual([
      'assets/a.png',
      'assets/report.pdf',
      '../b.png',
      'assets/video.mp4',
    ]);
  });
  it('keeps remote and managed schemes out of local file resolution', () => {
    for (const url of [
      'https://example.com/a.png',
      '//example.com/a.png',
      'mailto:x@example.com',
      'data:image/png;base64,AA',
      'markune-asset://id',
      '.markune/assets/files/ab/id.png',
    ])
      expect(isDocumentFileReference(url)).toBe(false);
    expect(isDocumentFileReference('file:///Users/user/a.png')).toBe(true);
    expect(isDocumentFileReference('C:\\Images\\a.png')).toBe(true);
  });
});
