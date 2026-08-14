import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILD_RELEASE_ASSET_NAMES,
  DISTRIBUTION_OWNER,
  DISTRIBUTION_REPO,
  RELEASE_ARTIFACT_NAMES,
  UPDATER_TARGETS,
} from './release-distribution.mjs';

test('release distribution points to the Markune source repository', () => {
  assert.equal(DISTRIBUTION_OWNER, 'Refinex-Space');
  assert.equal(DISTRIBUTION_REPO, 'markune');
});

test('release asset contract contains installers, updater archives and latest.json', () => {
  assert.deepEqual(BUILD_RELEASE_ASSET_NAMES, [
    ...RELEASE_ARTIFACT_NAMES,
    'latest.json',
  ]);
  assert.equal(BUILD_RELEASE_ASSET_NAMES.length, 9);
  assert.equal(Object.keys(UPDATER_TARGETS).length, 6);
  assert.equal(
    UPDATER_TARGETS['windows-x86_64'].assetName,
    'Markune_x64-setup.exe',
  );
});
