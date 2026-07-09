'use client';

// @author refinex
// 单行工具卡片：复刻 1code AgentToolCall。
// pending 时 title 套 CSS shimmer 动画（替代 1code 的 motion/react TextShimmer）。
// subtitle 支持 HTML（Edit 工具的 diff 统计带颜色）。

import { memo } from 'react';

export interface AiToolCallProps {
  title: string;
  subtitle?: string;
  tooltipContent?: string;
  isPending?: boolean;
  isError?: boolean;
  onClick?: () => void;
}

export const AiToolCall = memo(function AiToolCall({
  title,
  subtitle,
  tooltipContent,
  isPending = false,
  onClick,
}: AiToolCallProps) {
  const clickableClass = onClick
    ? ' cursor-pointer hover:text-foreground transition-colors'
    : '';
  const subtitleElement = subtitle
    ? tooltipContent
      ? // tooltip 暂用 title 属性（D 子项目不引入 Radix Tooltip 以减依赖）
        (
          <span
            title={tooltipContent}
            className={`text-muted-foreground/60 truncate min-w-0${clickableClass}`}
            dangerouslySetInnerHTML={{ __html: subtitle }}
            onClick={onClick}
          />
        )
      : (
        <span
          className={`text-muted-foreground/60 truncate min-w-0${clickableClass}`}
          dangerouslySetInnerHTML={{ __html: subtitle }}
          onClick={onClick}
        />
      )
    : null;

  return (
    <div className="flex items-start gap-1.5 rounded-md px-2 py-0.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex-shrink-0 whitespace-nowrap font-medium">
            {isPending ? (
              <span className="ai-tool-shimmer inline-block">{title}</span>
            ) : (
              title
            )}
          </span>
          {subtitleElement}
        </div>
      </div>
    </div>
  );
});
