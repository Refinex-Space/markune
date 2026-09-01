import { describe, expect, it } from 'vitest';

import { toUserAbsolutePath } from '../workspace-paths';

describe('toUserAbsolutePath', () => {
  it('strips the Windows extended-length drive prefix', () => {
    expect(toUserAbsolutePath(String.raw`\\?\D:\refinex-vault\README.md`)).toBe(
      String.raw`D:\refinex-vault\README.md`,
    );
    expect(
      toUserAbsolutePath(String.raw`\\?\D:\refinex-vault/.markune/assets/files`),
    ).toBe(String.raw`D:\refinex-vault/.markune/assets/files`);
  });

  it('converts the Windows extended-length UNC prefix', () => {
    expect(
      toUserAbsolutePath(String.raw`\\?\UNC\server\share\notes\README.md`),
    ).toBe(String.raw`\\server\share\notes\README.md`);
  });

  it('leaves ordinary and volume GUID paths unchanged', () => {
    expect(toUserAbsolutePath('/repo/README.md')).toBe('/repo/README.md');
    expect(toUserAbsolutePath(String.raw`D:\refinex-vault`)).toBe(
      String.raw`D:\refinex-vault`,
    );
    expect(
      toUserAbsolutePath(String.raw`\\?\Volume{abcd}\refinex-vault`),
    ).toBe(String.raw`\\?\Volume{abcd}\refinex-vault`);
  });
});
