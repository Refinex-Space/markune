import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const { invoke, create } = vi.hoisted(() => ({
  invoke: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('../workspace-api', () => ({
  createWorkspaceDocumentFromContent: create,
}));
import { AiArtifactViewer } from '../ai-artifact-viewer';
beforeEach(() => {
  invoke.mockReset();
  create.mockReset();
  invoke.mockResolvedValue({
    kind: 'text',
    name: 'report.html',
    size: 40,
    fingerprint: 'a'.repeat(64),
    text: '<script>alert(1)</script>',
    base64: null,
    mediaType: 'text/plain',
  });
});
it('renders HTML as inert text and retains the version mismatch warning', async () => {
  const { container } = render(
    <AiArtifactViewer
      root="/vault"
      reference={{
        kind: 'resource',
        relativePath: 'report.html',
        hash: null,
        fingerprint: 'b'.repeat(64),
      }}
      onClose={() => {}}
    />,
  );
  await screen.findByText('<script>alert(1)</script>');
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('来源已变化');
});
it('creates a source note only after an explicit click and preserves the artifact', async () => {
  const onCreated = vi.fn();
  const node = { absolutePath: '/vault/report 阅读笔记.md' };
  create.mockResolvedValue({ node });
  render(
    <AiArtifactViewer
      root="/vault"
      reference={{ kind: 'resource', relativePath: 'report.html', hash: null }}
      onClose={() => {}}
      onCreated={onCreated}
    />,
  );
  const button = await screen.findByRole('button', { name: '新建来源笔记' });
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(node));
  expect(create).toHaveBeenCalledWith(
    '/vault',
    '',
    'report 阅读笔记',
    expect.stringContaining('[原文](<report.html?v='),
  );
  expect(invoke).toHaveBeenCalledTimes(1);
});
