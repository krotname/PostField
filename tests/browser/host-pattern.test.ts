import { describe, expect, it } from 'vitest';
import { hostPattern } from '../../src/browser/host-pattern.js';
describe('portable host permissions', () => {
  it('permits a non-default-port origin using a Firefox-compatible pattern', () => {
    expect(hostPattern('https://example.test:8443')).toBe('https://example.test/*');
    expect(hostPattern('http://localhost:4173')).toBe('http://localhost/*');
  });
  it('preserves scheme and hostname and refuses a path or non-web origin', () => {
    expect(hostPattern('https://example.test')).toBe('https://example.test/*');
    expect(() => hostPattern('https://example.test/path')).toThrow();
    expect(() => hostPattern('file:///tmp')).toThrow();
  });
});
