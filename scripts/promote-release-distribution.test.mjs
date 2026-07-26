import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeUpdaterSignature } from './promote-release-distribution.mjs';

const minisignSignature = [
  'untrusted comment: signature from tauri secret key',
  'RWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'trusted comment: timestamp:1785040632\tfile:Madora.app.tar.gz',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  '',
].join('\n');

test('decodes Tauri Base64 signature before Minisign verification', () => {
  const encoded = Buffer.from(minisignSignature, 'utf8').toString('base64');

  assert.equal(decodeUpdaterSignature(`\n${encoded}\n`), minisignSignature);
});

test('rejects malformed or non-Minisign updater signatures', () => {
  assert.throws(
    () => decodeUpdaterSignature('not-base64'),
    /canonical Base64/,
  );
  assert.throws(
    () =>
      decodeUpdaterSignature(
        Buffer.from('not a Minisign signature', 'utf8').toString('base64'),
      ),
    /Minisign signature file/,
  );
});
