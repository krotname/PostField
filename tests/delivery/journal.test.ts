import { describe, expect, it } from 'vitest';
import { parseState } from '../../src/delivery/github-journal.js';
describe('public delivery journal validation', () => {
  it('accepts only a bounded release identity and known stages', () => {
    const state = { version: '0.1.0', sha: 'a'.repeat(40), digest: 'b'.repeat(64), stage: 'uploaded', uploadId: 'operation' };
    expect(parseState(JSON.stringify(state))).toEqual(state);
    expect(() => parseState(JSON.stringify({ ...state, stage: 'success' }))).toThrow('invalid_journal');
    expect(() => parseState(JSON.stringify({ ...state, uploadId: 'https://evil.example/?token=secret' }))).toThrow('invalid_journal');
    expect(() => parseState(JSON.stringify({ ...state, secret: 'private' }))).toThrow('invalid_journal');
  });
});
