import {
  createInlineImportAsset,
  IMPORT_ASSET_PREFIX,
  prepareHtmlImport,
} from './document-import-core';

import type { PreparedImportDocument } from './document-import-core';
import type { DocumentImportSource } from './workspace-types';

const WORD_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='标题'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='副标题'] => h2:fresh",
  ...Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    return `p[style-name='标题 ${level}'] => h${level}:fresh`;
  }),
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='引用'] => blockquote > p:fresh",
  "p[style-name='Code'] => pre:fresh",
  "p[style-name='代码'] => pre:fresh",
];

export async function prepareWordImport(
  source: DocumentImportSource,
  bytes: Uint8Array,
): Promise<PreparedImportDocument> {
  const mammoth = (await import('mammoth')).default;
  const warnings: string[] = [];
  const embeddedAssets: PreparedImportDocument['assets'] = [];
  let imageIndex = 0;
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const result = await mammoth.convertToHtml(
    { arrayBuffer, buffer: bytes } as unknown as Parameters<
      typeof mammoth.convertToHtml
    >[0],
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        imageIndex += 1;
        try {
          const data = new Uint8Array(await image.readAsArrayBuffer());
          const asset = createInlineImportAsset(
            data,
            image.contentType,
            `word-image-${imageIndex}.${extensionForWordImage(image.contentType)}`,
          );
          embeddedAssets.push(asset);
          return { src: `${IMPORT_ASSET_PREFIX}${asset.token}` };
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `Word 图片 ${imageIndex} 未导入：${error.message}`
              : `Word 图片 ${imageIndex} 未导入。`,
          );
          return { src: '' };
        }
      }),
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      includeDefaultStyleMap: true,
      styleMap: WORD_STYLE_MAP,
    },
  );

  warnings.push(
    ...result.messages.map((message) =>
      message.type === 'error'
        ? `Word 转换错误：${message.message}`
        : `Word 转换提示：${message.message}`,
    ),
  );

  return prepareHtmlImport({
    embeddedAssets,
    html: result.value,
    source,
    warnings,
  });
}

function extensionForWordImage(mediaType: string) {
  switch (mediaType.toLowerCase()) {
    case 'image/bmp':
      return 'bmp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}
