import { describe, expect, it } from 'vitest';
import { hasRussiaEvidence } from '../../scripts/quality-gate.mjs';

describe('stable release evidence', () => {
  const passed = { status: 'passed', cases: 100, uniqueCases: 100, regions: 10, largestRegionShare: 0.1, wrongAutomatic: 0, confirmedRate: 0.9, errors: 0 };
  it('accepts a complete passing result', () => expect(hasRussiaEvidence(passed)).toBe(true));
  it.each([{ ...passed, uniqueCases: 99 }, { ...passed, regions: 1 }, { ...passed, largestRegionShare: 0.3 }, { ...passed, regions: undefined }, { ...passed, largestRegionShare: NaN }])('requires independent regional coverage', (value) => expect(hasRussiaEvidence(value)).toBe(false));
  it.each([null, {}, { ...passed, status: 'not_run' }, { ...passed, cases: 3 }, { ...passed, wrongAutomatic: 1 }, { ...passed, confirmedRate: 0.89 }, { ...passed, errors: 1 }])('blocks missing, insufficient or inaccurate evidence', (value) => expect(hasRussiaEvidence(value)).toBe(false));
  it.each([{ ...passed, cases: '100' }, { ...passed, cases: Infinity }, { ...passed, confirmedRate: null }, { ...passed, confirmedRate: 1.2 }, { ...passed, errors: undefined }])('blocks malformed fields rather than relying on coercion', (value) => expect(hasRussiaEvidence(value)).toBe(false));
});
