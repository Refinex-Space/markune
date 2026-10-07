import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProfile } from '../agent-api';
const harness = vi.hoisted(() => ({
  listener: null as null | ((event: { payload: unknown }) => void),
  sent: [] as Record<string, unknown>[],
  calls: [] as { command: string; args: Record<string, unknown> }[],
  serial: 0,
  stall: false,
  blockConnect: false,
  releaseConnect: null as null | (() => void),
  promptResolve: null as null | (() => void),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name, listener) => {
    harness.listener = listener;
    return () => {};
  }),
}));
vi.mock('../agent-api', async () => {
  const original =
    await vi.importActual<typeof import('../agent-api')>('../agent-api');
  return {
    ...original,
    agentInvoke: vi.fn(
      async (command: string, args: Record<string, unknown> = {}) => {
        harness.calls.push({ command, args });
        if (command === 'agent_connect' && harness.blockConnect)
          await new Promise<void>((resolve) => {
            harness.releaseConnect = resolve;
          });
        if (command === 'agent_connect')
          return {
            connectionId: `connection-${++harness.serial}`,
            rootPath: '/workspace',
            profile: {},
            mcpServers: [],
          };
        if (command === 'agent_context') return { activeDocument: null };
        if (command === 'agent_send') {
          const message = args.message as Record<string, unknown>;
          harness.sent.push(message);
          const answer = (result: unknown) =>
            queueMicrotask(() =>
              harness.listener?.({
                payload: {
                  connectionId: args.connectionId,
                  kind: 'message',
                  message: { jsonrpc: '2.0', id: message.id, result },
                },
              }),
            );
          if (message.method === 'initialize' && !harness.stall)
            answer({
              protocolVersion: 1,
              agentCapabilities: { loadSession: true },
              authMethods: [],
            });
          if (message.method === 'session/new')
            answer({
              sessionId: 'own-session',
              configOptions: [
                {
                  id: 'model',
                  type: 'select',
                  name: 'Model',
                  currentValue: 'dynamic',
                  options: [{ value: 'dynamic', name: 'Agent supplied' }],
                },
              ],
            });
          if (message.method === 'session/load') answer({});
          if (message.method === 'session/prompt')
            harness.promptResolve = () => answer({ stopReason: 'end_turn' });
          if (message.method === 'session/cancel') harness.promptResolve?.();
        }
        return {};
      },
    ),
  };
});
import { AgentRuntime } from '../agent-runtime';
const profile: AgentProfile = {
  id: 'test-profile',
  agentId: 'test',
  name: 'Test agent',
  executable: '/bin/fake',
  args: [],
  env: {},
  secretKeys: [],
  version: '1',
  managedPath: null,
  mcpEnabled: true,
  enabled: true,
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
beforeEach(() => {
  harness.calls.length = 0;
  harness.sent.length = 0;
  harness.stall = false;
  harness.blockConnect = false;
  harness.releaseConnect = null;
  harness.promptResolve = null;
});
describe('ACP runtime', () => {
  it('negotiates ACP, creates an owned session and takes controls from the agent', async () => {
    const runtime = new AgentRuntime(profile, '/workspace');
    await runtime.connect();
    expect(runtime.getSnapshot().phase).toBe('ready');
    expect(runtime.getSnapshot().record.providerSessionId).toBe('own-session');
    expect(runtime.getSnapshot().configOptions[0].currentValue).toBe('dynamic');
    expect(
      harness.sent.some((message) => message.method === 'session/list'),
    ).toBe(false);
    await runtime.disconnect();
  });
  it('keeps prompt, approvals and cancellation on the same connection without replay', async () => {
    const runtime = new AgentRuntime(profile, '/workspace');
    await runtime.connect();
    const prompt = runtime.prompt('work', [], { documents: [], drawings: [] });
    await flush();
    const connectionId = harness.calls.find(
      (call) => call.command === 'agent_send',
    )!.args.connectionId;
    harness.listener?.({
      payload: {
        connectionId,
        kind: 'message',
        message: {
          jsonrpc: '2.0',
          id: 'approval',
          method: 'session/request_permission',
          params: {
            sessionId: 'own-session',
            toolCall: { toolCallId: 'tool', title: 'Edit document' },
            options: [
              { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
            ],
          },
        },
      },
    });
    await flush();
    expect(runtime.getSnapshot().interactions).toHaveLength(1);
    runtime.getSnapshot().interactions[0].resolve({
      outcome: { outcome: 'selected', optionId: 'once' },
    });
    await flush();
    expect(
      harness.sent.find((message) => message.id === 'approval'),
    ).toMatchObject({ result: { outcome: { optionId: 'once' } } });
    await runtime.cancel();
    await prompt;
    expect(
      harness.sent.filter((message) => message.method === 'session/prompt'),
    ).toHaveLength(1);
    expect(runtime.getSnapshot().interactions).toHaveLength(0);
    await runtime.disconnect();
  });
  it('flushes owned history before disconnect and restores only its recorded session', async () => {
    const runtime = new AgentRuntime(profile, '/workspace');
    await runtime.connect();
    const prompt = runtime.prompt('saved', [], { documents: [], drawings: [] });
    await flush();
    harness.promptResolve?.();
    await prompt;
    await runtime.disconnect();
    const saved = harness.calls
      .filter((call) => call.command === 'agent_save_session')
      .at(-1)!.args.record;
    expect(saved).toMatchObject({
      profileId: profile.id,
      providerSessionId: 'own-session',
    });
    const restored = new AgentRuntime(
      profile,
      '/workspace',
      runtime.getSnapshot().record,
    );
    await restored.connect();
    expect(
      harness.sent.find((message) => message.method === 'session/load'),
    ).toMatchObject({ params: { sessionId: 'own-session' } });
    await restored.disconnect();
  });
  it('fails closed if an editor write cannot be flushed', async () => {
    const runtime = new AgentRuntime(profile, '/workspace');
    await runtime.connect();
    runtime.callbacks.beforeWrite = async () => false;
    const connectionId = harness.calls.find(
      (call) => call.command === 'agent_send',
    )!.args.connectionId;
    harness.listener?.({
      payload: {
        connectionId,
        kind: 'message',
        message: {
          jsonrpc: '2.0',
          id: 'write',
          method: 'fs/write_text_file',
          params: {
            sessionId: 'own-session',
            path: '/workspace/note.md',
            content: 'new',
          },
        },
      },
    });
    await flush();
    expect(
      harness.calls.some((call) => call.command === 'agent_client_operation'),
    ).toBe(false);
    expect(
      harness.sent.find((message) => message.id === 'write'),
    ).toHaveProperty('error');
    await runtime.disconnect();
  });
  it('disconnects a stalled initialization with a hard deadline', async () => {
    vi.useFakeTimers();
    harness.stall = true;
    const runtime = new AgentRuntime(profile, '/workspace');
    const result = runtime.connect().catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(20_100);
    expect(await result).toContain('超时');
    expect(runtime.getSnapshot().phase).toBe('error');
    expect(
      harness.calls.some((call) => call.command === 'agent_disconnect'),
    ).toBe(true);
    vi.useRealTimers();
  });
  it('persists partial output during an uninterrupted stream', async () => {
    const runtime = new AgentRuntime(profile, '/workspace');
    await runtime.connect();
    vi.useFakeTimers();
    const pending = runtime.prompt('long task', [], {
      documents: [],
      drawings: [],
    });
    await vi.advanceTimersByTimeAsync(1);
    const connectionId = harness.calls.find(
      (call) => call.command === 'agent_send',
    )!.args.connectionId;
    for (let index = 0; index < 6; index++) {
      harness.listener?.({
        payload: {
          connectionId,
          kind: 'message',
          message: {
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'own-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'partial ' },
              },
            },
          },
        },
      });
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(runtime.getSnapshot().phase).toBe('running');
    expect(
      harness.calls
        .filter((call) => call.command === 'agent_save_session')
        .some((call) => JSON.stringify(call.args.record).includes('partial')),
    ).toBe(true);
    harness.promptResolve?.();
    await pending;
    await runtime.disconnect();
    vi.useRealTimers();
  });
  it('closes a late native process after the user switches away during startup', async () => {
    harness.blockConnect = true;
    const runtime = new AgentRuntime(profile, '/workspace');
    const opening = runtime.connect().catch((error: Error) => error.message);
    await flush();
    await runtime.disconnect();
    harness.releaseConnect?.();
    expect(await opening).toBe('连接已取消');
    expect(
      harness.calls.some((call) => call.command === 'agent_disconnect'),
    ).toBe(true);
    expect(
      harness.sent.some((message) => message.method === 'initialize'),
    ).toBe(false);
  });
});
