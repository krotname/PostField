import type { DeliveryState, Journal, Stage } from './ports.js';
import { object, request } from './http.js';
const stages: Stage[] = ['not_started', 'requires_setup', 'uploading', 'uploaded', 'submitting', 'pending_review', 'published', 'rejected', 'needs_readback'];
export function parseState(text: string): DeliveryState {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_journal');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !['version', 'sha', 'digest', 'stage', 'uploadId', 'submissionId', 'checkedAt'].includes(key))
    || typeof row.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(row.version)
    || typeof row.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(row.sha)
    || typeof row.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(row.digest)
    || !stages.includes(row.stage as Stage)
    || ['uploadId', 'submissionId'].some((key) => row[key] !== undefined && (typeof row[key] !== 'string' || !/^[\w.@-]{1,180}$/u.test(row[key])))
    || (row.checkedAt !== undefined && (typeof row.checkedAt !== 'string' || !Number.isFinite(Date.parse(row.checkedAt))))) throw new Error('invalid_journal');
  return row as unknown as DeliveryState;
}
interface Issue { number: number; title: string; body: string; user: { login: string }; pull_request?: unknown }
export class GitHubJournal implements Journal {
  private number: number | null = null;
  constructor(private readonly repo: string, private readonly token: string, private readonly tag: string,
    private readonly store: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repo) || !/^v\d+\.\d+\.\d+$/u.test(tag) || !['chrome', 'opera', 'edge', 'firefox'].includes(store)) throw new Error('invalid_journal_identity');
  }
  private title(): string { return `[delivery] ${this.tag} / ${this.store}`; }
  private headers(): Record<string, string> { return { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  private url(path: string): string { return `https://api.github.com/repos/${this.repo}/${path}`; }
  async read(): Promise<DeliveryState | null> {
    const matches: Issue[] = [];
    for (let page = 1; page <= 20; page++) {
      const value: unknown = await (await request(this.fetcher, this.url(`issues?state=all&per_page=100&page=${page}`), { headers: this.headers() })).json();
      if (!Array.isArray(value)) throw new Error('invalid_journal_response');
      for (const item of value as Issue[]) if (!item.pull_request && item.title === this.title()
        && ['github-actions[bot]', this.repo.split('/')[0]].includes(item.user.login)) matches.push(item);
      if (value.length < 100) break;
      if (page === 20) throw new Error('journal_pagination_limit');
    }
    if (matches.length > 1) throw new Error('duplicate_delivery_journal');
    const issue = matches[0]; if (!issue) return null;
    this.number = issue.number;
    const match = /```json\n([^]*?)\n```/u.exec(issue.body);
    if (!match?.[1]) throw new Error('invalid_journal');
    return parseState(match[1]);
  }
  async write(state: DeliveryState): Promise<void> {
    parseState(JSON.stringify(state));
    const body = `Delivery of ${this.tag} to ${this.store}: **${state.stage}**.\n\nRelease: https://github.com/${this.repo}/releases/tag/${this.tag}\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n\nUploaded and submitted do not mean published. An uncertain mutation is never replayed automatically.`;
    const reply = await object(await request(this.fetcher, this.url(this.number ? `issues/${this.number}` : 'issues'), { method: this.number ? 'PATCH' : 'POST',
      headers: this.headers(), body: JSON.stringify({ title: this.title(), body }) }));
    if (typeof reply.number !== 'number') throw new Error('journal_write_failed'); this.number = reply.number;
  }
}
