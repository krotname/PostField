import { describe, expect, it } from 'vitest';
import { manifestFor } from '../../scripts/manifest.mjs';

describe('browser packaging', () => {
  it.each(['chrome', 'opera', 'edge'])('uses a worker and no product key for %s', (browser) => {
    const manifest = manifestFor(browser, '0.1.0');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.key).toBeUndefined();
    expect(manifest.update_url).toBeUndefined();
    expect(manifest.host_permissions).toEqual(['https://*/*', 'http://*/*']);
    expect(manifest.content_scripts).toBeUndefined();
  });
  it('declares real address/key transmission and a new Firefox ID', () => {
    const manifest = manifestFor('firefox', '0.1.0');
    expect(manifest.background).toEqual({ scripts: ['background.js'] });
    expect(manifest.browser_specific_settings.gecko.id).toBe('postfield@krot.name');
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toEqual(['personallyIdentifyingInfo', 'authenticationInfo']);
  });
  it('rejects unknown build targets', () => { expect(() => manifestFor('other', '0.1.0')).toThrow(); });
});
