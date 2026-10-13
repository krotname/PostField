import { describe, expect, it } from 'vitest';
import { boundaryViolations } from '../../scripts/boundary-rules.mjs';

describe('SOLID dependency boundaries', () => {
  it('resolves traversal before deciding which layer an import belongs to', () => {
    expect(boundaryViolations('core/model.ts', "import { request } from './../adapters/http.js';")).toContain('outward import ./../adapters/http.js');
  });
  it('checks re-exports and type-only imports', () => {
    expect(boundaryViolations('application/index.ts', "export * from '../browser/content.js'; type T = import('../delivery/ports.js').StorePort;")).toHaveLength(2);
  });
  it('checks dynamic imports and refuses unresolved dependencies in protected layers', () => {
    expect(boundaryViolations('core/model.ts', "import('../adapters/http.js'); import(variable); require('node:fs');")).toHaveLength(3);
  });
  it('allows core and application dependencies after normalization', () => {
    expect(boundaryViolations('application/lookup.ts', "import type { Address } from '../core/address.js'; export * from './ports.js';")).toEqual([]);
    expect(boundaryViolations('core/sub/model.ts', "import { normalize } from '../address-policy.js';")).toEqual([]);
  });
  it('rejects platform dependencies and explicit any', () => {
    expect(boundaryViolations('core/model.ts', 'const value: any = fetch(url);')).toEqual(['explicit any', 'platform dependency fetch']);
  });
});
