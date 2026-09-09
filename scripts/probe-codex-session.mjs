import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const codexRequire = createRequire(
  require.resolve('@openai/codex/package.json'),
);
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const triple =
  process.platform === 'darwin'
    ? `${arch}-apple-darwin`
    : process.platform === 'win32'
      ? `${arch}-pc-windows-msvc`
      : `${arch}-unknown-linux-musl`;
const binary = codexRequire.resolve(
  `@openai/codex-${process.platform}-${process.arch}/vendor/${triple}/bin/codex${process.platform === 'win32' ? '.exe' : ''}`,
);
const root = mkdtempSync(join(tmpdir(), 'markune-codex-probe-'));
const marker = join(root, 'mcp-started');
const mcp = join(root, 'mcp.mjs');
writeFileSync(
  mcp,
  `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'started');setInterval(()=>{},1000);`,
);
writeFileSync(
  join(root, 'config.toml'),
  `[mcp_servers.test]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(mcp)}]\n`,
);
const child = spawn(binary, ['app-server', '--listen', 'stdio://'], {
  cwd: root,
  env: {
    ...process.env,
    CODEX_HOME: root,
    CODEX_SQLITE_HOME: root,
    OPENAI_API_KEY: '',
    MARKUNE_CODEX_PROVIDER_API_KEY: '',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', () => {});
let seq = 0,
  buffer = '';
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  assert(buffer.length < 32 * 1024 * 1024);
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
    const waiter = pending.get(message.id);
    if (waiter && !message.method) {
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error)
        waiter.reject(
          new Error(`RPC ${waiter.method} failed (${message.error.code})`),
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
      reject(new Error(`RPC ${method} timed out`));
    }, 15000);
    pending.set(id, { method, timer, resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
try {
  await request('initialize', {
    clientInfo: { name: 'markune-contract-probe', version: '1' },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write(
    JSON.stringify({ method: 'initialized', params: {} }) + '\n',
  );
  await request('skills/extraRoots/set', { extraRoots: ['markune-diagram', 'markune-mindmap'].map(name => fileURLToPath(new URL('../src-tauri/resources/skills/' + name, import.meta.url))) });
  const skills = await request('skills/list', { cwds: [root], forceReload: true });
  const names = skills.data.flatMap(entry => entry.skills ?? []).map(skill => skill.name);
  assert(names.includes('markune-diagram'));
  assert(names.includes('markune-mindmap'));
  assert(!names.includes('markune-writing'));
  assert(!names.includes('markune-research'));
  const config = {
    'features.plugins': false,
    'features.apps': false,
    'features.multi_agent': false,
    'features.hooks': false,
    'features.codex_hooks': false,
    mcp_servers: { test: { enabled: false } },
    web_search: 'disabled',
  };
  const response = await request('thread/start', {
    cwd: root,
    ephemeral: true,
    permissions: ':read-only',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    runtimeWorkspaceRoots: [root],
    config,
  });
  assert.equal(response.approvalPolicy, 'never');
  assert.equal(response.activePermissionProfile.id, ':read-only');
  assert(response.thread.id);
  const read = await request('thread/read', {
    threadId: response.thread.id,
    includeTurns: false,
  });
  assert.equal(read.thread.id, response.thread.id);
  assert.equal(
    existsSync(marker),
    false,
    'Writing mode must disable configured MCP process startup',
  );
  await request('thread/unsubscribe', { threadId: response.thread.id });
  process.stdout.write(
    JSON.stringify({
      runtime: JSON.parse(
        readFileSync(
          new URL('../contracts/codex/manifest.json', import.meta.url),
          'utf8',
        ),
      ).version,
      handshake: 'passed',
      builtInSkillRoots: 'passed',
      readOnlyProfile: 'passed',
      mcpDisabled: 'passed',
      historyRead: 'passed',
      modelCalls: 0,
    }) + '\n',
  );
} finally {
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
  rmSync(root, { recursive: true, force: true });
}
