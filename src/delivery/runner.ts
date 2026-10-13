import type { DeliveryState, Journal, ReleaseIdentity, StorePort } from './ports.js';

/** Write the intent before every mutation; an unknown outcome never authorizes replay. */
export async function deliver(release: ReleaseIdentity, store: StorePort, journal: Journal, statusOnly = false): Promise<DeliveryState> {
  let state = await journal.read();
  if (state && (state.version !== release.version || state.sha !== release.sha || state.digest !== release.digest)) throw new Error('release_identity_mismatch');
  const save = async (next: DeliveryState): Promise<DeliveryState> => {
    const checked = { ...next, checkedAt: new Date().toISOString() };
    await journal.write(checked); state = checked; return checked;
  };
  if (state && ['published', 'rejected', 'needs_readback'].includes(state.stage)) return state;
  if (state && ['uploading', 'submitting'].includes(state.stage)) return save({ ...state, stage: 'needs_readback' });
  if (!store.ready()) return save({ ...release, stage: 'requires_setup' });
  if (statusOnly && (!state || ['not_started', 'requires_setup'].includes(state.stage))) return { ...release, stage: 'not_started' };
  try {
    if (!state || ['not_started', 'requires_setup'].includes(state.stage)) {
      await save({ ...release, stage: 'uploading' });
      const uploaded = await store.upload();
      await save({ ...release, stage: 'uploaded', uploadId: uploaded.uploadId });
    }
    if (state?.stage === 'uploaded') {
      const validation = await store.uploadStatus(state);
      if (validation === 'rejected') return save({ ...state, stage: 'rejected' });
      if (validation === 'waiting' || statusOnly) return state;
      await save({ ...state, stage: 'submitting' });
      const submitted = await store.submit(state);
      await save({ ...state, ...submitted, stage: 'pending_review' });
    }
    if (state?.stage === 'pending_review') return save({ ...state, stage: await store.status(state) });
    if (!state) throw new Error('missing_delivery_state');
    return state;
  } catch {
    if (state?.stage === 'uploading' || state?.stage === 'submitting') return save({ ...state, stage: 'needs_readback' });
    // A failed GET is safe to retry on the next run; preserve the operation identity.
    if (state) return state;
    throw new Error('delivery_failed');
  }
}
