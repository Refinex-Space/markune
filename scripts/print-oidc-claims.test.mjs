import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeOidcClaims,
  validateOidcClaims,
} from './print-oidc-claims.mjs';

function tokenFor(claims) {
  return [
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature-not-inspected-here',
  ].join('.');
}

test('OIDC diagnostics expose only the validated issuer, audience, and subject', () => {
  const claims = decodeOidcClaims(
    tokenFor({
      aud: 'sts.aliyuncs.com',
      exp: 123,
      iss: 'https://token.actions.githubusercontent.com',
      repository: 'Refinex-Space/madora',
      sub: 'repo:Refinex-Space/madora:environment:production-release',
    }),
  );

  assert.deepEqual(validateOidcClaims(claims), {
    aud: 'sts.aliyuncs.com',
    iss: 'https://token.actions.githubusercontent.com',
    sub: 'repo:Refinex-Space/madora:environment:production-release',
  });
});

test('OIDC diagnostics reject a branch subject or wrong audience', () => {
  assert.throws(
    () =>
      validateOidcClaims({
        aud: 'sts.aliyuncs.com',
        iss: 'https://token.actions.githubusercontent.com',
        sub: 'repo:Refinex-Space/madora:ref:refs/heads/dev',
      }),
    /Unexpected OIDC sub/,
  );
  assert.throws(
    () =>
      validateOidcClaims({
        aud: 'github-actions',
        iss: 'https://token.actions.githubusercontent.com',
        sub: 'repo:Refinex-Space/madora:environment:production-release',
      }),
    /Unexpected OIDC aud/,
  );
});
