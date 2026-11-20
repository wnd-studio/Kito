const RELEASES_API = 'https://api.github.com/repos/wnd-studio/Kito/releases/latest';
const RELEASES_URL = 'https://github.com/wnd-studio/Kito/releases/latest';

export function compareVersions(current, candidate) {
  const parse = version => {
    const match = String(version).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
    return match ? match.slice(1).map(Number) : null;
  };
  const installed = parse(current);
  const latest = parse(candidate);
  if (!installed || !latest) return null;
  for (let part = 0; part < 3; part++) {
    if (latest[part] !== installed[part]) return Math.sign(latest[part] - installed[part]);
  }
  return 0;
}

export async function checkLatestRelease(currentVersion, request = fetch) {
  const response = await request(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Kito-Desktop' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error(`GitHub respondeu com HTTP ${response.status}.`);
  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  const newer = !release.draft && !release.prerelease && compareVersions(currentVersion, version) === 1;
  return { currentVersion, latestVersion: version, updateAvailable: newer, url: newer ? RELEASES_URL : '' };
}
