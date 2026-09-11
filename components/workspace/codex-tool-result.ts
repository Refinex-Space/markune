export function boundedToolResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.content)) return value;
  let imageBudget = 3 * 1024 * 1024;
  return {
    ...record,
    content: record.content
      .slice(0, 32)
      .map((item) => {
        if (!item || typeof item !== 'object') return item;
        const data = item as Record<string, unknown>;
        if (data.type === 'image' && typeof data.data === 'string') {
          if (data.data.length > imageBudget)
            return {
              type: 'text',
              text: '工具图片超过内嵌预览上限，请查看工具提供的文件链接。',
            };
          imageBudget -= data.data.length;
          return data;
        }
        if (
          data.type === 'audio' ||
          (data.type === 'resource' && typeof data.resource === 'object')
        )
          return {
            type: 'text',
            text: '工具返回了媒体资源，请通过来源文件链接使用产物阅读器打开。',
          };
        return data;
      })
      .concat(
        record.content.length > 32
          ? [
              {
                type: 'text',
                text: '工具结果超过 32 段，剩余内容未在此预览中展示。',
              },
            ]
          : [],
      ),
  };
}
export function toolResultWithoutBinary(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[嵌套内容已省略]';
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value
      .slice(0, 32)
      .map((item) => toolResultWithoutBinary(item, depth + 1));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          !(
            key === 'data' && ['image', 'audio'].includes(String(record.type))
          ) && key !== 'blob',
      )
      .map(([key, value]) => [
        key,
        typeof value === 'object'
          ? toolResultWithoutBinary(value, depth + 1)
          : value,
      ]),
  );
}
