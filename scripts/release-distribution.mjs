export const DISTRIBUTION_OWNER = 'Refinex-Space';
export const DISTRIBUTION_REPO = 'markune';

export const RELEASE_ARTIFACT_NAMES = Object.freeze([
  'Markune_aarch64.dmg',
  'Markune_aarch64.app.tar.gz',
  'Markune_aarch64.app.tar.gz.sig',
  'Markune_x64.dmg',
  'Markune_x64.app.tar.gz',
  'Markune_x64.app.tar.gz.sig',
  'Markune_x64-setup.exe',
  'Markune_x64-setup.exe.sig',
]);

export const BUILD_RELEASE_ASSET_NAMES = Object.freeze([
  ...RELEASE_ARTIFACT_NAMES,
  'latest.json',
]);

export const UPDATER_TARGETS = Object.freeze({
  'darwin-aarch64': {
    assetName: 'Markune_aarch64.app.tar.gz',
    signatureName: 'Markune_aarch64.app.tar.gz.sig',
  },
  'darwin-aarch64-app': {
    assetName: 'Markune_aarch64.app.tar.gz',
    signatureName: 'Markune_aarch64.app.tar.gz.sig',
  },
  'darwin-x86_64': {
    assetName: 'Markune_x64.app.tar.gz',
    signatureName: 'Markune_x64.app.tar.gz.sig',
  },
  'darwin-x86_64-app': {
    assetName: 'Markune_x64.app.tar.gz',
    signatureName: 'Markune_x64.app.tar.gz.sig',
  },
  'windows-x86_64': {
    assetName: 'Markune_x64-setup.exe',
    signatureName: 'Markune_x64-setup.exe.sig',
  },
  'windows-x86_64-nsis': {
    assetName: 'Markune_x64-setup.exe',
    signatureName: 'Markune_x64-setup.exe.sig',
  },
});
