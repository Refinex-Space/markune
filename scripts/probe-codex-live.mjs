import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
if (process.env.MARKUNE_RUN_MODEL_EVAL !== '1')
  throw new Error('Real-model probe requires explicit opt-in');
const require = createRequire(import.meta.url),
  req = createRequire(require.resolve('@openai/codex/package.json'));
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64',
  triple =
    process.platform === 'darwin'
      ? `${arch}-apple-darwin`
      : process.platform === 'win32'
        ? `${arch}-pc-windows-msvc`
        : `${arch}-unknown-linux-musl`;
const binary = req.resolve(
  `@openai/codex-${process.platform}-${process.arch}/vendor/${triple}/bin/codex${process.platform === 'win32' ? '.exe' : ''}`,
);
const workspace = mkdtempSync(join(tmpdir(), 'markune-live-'));
const home = process.env.CODEX_HOME ?? join(homedir(), '.codex');
const child = spawn(
  binary,
  [
    'app-server',
    '--listen',
    'stdio://',
    '-c',
    `sqlite_home=${JSON.stringify(home)}`,
  ],
  { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] },
);
child.stderr.on('data', () => {});
let seq = 0,
  buffer = '',
  threadId;
const pending = new Map(),
  events = [];
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  if (buffer.length > 32 * 1024 * 1024) {
    child.kill();
    return;
  }
  let at;
  while ((at = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, at);
    buffer = buffer.slice(at + 1);
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.method) {
      events.push(message);
      if (events.length > 256) events.shift();
      continue;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error)
        waiter.reject(
          new Error(
            `${waiter.method} failed (${message.error.code}): ${String(
              message.error.message,
            )
              .replace(/https?:[^\s]+|(?:\/[^\s]+)+/g, '<path>')
              .slice(0, 200)}`,
          ),
        );
      else waiter.resolve(message.result);
    }
  }
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 30000);
    pending.set(id, { method, timer, resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
try {
  await request('initialize', {
    clientInfo: { name: 'markune', title: 'Markune AI', version: '0.1.0' },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(
    JSON.stringify({ method: 'initialized', params: {} }) + '\n',
  );
  const servers = Object.create(null);
  let cursor;
  for (let i = 0; i < 10; i++) {
    const response = await request('mcpServerStatus/list', {
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const server of response.data)
      if (server.name !== 'codex_apps' && !server.pluginId)
        servers[server.name] = { enabled: false };
    cursor = response.nextCursor;
    if (!cursor) break;
  }
  assert(!cursor);
  const config = { mcp_servers: servers, web_search: 'disabled' };
  for (const feature of [
    'shell_tool',
    'apps',
    'plugins',
    'multi_agent',
    'hooks',
    'codex_hooks',
  ])
    config[`features.${feature}`] = false;
  const started = await request('thread/start', {
    cwd: workspace,
    ephemeral: true,
    permissions: ':read-only',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    runtimeWorkspaceRoots: [workspace],
    config,
  });
  threadId = started.thread.id;
  const turn = await request('turn/start', {
    threadId,
    effort: 'medium',
    input: [
      {
        type: 'text',
        text: '这是合成集成测试。不要调用任何工具。只返回 MARKUNE_APP_SERVER_OK，不要解释。',
        text_elements: [],
      },
    ],
  });
  for (
    let i = 0;
    i < 1500 &&
    !events.some(
      (event) =>
        event.method === 'turn/completed' &&
        event.params?.threadId === threadId,
    );
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  const done = events.find(
    (event) =>
      event.method === 'turn/completed' && event.params?.threadId === threadId,
  );
  assert.equal(
    done?.params?.turn?.status,
    'completed',
    'live turn did not complete',
  );
  const outputs = events
    .filter(
      (event) =>
        event.method === 'item/completed' &&
        event.params?.item?.type === 'agentMessage',
    )
    .map((event) => event.params.item);
  assert(
    outputs.some((item) => item.text?.trim() === 'MARKUNE_APP_SERVER_OK'),
    'authoritative completed output missing',
  );
  const tools = events.filter(
    (event) =>
      event.method === 'item/started' &&
      [
        'commandExecution',
        'fileChange',
        'mcpToolCall',
        'dynamicToolCall',
      ].includes(event.params?.item?.type),
  );
  assert.equal(tools.length, 0);
  process.stdout.write(
    JSON.stringify({
      status: 'passed',
      transport: 'app-server',
      client: 'markune',
      model: started.model,
      phase: outputs.at(-1)?.phase ?? null,
      authoritativeOutput: 'matched',
      toolCalls: 0,
      ephemeral: true,
      turnIdObserved: Boolean(turn.turn.id),
    }) + '\n',
  );
} finally {
  if (threadId) await request('thread/delete', { threadId }).catch(() => {});
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('probe stopped'));
  }
  pending.clear();
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  rmSync(workspace, { recursive: true, force: true });
}
