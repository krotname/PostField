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
  it.each(['uploaded', 'pending_review'] as const)('preserves %s operation IDs across a temporary credential outage', async (stage) => {
    const initial: DeliveryState = { ...release, stage, uploadId: 'up', submissionId: 'sub' };
    const { store, journal } = setup(initial);
    store.ready = () => false;
    expect(await deliver(release, store, journal)).toEqual(initial);
    expect(journal.write).not.toHaveBeenCalled();
    store.ready = () => true;
    await deliver(release, store, journal);
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.submit).toHaveBeenCalledTimes(stage === 'uploaded' ? 1 : 0);
  });
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
    vi.mocked(store.status).mockResolvedValue('needs_readback');
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
  it('reads back an uncertain outcome without replaying the mutation', async () => {
    const initial: DeliveryState = { ...release, stage: 'needs_readback', uploadId: 'up' };
    const { store, journal } = setup(initial);
    expect((await deliver(release, store, journal, true)).stage).toBe('pending_review');
    expect(store.status).toHaveBeenCalledOnce();
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.submit).not.toHaveBeenCalled();
    expect(journal.write.mock.calls[0]?.[0]).toMatchObject({ stage: 'pending_review', uploadId: 'up' });
  });
  it('keeps an unproven outcome unchanged when readback is unavailable or inconclusive', async () => {
    const initial: DeliveryState = { ...release, stage: 'needs_readback', uploadId: 'up' };
    const notes: string[] = [];
    const note = (reason: string) => notes.push(reason);
    const failing = setup(initial);
    vi.mocked(failing.store.status).mockRejectedValueOnce(new Error('store_http_401'));
    expect(await deliver(release, failing.store, failing.journal, false, note)).toEqual(initial);
    const leaky = setup(initial);
    vi.mocked(leaky.store.status).mockRejectedValueOnce(new Error('private server body with spaces'));
    expect(await deliver(release, leaky.store, leaky.journal, false, note)).toEqual(initial);
    const unknown = setup(initial);
    vi.mocked(unknown.store.status).mockResolvedValueOnce('needs_readback');
    expect(await deliver(release, unknown.store, unknown.journal, false, note)).toEqual(initial);
    const offline = setup(initial);
    offline.store.ready = () => false;
    expect(await deliver(release, offline.store, offline.journal, false, note)).toEqual(initial);
    expect(notes).toEqual(['readback_failed:store_http_401', 'readback_failed:error',
      `readback_inconclusive:version_${release.version}_not_in_store_revisions`, 'readback_skipped:store_not_configured']);
    expect(offline.store.status).not.toHaveBeenCalled();
    for (const { store, journal } of [failing, leaky, unknown, offline]) {
      expect(journal.write).not.toHaveBeenCalled();
      expect(store.upload).not.toHaveBeenCalled();
      expect(store.submit).not.toHaveBeenCalled();
    }
  });
  it('status-only polling cannot create a new submission', async () => {
    const { store, journal } = setup();
    expect((await deliver(release, store, journal, true)).stage).toBe('not_started');
    expect(store.upload).not.toHaveBeenCalled();
  });
});
