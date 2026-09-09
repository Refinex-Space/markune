export type AiReference =
  | { kind: 'web'; url: string }
  | { kind: 'anchor'; hash: string }
  | {
      kind: 'document';
      fingerprint?: string;
      relativePath: string;
      hash: string | null;
      line?: number;
    }
  | {
      kind: 'resource';
      fingerprint?: string;
      relativePath: string;
      hash: string | null;
      page?: number;
    }
  | { kind: 'managed'; assetId: string; page?: number };
const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('引用地址编码无效');
  }
};
export function resolveAiReference(
  href: string,
  root: string | null,
  sourceDocument?: string | null,
): AiReference {
  const raw = href.trim();
  if (!raw || /[\u0000-\u001f]/.test(raw)) throw new Error('引用地址无效');
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.username || url.password) throw new Error('不支持包含凭据的网址');
    return { kind: 'web', url: url.toString() };
  }
  if (raw.startsWith('#'))
    return { kind: 'anchor', hash: decode(raw.slice(1)) };
  if (!root) throw new Error('请先打开工作区再查看本地来源');
  let value = raw;
  if (/^markweave:\/\/doc\//i.test(value))
    value = decode(value.slice('markweave://doc/'.length));
  if (/^markune-asset:\/\//i.test(value)) {
    const match = /^markune-asset:\/\/([a-f0-9]{64})(?:#page=(\d+))?$/i.exec(
      value,
    );
    if (!match) throw new Error('资产引用无效');
    return {
      kind: 'managed',
      assetId: match[1].toLowerCase(),
      page: match[2] ? Number(match[2]) : undefined,
    };
  }
  if (/^file:/i.test(value)) {
    const url = new URL(value);
    if (url.hostname && url.hostname !== 'localhost')
      throw new Error('网络文件路径需要先获得授权');
    value = url.pathname + url.hash;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value))
    throw new Error('不支持此引用协议');
  const version = /[?&]v=([a-f0-9]{64})(?=&|#|$)/i.exec(value)?.[1];
  const at = value.indexOf('#');
  const hash = at >= 0 ? decode(value.slice(at + 1)) : null;
  let path = decode(
    (at >= 0 ? value.slice(0, at) : value).split('?')[0],
  ).replace(/\\/g, '/');
  if (/[\u0000-\u001f]/.test(path)) throw new Error('引用地址包含控制字符');
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const windows = /^[a-z]:\//i.test(normalizedRoot);
  if (windows && /^\/[a-z]:\//i.test(path)) path = path.slice(1);
  const inside = windows
    ? path.toLowerCase().startsWith(normalizedRoot.toLowerCase() + '/')
    : path.startsWith(normalizedRoot + '/');
  if (inside) path = path.slice(normalizedRoot.length + 1);
  else if (/^[a-z]:\//i.test(path) || /^file:/i.test(raw))
    throw new Error('该文件位于工作区外，请先选择文件授权');
  else path = path.replace(/^\/+/, '');
  const parts: string[] = [];
  if (/^\.\.?\//.test(path) && sourceDocument) {
    let source = sourceDocument.replace(/\\/g, '/');
    if (source.startsWith(normalizedRoot + '/'))
      source = source.slice(normalizedRoot.length + 1);
    parts.push(...source.split('/').slice(0, -1));
  }
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!parts.length) throw new Error('引用超出当前工作区');
      parts.pop();
    } else if (part && part !== '.') {
      if (part.startsWith('.'))
        throw new Error('不能通过引用读取工作区私有目录');
      parts.push(part);
    }
  }
  const relativePath = parts.join('/');
  if (!relativePath) throw new Error('引用缺少文件路径');
  if (/\.mdx?$/i.test(relativePath)) {
    const line = hash && /^L(\d+)(?:-L\d+)?$/i.exec(hash);
    return {
      kind: 'document',
      ...(version ? { fingerprint: version.toLowerCase() } : {}),
      relativePath,
      hash,
      ...(line ? { line: Math.max(1, Number(line[1])) } : {}),
    };
  }
  const page = hash && /^page=(\d+)$/i.exec(hash);
  return {
    kind: 'resource',
    ...(version ? { fingerprint: version.toLowerCase() } : {}),
    relativePath,
    hash,
    ...(page ? { page: Math.max(1, Number(page[1])) } : {}),
  };
}
export function safeAiUrl(value: string) {
  return /^(?:https?:|file:|markune-asset:|markweave:\/\/doc\/|[a-z]:[\\/])/i.test(
    value,
  ) || !/^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : '';
}
