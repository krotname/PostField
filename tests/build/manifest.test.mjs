import { describe, expect, it } from 'vitest';
import { manifestFor } from '../../scripts/manifest.mjs';

describe('browser packaging', () => {
  it('supports Android without changing the existing Firefox identity', () => {
    const manifest = manifestFor('firefox', '0.5.0');
    expect(manifest.browser_specific_settings.gecko.id).toBe('postfield@krot.name');
    expect(manifest.browser_specific_settings.gecko_android).toEqual({ strict_min_version: '142.0' });
    expect(manifest.background.service_worker).toBeUndefined();
  });
  it.each(['chrome', 'opera', 'edge', 'firefox'])('declares the packaged store language for %s', (browser) => {
    const manifest = manifestFor(browser, '0.4.1');
    expect(manifest.default_locale).toBe('ru');
    expect(manifest.name).toBe('__MSG_extensionName__');
    expect(manifest.description).toBe('__MSG_extensionDescription__');
  });
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
