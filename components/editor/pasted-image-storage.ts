import type {
  MarkweaveEditorUpdatePayload,
  MarkweaveSlashCommandUploadHandler,
} from '@markweave/react';
import { extractMarkdownImageSources } from '@/components/workspace/document-asset-references';

type Editor = MarkweaveEditorUpdatePayload['editor'];

export async function capturePastedImageStorage(
  clipboard: Pick<DataTransfer, 'getData' | 'files'>,
  editor: Editor,
  upload: MarkweaveSlashCommandUploadHandler,
  onError: (message: string) => void,
  shouldProcess: () => Promise<boolean> = async () => true,
) {
  if (clipboard.files.length || editor.isDestroyed) return;
  const html = clipboard.getData('text/html');
  const sources = new Set<string>();
  const addSource = (src: string) => {
    try {
      const url = new URL(src);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        sources.add(src);
        sources.add(url.href);
      }
    } catch {}
  };
  if (html.trim()) {
    for (const image of new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelectorAll('img[src]')) {
      const src = image.getAttribute('src');
      if (src) addSource(src);
    }
  } else {
    const text = clipboard.getData('text/plain').trim();
    if (/^https?:\/\//i.test(text)) addSource(text);
    else extractMarkdownImageSources(text).forEach(addSource);
  }
  if (!sources.size) return;
  const previous = new Set<unknown>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') previous.add(node);
  });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  if (editor.isDestroyed) return;
  const inserted: Array<{ node: typeof editor.state.doc; src: string }> = [];
  editor.state.doc.descendants((node) => {
    if (
      node.type.name === 'image' &&
      !previous.has(node) &&
      sources.has(node.attrs.src)
    )
      inserted.push({ node, src: node.attrs.src });
  });
  if (!inserted.length) return;
  try {
    if (!(await shouldProcess()) || editor.isDestroyed) return;
  } catch {
    onError('无法读取图片存储设置，已保留原网址。');
    return;
  }
  if (inserted.length > 128) {
    onError('本次粘贴图片过多，已保留原网址。');
    return;
  }
  let failures = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, inserted.length) }, async () => {
      while (inserted.length && !editor.isDestroyed) {
        const item = inserted.shift()!;
        try {
          const result = await upload({
            kind: 'image',
            source: { type: 'url', value: item.src },
            trigger: 'image-insert',
          });
          if (editor.isDestroyed || !result.src || result.src === item.src)
            continue;
          let position: number | null = null;
          editor.state.doc.descendants((node, pos) => {
            if (node === item.node) position = pos;
          });
          if (position !== null) {
            editor.view.dispatch(
              editor.state.tr
                .setNodeMarkup(position, undefined, {
                  ...item.node.attrs,
                  src: result.src,
                })
                .setMeta('addToHistory', false),
            );
          }
        } catch {
          failures += 1;
        }
      }
    }),
  );
  if (failures)
    onError(
      failures === 1
        ? '图片保存失败，已保留原网址。'
        : `${failures} 张图片保存失败，已保留原网址。`,
    );
}
