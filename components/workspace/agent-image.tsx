/* eslint-disable @next/next/no-img-element -- refinex: ACP provides bounded inline image bytes, never a server-optimized URL. */
export interface AgentImageData {
  mimeType: string;
  data: string;
}
export function inlineAgentImage(value: unknown): AgentImageData | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  if (
    block.type !== 'image' ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
      String(block.mimeType),
    ) ||
    typeof block.data !== 'string' ||
    block.data.length > 4 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(block.data)
  )
    return null;
  return { mimeType: String(block.mimeType), data: block.data };
}
export function AgentImages({ images }: { images?: AgentImageData[] }) {
  return images?.length ? (
    <div className="my-2 flex flex-wrap gap-2">
      {images.map((image, index) => (
        <img
          key={index}
          className="max-h-80 max-w-full rounded-lg border object-contain"
          alt="智能体图片"
          src={`data:${image.mimeType};base64,${image.data}`}
          loading="lazy"
        />
      ))}
    </div>
  ) : null;
}
