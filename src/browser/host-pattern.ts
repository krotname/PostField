/** Firefox match patterns identify hosts; exact ports remain in the consent settings. */
export function hostPattern(origin: string): string {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('invalid_origin');
  return `${url.protocol}//${url.hostname}/*`;
}
