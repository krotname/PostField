import { createHmac, randomUUID } from 'node:crypto';
import type { DeliveryState, StorePort } from './ports.js';
import { id, object, request } from './http.js';

interface ChromeConfig { publisherId: string; itemId: string; clientId: string; clientSecret: string; refreshToken: string }
export class ChromeStore implements StorePort {
  private token: string | null = null;
  constructor(private readonly config: ChromeConfig, private readonly bytes: Buffer, private readonly version: string, private readonly fetcher: typeof fetch = fetch) {}
  ready(): boolean { return Object.values(this.config).every(Boolean); }
  private path(): string { return `publishers/${id(this.config.publisherId)}/items/${id(this.config.itemId)}`; }
  private async headers(): Promise<Record<string, string>> {
    if (!this.token) {
      const reply = await object(await request(this.fetcher, 'https://oauth2.googleapis.com/token', { method: 'POST',
        body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken, grant_type: 'refresh_token' }) }));
      if (typeof reply.access_token !== 'string') throw new Error('oauth_failed');
      this.token = reply.access_token;
    }
    return { Authorization: `Bearer ${this.token}` };
  }
  async upload(): Promise<{ uploadId: string }> {
    const reply = await object(await request(this.fetcher, `https://chromewebstore.googleapis.com/upload/v2/${this.path()}:upload`, {
      method: 'POST', headers: { ...await this.headers(), 'Content-Type': 'application/zip' }, body: new Uint8Array(this.bytes) }));
    if (reply.uploadState === 'SUCCEEDED' && reply.crxVersion === this.version) return { uploadId: this.version };
    if (reply.uploadState === 'IN_PROGRESS') return { uploadId: `async-${this.version}` };
    throw new Error('chrome_upload_failed');
  }
  private async read(): Promise<Record<string, unknown>> {
    return object(await request(this.fetcher, `https://chromewebstore.googleapis.com/v2/${this.path()}:fetchStatus`, { headers: await this.headers() }));
  }
  async uploadStatus(state: DeliveryState): Promise<'waiting' | 'ready' | 'rejected'> {
    if (state.uploadId === this.version) return 'ready';
    const reply = await this.read();
    return reply.lastAsyncUploadState === 'SUCCEEDED' ? 'ready' : reply.lastAsyncUploadState === 'FAILED' ? 'rejected' : 'waiting';
  }
  async submit(): Promise<{ submissionId: string }> {
    await request(this.fetcher, `https://chromewebstore.googleapis.com/v2/${this.path()}:publish`, { method: 'POST',
      headers: { ...await this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true }) });
    return { submissionId: this.version };
  }
  async status(): Promise<'pending_review' | 'published' | 'rejected' | 'needs_readback'> {
    const reply = await this.read();
    if (reply.takenDown === true) return 'rejected';
    for (const [key, published] of [['publishedItemRevisionStatus', true], ['submittedItemRevisionStatus', false]] as const) {
      const revision = reply[key] as { state?: string; distributionChannels?: { crxVersion?: string; deployPercentage?: number }[] } | undefined;
      if (!revision?.distributionChannels?.some((channel) => channel.crxVersion === this.version)) continue;
      if (revision.state === 'REJECTED') return 'rejected';
      if (published && revision.state === 'PUBLISHED' && revision.distributionChannels.some((channel) => channel.crxVersion === this.version && channel.deployPercentage === 100)) return 'published';
      return 'pending_review';
    }
    return 'needs_readback';
  }
}

interface EdgeConfig { productId: string; clientId: string; apiKey: string }
export class EdgeStore implements StorePort {
  constructor(private readonly config: EdgeConfig, private readonly bytes: Buffer, private readonly fetcher: typeof fetch = fetch) {}
  ready(): boolean { return Object.values(this.config).every(Boolean); }
  private base(): string { return `https://api.addons.microsoftedge.microsoft.com/v1/products/${id(this.config.productId)}/submissions`; }
  private headers(): Record<string, string> { return { Authorization: `ApiKey ${this.config.apiKey}`, 'X-ClientID': this.config.clientId }; }
  private async mutate(path: string, body: Exclude<RequestInit['body'], undefined>, contentType: string): Promise<string> {
    const response = await request(this.fetcher, `${this.base()}${path}`, { method: 'POST', headers: { ...this.headers(), 'Content-Type': contentType }, body });
    if (response.status !== 202) throw new Error('edge_not_accepted');
    // The documented Location is an operation ID, not an arbitrary fetch URL.
    return id(response.headers.get('Location'));
  }
  async upload(): Promise<{ uploadId: string }> { return { uploadId: await this.mutate('/draft/package', new Uint8Array(this.bytes), 'application/zip') }; }
  async uploadStatus(state: DeliveryState): Promise<'waiting' | 'ready' | 'rejected'> {
    const reply = await object(await request(this.fetcher, `${this.base()}/draft/package/operations/${id(state.uploadId)}`, { headers: this.headers() }));
    return reply.status === 'Succeeded' ? 'ready' : reply.status === 'Failed' ? 'rejected' : 'waiting';
  }
  async submit(): Promise<{ submissionId: string }> { return { submissionId: await this.mutate('', 'PostField: Russia first. Bring your own Geoapify key; explicit consent and optional site permissions. Moderator sources are attached to the corresponding GitHub release.', 'text/plain') }; }
  async status(state: DeliveryState): Promise<'pending_review' | 'rejected'> {
    const reply = await object(await request(this.fetcher, `${this.base()}/operations/${id(state.submissionId)}`, { headers: this.headers() }));
    // Succeeded means submission created; the API does not prove the public store version.
    return reply.status === 'Failed' ? 'rejected' : 'pending_review';
  }
}

export function amoToken(issuer: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: issuer, iat: now, exp: now + 60, jti: randomUUID() })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
interface MozillaConfig { addonId: string; issuer: string; secret: string; license: string }
export class MozillaStore implements StorePort {
  constructor(private readonly config: MozillaConfig, private readonly bytes: Buffer, private readonly sources: Buffer,
    private readonly version: string, private readonly fetcher: typeof fetch = fetch) {}
  ready(): boolean { return Object.values(this.config).every(Boolean); }
  private headers(): Record<string, string> { return { Authorization: `JWT ${amoToken(this.config.issuer, this.config.secret)}` }; }
  private base(): string { return `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id(this.config.addonId))}/versions/`; }
  async upload(): Promise<{ uploadId: string }> {
    const body = new FormData(); body.set('upload', new Blob([new Uint8Array(this.bytes)], { type: 'application/zip' }), 'postfield.zip'); body.set('channel', 'listed');
    const reply = await object(await request(this.fetcher, 'https://addons.mozilla.org/api/v5/addons/upload/', { method: 'POST', headers: this.headers(), body }));
    return { uploadId: id(reply.uuid) };
  }
  async uploadStatus(state: DeliveryState): Promise<'waiting' | 'ready' | 'rejected'> {
    const reply = await object(await request(this.fetcher, `https://addons.mozilla.org/api/v5/addons/upload/${id(state.uploadId)}/`, { headers: this.headers() }));
    if (reply.version !== this.version && reply.processed === true) return 'rejected';
    return reply.processed !== true ? 'waiting' : reply.valid === true ? 'ready' : 'rejected';
  }
  async submit(state: DeliveryState): Promise<{ submissionId: string }> {
    const body = new FormData(); body.set('upload', id(state.uploadId));
    body.set('source', new Blob([new Uint8Array(this.sources)], { type: 'application/zip' }), 'postfield-sources.zip');
    // Custom license is configured in the initial listing and inherited by new versions.
    const reply = await object(await request(this.fetcher, this.base(), { method: 'POST', headers: this.headers(), body }));
    return { submissionId: id(reply.id) };
  }
  async status(state: DeliveryState): Promise<'pending_review' | 'published' | 'rejected' | 'needs_readback'> {
    const reply = await object(await request(this.fetcher, `${this.base()}${id(state.submissionId)}/`, { headers: this.headers() }));
    if (reply.version !== this.version) return 'needs_readback';
    const file = reply.file as { status?: string } | undefined;
    return reply.channel === 'listed' && file?.status === 'public' ? 'published' : file?.status === 'disabled' ? 'needs_readback' : 'pending_review';
  }
}

/** No portal endpoints or cookies are guessed. Replace only after a verified live contract. */
export class OperaStore implements StorePort {
  constructor(_fetcher: typeof fetch = fetch) {}
  ready(): boolean { return false; }
  async upload(): Promise<{ uploadId: string }> { throw new Error('opera_contract_unverified'); }
  async uploadStatus(): Promise<'waiting'> { throw new Error('opera_contract_unverified'); }
  async submit(): Promise<{ submissionId: string }> { throw new Error('opera_contract_unverified'); }
  async status(): Promise<'needs_readback'> { return 'needs_readback'; }
}
