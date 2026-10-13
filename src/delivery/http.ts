export async function request(fetcher: typeof fetch, url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`store_http_${response.status}`);
  return response;
}
export async function object(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_store_response');
  return value as Record<string, unknown>;
}
export function id(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('missing_operation_id');
  const text = String(value);
  if (!/^[\w.@-]{1,180}$/u.test(text)) throw new Error('invalid_operation_id');
  return text;
}
