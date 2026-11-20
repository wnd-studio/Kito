import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, checkLatestRelease } from '../desktop/update-check.mjs';

test('compare semantic release versions', () => {
  assert.equal(compareVersions('1.0.5', 'v1.0.6'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), -1);
  assert.equal(compareVersions('1.0.5', '1.0.6-beta'), null);
});

test('detect latest GitHub release and ignore pre-releases', async () => {
  const request = async () => ({ ok: true, json: async () => ({ tag_name: 'v1.0.6', draft: false, prerelease: false }) });
  const result = await checkLatestRelease('1.0.5', request);
  assert.equal(result.updateAvailable, true);
  assert.match(result.url, /github.com\/wnd-studio\/Kito\/releases\/latest/);
  assert.equal((await checkLatestRelease('1.0.6', request)).updateAvailable, false);
  const prerelease = await checkLatestRelease('1.0.5', async () => ({ok: true, json: async () => ({tag_name:'v1.0.6', prerelease:true})}));
  assert.equal(prerelease.updateAvailable, false);
});
