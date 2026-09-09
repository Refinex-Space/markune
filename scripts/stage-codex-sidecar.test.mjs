import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { stageCodexSidecars, resolveTarget } from './stage-codex-sidecar.mjs';

test(
  'stages the full pair, repairs a corrupt host and runs a tool round trip from the bundled layout',
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markune-codex-bundle-'));
    const target = resolveTarget();
    let child;
    try {
      const staged = await stageCodexSidecars({
        destinationDir: directory,
        target,
      });
      assert.deepEqual(
        staged.map((item) => item.name),
        ['codex', 'codex-code-mode-host'],
      );
      const host = staged.find((item) => item.name === 'codex-code-mode-host');
      await writeFile(host.destination, 'broken');
      const repaired = await stageCodexSidecars({
        destinationDir: directory,
        target,
      });
      assert.equal(
        repaired.find((item) => item.name === 'codex-code-mode-host').copied,
        true,
      );
      assert.equal(
        repaired.find((item) => item.name === 'codex').copied,
        false,
      );
      const bundle = join(directory, 'bundle');
      await mkdir(bundle);
      for (const item of staged)
        await copyFile(
          item.destination,
          join(bundle, item.name + target.extension),
        );
      const file = join(bundle, 'note.md');
      const content = '# 合成文档\n\n工具读取校验成功。';
      await writeFile(file, content);
      child = spawn(
        join(bundle, 'codex-code-mode-host' + target.extension),
        ['--listen', 'stdio://'],
        {
          cwd: bundle,
          stdio: ['pipe', 'pipe', 'ignore'],
        },
      );
      const iterator = frames(child.stdout)[Symbol.asyncIterator]();
      async function receive() {
        let timer;
        try {
          const frame = await Promise.race([
            iterator.next(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Code-mode host timeout')),
                10000,
              );
            }),
          ]);
          assert.equal(frame.done, false, 'Code-mode host closed early');
          return frame.value;
        } finally {
          clearTimeout(timer);
        }
      }
      const send = (message) => {
        const payload = Buffer.from(JSON.stringify(message));
        const length = Buffer.alloc(4);
        length.writeUInt32LE(payload.length);
        child.stdin.write(Buffer.concat([length, payload]));
      };
      send({
        type: 'connection/hello',
        supportedVersions: [1],
        requiredCapabilities: [],
        optionalCapabilities: [],
      });
      assert.equal((await receive()).type, 'connection/ready');
      send({
        type: 'operation/request',
        id: 1,
        request: { method: 'session/open', sessionId: 'bundle-test' },
      });
      assert.equal((await receive()).result.value.type, 'session/ready');
      send({
        type: 'operation/request',
        id: 2,
        request: {
          method: 'session/execute',
          sessionId: 'bundle-test',
          request: {
            tool_call_id: 'read-test',
            source: 'text(await tools.read_document({}));',
            enabled_tools: [
              {
                name: 'read_document',
                tool_name: { name: 'read_document', namespace: null },
                description: 'Read the synthetic test document',
                kind: 'function',
                input_schema: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
                output_schema: null,
              },
            ],
            yield_time_ms: 1000,
            max_output_tokens: 1000,
          },
        },
      });
      let invoked = false;
      while (true) {
        const response = await receive();
        if (response.type === 'delegate/request') {
          assert.equal(response.request.type, 'tool/invoke');
          invoked = true;
          send({
            type: 'delegate/response',
            id: response.id,
            result: {
              status: 'ok',
              value: {
                type: 'tool/result',
                result: await readFile(file, 'utf8'),
              },
            },
          });
        }
        if (response.type === 'execute/initialResponse') {
          assert.equal(response.result.status, 'ok');
          assert.equal(response.result.value.Result.error_text, null);
          assert.ok(
            JSON.stringify(response.result.value).includes('工具读取校验成功'),
          );
          break;
        }
      }
      assert.equal(invoked, true);
    } finally {
      if (child && child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);

async function* frames(stream) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE();
      assert.ok(length <= 1024 * 1024, 'Unexpected host frame size');
      if (buffer.length < length + 4) break;
      const value = JSON.parse(buffer.subarray(4, length + 4).toString());
      buffer = buffer.subarray(length + 4);
      yield value;
    }
  }
}
