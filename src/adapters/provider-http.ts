import { ProviderError } from '../application/lookup-postcode.js';

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function providerJson(fetcher: typeof fetch, url: URL | string, init: RequestInit,
  onResponse?: (response: Response) => void): Promise<unknown> {
  try {
    const timeout = AbortSignal.timeout(10_000);
    const response = await fetcher(url, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: init.signal ? AbortSignal.any([timeout, init.signal]) : timeout });
    onResponse?.(response);
    if (response.status === 401 || response.status === 403) throw new ProviderError('unauthorized');
    if (response.status === 429) throw new ProviderError('quota');
    if (!response.ok) throw new ProviderError('http');
    return await response.json();
  } catch (error: unknown) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof SyntaxError) throw new ProviderError('invalid_response');
    throw new ProviderError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'offline');
  }
}
