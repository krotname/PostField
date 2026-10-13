import { describe, expect, it, vi } from 'vitest';
import { ChromeStore, EdgeStore, MozillaStore, OperaStore, amoToken } from '../../src/delivery/stores.js';
import type { DeliveryState } from '../../src/delivery/ports.js';
const state: DeliveryState = { version: '0.1.0', sha: 'a'.repeat(40), digest: 'b'.repeat(64), stage: 'pending_review', uploadId: 'up', submissionId: 'sub' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe('store HTTP contracts', () => {
  it('Chrome v2 upload uses OAuth and exact package, not a previous product ID', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ access_token: 'fake-token' }))
      .mockResolvedValueOnce(json({ crxVersion: '0.1.0', uploadState: 'SUCCEEDED' }));
    const store = new ChromeStore({ publisherId: 'publisher', itemId: 'new-item', clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }, Buffer.from('zip'), '0.1.0', fetcher);
    expect(await store.upload()).toEqual({ uploadId: '0.1.0' });
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://chromewebstore.googleapis.com/upload/v2/publishers/publisher/items/new-item:upload');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer fake-token', 'Content-Type': 'application/zip' } });
  });
  it('Chrome waits for IN_PROGRESS and rejects FAILED upload states', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ access_token: 'token' }))
      .mockResolvedValueOnce(json({ lastAsyncUploadState: 'IN_PROGRESS' })).mockResolvedValueOnce(json({ lastAsyncUploadState: 'FAILED' }));
    const store = new ChromeStore({ publisherId: 'p', itemId: 'i', clientId: 'c', clientSecret: 's', refreshToken: 'r' }, Buffer.from('zip'), '0.1.0', fetcher);
    const asyncState = { ...state, uploadId: 'async-0.1.0' };
    expect(await store.uploadStatus(asyncState)).toBe('waiting');
    expect(await store.uploadStatus(asyncState)).toBe('rejected');
  });
  it('Chrome publication requires a matching published version', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ access_token: 'token' }))
      .mockResolvedValueOnce(json({ publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '0.0.9', deployPercentage: 100 }] }, submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '0.1.0' }] } }));
    expect(await new ChromeStore({ publisherId: 'p', itemId: 'i', clientId: 'c', clientSecret: 's', refreshToken: 'r' }, Buffer.from('zip'), '0.1.0', fetcher).status()).toBe('pending_review');
  });
  it('Edge uses v1.1 credentials and does not call accepted submission published', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 202, headers: { Location: 'operation' } }))
      .mockResolvedValueOnce(json({ status: 'Succeeded' }));
    const store = new EdgeStore({ productId: 'product', clientId: 'client', apiKey: 'secret' }, Buffer.from('zip'), fetcher);
    expect(await store.upload()).toEqual({ uploadId: 'operation' });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: 'ApiKey secret', 'X-ClientID': 'client' } });
    expect(await store.status(state)).toBe('pending_review');
  });
  it('AMO JWT expires within one minute and uses the documented issuer', () => {
    const token = amoToken('issuer', 'fake-secret', 1000);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { iss: string; iat: number; exp: number; jti: string };
    expect(payload).toMatchObject({ iss: 'issuer', iat: 1000, exp: 1060 }); expect(payload.jti).toBeTruthy();
  });
  it('Mozilla delivery requires an explicit confirmed license setup flag', () => {
    const config = { addonId: 'postfield@krot.name', issuer: 'issuer', secret: 'secret', license: 'false' };
    const create = (license: string) => new MozillaStore({ ...config, license }, Buffer.from('zip'), Buffer.from('source'), '0.1.0');
    expect(create('false').ready()).toBe(false);
    expect(create('custom license').ready()).toBe(false);
    expect(create('true').ready()).toBe(true);
  });
  it('Mozilla sends a listed upload and the immutable source archive at submission', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ uuid: 'up' })).mockResolvedValueOnce(json({ id: 123 }));
    const store = new MozillaStore({ addonId: 'postfield@krot.name', issuer: 'issuer', secret: 'secret', license: 'custom license' }, Buffer.from('zip'), Buffer.from('source'), '0.1.0', fetcher);
    await store.upload(); await store.submit(state);
    const upload = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(upload.get('channel')).toBe('listed');
    const submission = fetcher.mock.calls[1]?.[1]?.body as FormData;
    expect(submission.get('source')).toBeInstanceOf(Blob); expect(submission.get('upload')).toBe('up');
  });
  it('Opera fails closed until the live portal contract is verified', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const store = new OperaStore(fetcher);
    expect(store.ready()).toBe(false);
    await expect(store.upload()).rejects.toThrow('opera_contract_unverified');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
