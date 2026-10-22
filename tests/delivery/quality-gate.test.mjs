import { describe, expect, it } from 'vitest';
import { hasRussiaEvidence } from '../../scripts/quality-gate.mjs';

const report = (providerId) => ({ status: 'passed', providerId, corpusId: 'russia-independent-v1', measurement: 'live', sourceVersion: '0.3.0', sourceRevision: 'a'.repeat(40),
  startedAt: '2026-10-22T07:00:00.000Z', checkedAt: '2026-10-22T07:02:00.000Z',
  cases: 100, uniqueCases: 100, regions: 10, largestRegionShare: 0.1,
  attempted: 100, skipped: 0, correctAutomatic: 90, wrongAutomatic: 0, confirmedRate: 0.9, unresolved: 10, errors: 0, errorCounts: {} });
const passed = () => ({ schemaVersion: 2, reports: ['photon', 'geoapify', 'dadata'].map(report) });

describe('stable release evidence', () => {
  it('accepts a complete live result for every shipped provider', () => expect(hasRussiaEvidence(passed(), '0.3.0')).toBe(true));
  it('rejects legacy, single-source and duplicated-source results', () => {
    for (const value of [report('geoapify'), { schemaVersion: 2, reports: [report('geoapify')] },
      { schemaVersion: 2, reports: [report('photon'), report('photon'), report('dadata')] }]) expect(hasRussiaEvidence(value, '0.3.0')).toBe(false);
  });
  it('requires the measured version and one frozen implementation', () => {
    expect(hasRussiaEvidence(passed(), '0.3.1')).toBe(false);
    const value = passed(); value.reports[1].sourceRevision = 'b'.repeat(40);
    expect(hasRussiaEvidence(value, '0.3.0')).toBe(false);
  });
  it.each([{ uniqueCases: 99 }, { regions: 1 }, { largestRegionShare: 0.3 }, { largestRegionShare: NaN },
    { cases: '100' }, { confirmedRate: null }, { confirmedRate: 1.2 }, { errors: undefined },
    { wrongAutomatic: 1 }, { errors: 1 }, { correctAutomatic: 89 }, { unresolved: 11 }, { skipped: 1 }, { attempted: 99 },
    { measurement: 'offline' }, { corpusId: 'custom' }, { sourceRevision: '' }, { startedAt: 'invalid' }, { checkedAt: '2026-10-22T06:00:00.000Z' },
    { status: 'insufficient' }, { errorCounts: { quota: 1 } }])('rejects incomplete or inconsistent evidence %j', (change) => {
    const value = passed(); Object.assign(value.reports[0], change);
    expect(hasRussiaEvidence(value, '0.3.0')).toBe(false);
  });
  it.each([null, {}, { schemaVersion: 1, reports: [] }])('blocks missing evidence', (value) => expect(hasRussiaEvidence(value, '0.3.0')).toBe(false));
});
