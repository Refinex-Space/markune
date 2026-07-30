import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'sts.aliyuncs.com';
const EXPECTED_SUBJECT =
  'repo:Refinex-Space/madora:environment:production-release';
const scriptPath = fileURLToPath(import.meta.url);

export function decodeOidcClaims(token) {
  const segments = String(token ?? '').split('.');
  if (segments.length !== 3) throw new Error('GitHub OIDC token is malformed');
  try {
    return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('GitHub OIDC claims are not valid JSON');
  }
}

export function validateOidcClaims(claims) {
  if (claims?.iss !== EXPECTED_ISSUER) {
    throw new Error(`Unexpected OIDC iss: ${String(claims?.iss)}`);
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(EXPECTED_AUDIENCE)) {
    throw new Error(`Unexpected OIDC aud: ${audiences.join(',')}`);
  }
  if (claims.sub !== EXPECTED_SUBJECT) {
    throw new Error(`Unexpected OIDC sub: ${String(claims.sub)}`);
  }
  return {
    iss: claims.iss,
    aud: claims.aud,
    sub: claims.sub,
  };
}

export async function printOidcClaims({ env = process.env, request = fetch } = {}) {
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error('GitHub OIDC request environment is unavailable');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', EXPECTED_AUDIENCE);
  const response = await request(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub OIDC request returned HTTP ${response.status}`);
  const payload = await response.json();
  const safeClaims = validateOidcClaims(decodeOidcClaims(payload.value));
  process.stdout.write(`${JSON.stringify(safeClaims)}\n`);
  return safeClaims;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  printOidcClaims().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
