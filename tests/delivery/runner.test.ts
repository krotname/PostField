import { describe, expect, it, vi } from 'vitest';
import { deliver } from '../../src/delivery/runner.js';
import type { DeliveryState, StorePort } from '../../src/delivery/ports.js';

const release = { version: '0.1.0', sha: 'a'.repeat(40), digest: 'b'.repeat(64) };
function setup(initial: DeliveryState | null = null) {
  let state = initial;
  const journal = { read: async () => state, write: vi.fn(async (value: DeliveryState) => { state = value; }) };
  const store: StorePort = { ready: () => true, upload: vi.fn(async () => ({ uploadId: 'up' })),
    uploadStatus: vi.fn(async () => 'ready' as const), submit: vi.fn(async () => ({ submissionId: 'sub' })),
    status: vi.fn(async () => 'pending_review' as const) };
  return { store, journal };
}
describe('durable delivery', () => {
  it('does not report moderation acceptance as publication', async () => {
    const { store, journal } = setup();
    expect((await deliver(release, store, journal)).stage).toBe('pending_review');
    expect(store.upload).toHaveBeenCalledOnce();
    expect(journal.write.mock.calls[0]?.[0].stage).toBe('uploading');
    expect(store.submit).toHaveBeenCalledOnce();
  });
  it('does not repeat a mutation after a lost upload response', async () => {
    const { store, journal } = setup();
    vi.mocked(store.upload).mockRejectedValueOnce(new Error('private server body'));
    expect((await deliver(release, store, journal)).stage).toBe('needs_readback');
    expect((await deliver(release, store, journal)).stage).toBe('needs_readback');
    expect(store.upload).toHaveBeenCalledOnce();
    expect(JSON.stringify(journal.write.mock.calls)).not.toContain('private server body');
  });
  it('resumes from a persisted upload operation and only reads existing submission', async () => {
    const { store, journal } = setup({ ...release, stage: 'uploaded', uploadId: 'up' });
    await deliver(release, store, journal);
    await deliver(release, store, journal);
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.submit).toHaveBeenCalledOnce();
  });
  it('refuses changed bytes and missing store setup', async () => {
    const { store, journal } = setup({ ...release, digest: 'c'.repeat(64), stage: 'uploaded', uploadId: 'up' });
    await expect(deliver(release, store, journal)).rejects.toThrow('release_identity_mismatch');
    const fresh = setup(); fresh.store.ready = () => false;
    expect((await deliver(release, fresh.store, fresh.journal)).stage).toBe('requires_setup');
    expect(fresh.store.upload).not.toHaveBeenCalled();
  });
  it('status-only polling cannot create a new submission', async () => {
    const { store, journal } = setup();
    expect((await deliver(release, store, journal, true)).stage).toBe('not_started');
    expect(store.upload).not.toHaveBeenCalled();
  });
});
