'use client';

import type { ComponentType, SVGProps } from 'react';
import Claude from '@thesvg/react/claude';
import Trae from '@thesvg/react/trae';
import Codex from '@thesvg/react/codex';
import Cursor from '@thesvg/react/cursor';
import GithubCopilot from '@thesvg/react/github-copilot';
import Zhipu from '@thesvg/react/zhipu';
import Grok from '@thesvg/react/grok';
import Kimi from '@thesvg/react/kimi';
import Minimax from '@thesvg/react/minimax';
import Opencode from '@thesvg/react/opencode';
import Bailian from '@thesvg/react/bailian';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const icons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  'claude-acp': Claude,
  'minimax-code': Minimax,
  opencode: Opencode,
  qoder: Bailian,
};
const themedIcons = {
  'codex-acp': Codex,
  cursor: Cursor,
  'github-copilot-cli': GithubCopilot,
  'grok-build': Grok,
};

export function AgentIcon({
  agentId,
  size = 20,
  className,
}: {
  agentId?: string;
  size?: number;
  className?: string;
}) {
  const Themed = themedIcons[agentId as keyof typeof themedIcons];
  const Icon = icons[agentId ?? ''] ?? Bot;
  return (
    <span
      aria-hidden="true"
      data-agent-icon={agentId ?? 'custom'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-foreground',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {agentId === 'kimi' ? (
        <Kimi
          width={size}
          height={size}
          style={{ color: '#0f172a' }}
          className="rounded-[22%] dark:ring-1 dark:ring-white/25"
        />
      ) : agentId === 'codebuddy-code' ? (
        <>
          <Trae
            variant="mono"
            width={size}
            height={size}
            className="block dark:hidden"
          />
          <Trae width={size} height={size} className="hidden dark:block" />
        </>
      ) : agentId === 'glm-acp-agent' ? (
        <>
          <Zhipu width={size} height={size} className="block dark:hidden" />
          <Zhipu
            variant="mono"
            width={size}
            height={size}
            className="hidden dark:block"
          />
        </>
      ) : Themed ? (
        <>
          <Themed
            variant="light"
            width={size}
            height={size}
            className="block dark:hidden"
          />
          <Themed
            variant="dark"
            width={size}
            height={size}
            className="hidden dark:block"
          />
        </>
      ) : (
        <Icon width={size} height={size} />
      )}
    </span>
  );
}
