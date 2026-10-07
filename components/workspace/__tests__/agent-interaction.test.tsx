import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../ai-message-content', () => ({
  AiMessageContent: ({ markdown }: { markdown: string }) => (
    <div>{markdown}</div>
  ),
}));
import { AgentInteractionCard } from '../agent-interaction';

describe('agent decisions', () => {
  it('only sends the selected provider option and distinguishes cancellation', async () => {
    const user = userEvent.setup(),
      resolve = vi.fn(),
      cancel = vi.fn();
    render(
      <AgentInteractionCard
        interaction={{
          id: 'permission',
          kind: 'permission',
          params: {
            toolCall: { title: 'Edit note' },
            options: [
              {
                optionId: 'opaque-allow',
                name: '允许本次',
                kind: 'allow_once',
              },
              { optionId: 'opaque-deny', name: '拒绝', kind: 'reject_once' },
            ],
          },
          resolve,
          cancel,
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '拒绝' }));
    expect(resolve).toHaveBeenCalledWith({
      outcome: { outcome: 'selected', optionId: 'opaque-deny' },
    });
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消请求' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('answers Cursor questions using IDs without inventing or translating protocol values', async () => {
    const user = userEvent.setup(),
      resolve = vi.fn();
    render(
      <AgentInteractionCard
        interaction={{
          id: 'q',
          kind: 'question',
          params: {
            questions: [
              {
                id: 'q-1',
                prompt: '选择范围',
                options: [
                  { id: 'current', label: '当前文档' },
                  { id: 'workspace', label: '整个工作区' },
                ],
              },
            ],
          },
          resolve,
          cancel: vi.fn(),
        }}
      />,
    );
    await user.click(screen.getByLabelText('当前文档'));
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(resolve).toHaveBeenCalledWith({
      outcome: {
        outcome: 'answered',
        answers: [{ questionId: 'q-1', selectedOptionIds: ['current'] }],
      },
    });
  });
  it('does not approve a Cursor plan until the user explicitly chooses', async () => {
    const user = userEvent.setup(),
      resolve = vi.fn();
    render(
      <AgentInteractionCard
        interaction={{
          id: 'plan',
          kind: 'plan',
          params: { plan: 'Read then edit' },
          resolve,
          cancel: vi.fn(),
        }}
      />,
    );
    expect(resolve).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '批准计划' }));
    expect(resolve).toHaveBeenCalledWith({ outcome: { outcome: 'accepted' } });
  });
  it('fails closed for an unknown elicitation field type', () => {
    render(
      <AgentInteractionCard
        interaction={{
          id: 'form',
          kind: 'form',
          params: {
            requestedSchema: {
              properties: { secret: { type: 'future', title: 'Unknown' } },
            },
          },
          resolve: vi.fn(),
          cancel: vi.fn(),
        }}
      />,
    );
    expect(
      (screen.getByRole('button', { name: '提交' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
