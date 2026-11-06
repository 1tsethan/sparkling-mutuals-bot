import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BotError } from './profile.ts';
import { getJson, HttpError, retryAt } from './http.ts';
import { clean, SM_LINKS } from './commands.ts';
import type { Message } from './commands.ts';
import type { ReceiptStore } from './store.ts';
export const REPOSITORY = 'johnceoskyblock/sparkling-mutuals';
const ROOT = 'https://api.github.com/repos/' + REPOSITORY;
const WEB = 'https://github.com/' + REPOSITORY;
export const TARGETS = ['26.1.2', '26.2', '26.3'];
type Options = {
  secret: string; developmentBranch: string;
  channels: { stable: string; beta: string; action: string };
  store: ReceiptStore; discord: { sendMessage(channel: string, message: Message, nonce?: string): Promise<string> };
  fetcher?: typeof fetch; now?: () => number; githubReadToken?: string;
};
function requireValid(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new BotError('invalid', detail);
}
function knownIssues(body: unknown): string {
  if (typeof body !== 'string') return 'Not supplied in the release notes.';
  const heading = /^(?:#{1,6}\s+)?known (?:issues|limitations)\s*:?\s*\r?$/im.exec(body);
  if (!heading) return 'Not supplied in the release notes.';
  const section = body.slice(heading.index + heading[0].length).split(/\r?\n#{1,6}\s+/)[0].trim();
  return section ? clean(section).slice(0, 800) : 'Not supplied in the release notes.';
}
export class ReleaseNotifier {
  private options: Options; private now: () => number;
  constructor(options: Options) {
    if (options.secret.length < 32) throw new Error('Notification secret must contain at least 32 characters.');
    this.options = options; this.now = options.now ?? Date.now;
  }
  private async api(path: string) {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Sparkling-Mutuals-Discord' };
    if (this.options.githubReadToken) headers.Authorization = 'Bearer ' + this.options.githubReadToken;
    return (await getJson(ROOT + path, this.options.fetcher ?? fetch, headers)).data;
  }
  private async tagCommit(tag: string): Promise<string> {
    let node = (await this.api('/git/ref/tags/' + encodeURIComponent(tag))).object;
    for (let i = 0; i < 5; i++) {
      requireValid(node && /^[a-f0-9]{40}$/.test(node.sha ?? ''), 'Invalid version tag.');
      if (node.type === 'commit') return node.sha;
      requireValid(node.type === 'tag', 'Version tag does not resolve to a commit.');
      node = (await this.api('/git/tags/' + node.sha)).object;
    }
    throw new BotError('invalid', 'Too many tag indirections.');
  }
  async notify(headers: Record<string, string>, raw: Buffer) {
    const stamp = headers['x-sm-timestamp'] ?? '', signature = headers['x-sm-signature'] ?? '';
    if (!/^\d{1,12}$/.test(stamp) || Math.abs(this.now() - Number(stamp) * 1000) > 300000 ||
        !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new BotError('auth', 'Invalid notification signature.');
    const expected = createHmac('sha256', this.options.secret).update(stamp + '.').update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new BotError('auth', 'Invalid notification signature.');
    let input: any;
    try { input = JSON.parse(raw.toString('utf8')); } catch { throw new BotError('invalid', 'Invalid notification.'); }
    requireValid(input && input.repository === REPOSITORY && ['action', 'release'].includes(input.kind) &&
      typeof input.runId === 'string' && /^\d{1,20}$/.test(input.runId), 'Invalid notification.');
    const run = await this.api('/actions/runs/' + input.runId);
    requireValid(String(run.id) === input.runId && run.repository?.full_name === REPOSITORY &&
      run.head_repository?.full_name === REPOSITORY && run.head_repository.id === run.repository.id &&
      run.event === 'push' && run.status === 'completed' && run.conclusion === 'success' &&
      /^[a-f0-9]{40}$/.test(run.head_sha ?? ''), 'This workflow is not an eligible verified official push build.');
    let channel: string, notice: string, message: Message;
    if (input.kind === 'action') {
      requireValid(this.options.developmentBranch && run.head_branch === this.options.developmentBranch &&
        run.path === '.github/workflows/build.yml', 'This development branch or workflow is not approved.');
      const listing = await this.api('/actions/runs/' + input.runId + '/artifacts?per_page=100');
      requireValid(Array.isArray(listing.artifacts) && listing.artifacts.length < 100, 'Artifact list cannot be fully verified.');
      const assets = TARGETS.map(mc => {
        const found = listing.artifacts.filter((a: any) => a.name === 'jar-mc' + mc);
        requireValid(found.length === 1, 'Missing or duplicate target artifacts.');
        const a = found[0];
        requireValid(/^\d{1,20}$/.test(String(a.id)) && a.expired === false &&
          Number.isSafeInteger(a.size_in_bytes) && a.size_in_bytes > 0 && Date.parse(a.expires_at) > this.now() &&
          String(a.workflow_run?.id) === input.runId && a.workflow_run.head_sha === run.head_sha &&
          a.workflow_run.head_repository_id === run.repository.id && a.workflow_run.repository_id === run.repository.id,
          'Expired or mismatched artifact.');
        return { mc, id: a.id, expiry: a.expires_at };
      });
      notice = REPOSITORY + ':action:' + input.runId; channel = this.options.channels.action;
      message = { embeds: [{
        title: 'Sparkling Mutuals development build', color: 0xe6b85c,
        url: WEB + '/actions/runs/' + input.runId,
        description: 'Experimental build from ' + clean(run.head_branch) + '. GitHub login required. [Testing and feedback](' + SM_LINKS.testing + ').',
        fields: [
          { name: 'Commit', value: '[' + run.head_sha.slice(0, 7) + '](' + WEB + '/commit/' + run.head_sha + ')' },
          ...assets.map(a => ({ name: 'Minecraft ' + a.mc, value: '[Download artifact](' + WEB + '/actions/runs/' + input.runId + '/artifacts/' + a.id + ')\nExpires: ' + a.expiry })),
          { name: 'Changes', value: clean(String(run.display_title ?? 'See the linked commit and workflow.')).slice(0, 500) }
        ], footer: { text: notice }
      }], allowed_mentions: { parse: [] } };
    } else {
      requireValid(run.path === '.github/workflows/release.yml' &&
        /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(run.head_branch ?? ''), 'Unrecognized release workflow or version.');
      const tag = run.head_branch;
      const release = await this.api('/releases/tags/' + encodeURIComponent(tag));
      requireValid(/^\d{1,20}$/.test(String(release.id)) && release.tag_name === tag && release.draft === false &&
        typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at)) &&
        typeof release.prerelease === 'boolean' && release.prerelease === tag.includes('-beta.'),
        'Release is unpublished or beta classification does not match its tag.');
      requireValid(await this.tagCommit(tag) === run.head_sha, 'Version tag no longer matches the tested commit.');
      if (/^[a-f0-9]{40}$/.test(release.target_commitish ?? ''))
        requireValid(release.target_commitish === run.head_sha, 'Release target does not match the tested commit.');
      requireValid(Array.isArray(release.assets), 'Release assets unavailable.');
      const jars = release.assets.filter((a: any) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.jar'));
      requireValid(jars.length === TARGETS.length, 'Release must contain exactly three target JARs.');
      const assets = TARGETS.map(mc => {
        const name = 'sparkling-mutuals-' + tag.slice(1) + '+mc' + mc + '.jar';
        const found = jars.filter((a: any) => a.name === name);
        requireValid(found.length === 1 && found[0].state === 'uploaded' && Number.isSafeInteger(found[0].size) &&
          found[0].size > 0 && /^sha256:[a-f0-9]{64}$/.test(found[0].digest ?? ''), 'Missing or unverified release JAR.');
        return { mc, name };
      });
      notice = REPOSITORY + ':release:' + release.id;
      channel = release.prerelease ? this.options.channels.beta : this.options.channels.stable;
      message = { embeds: [{
        title: 'Sparkling Mutuals ' + tag, color: release.prerelease ? 0xe6b85c : 0x60bfff,
        url: WEB + '/releases/tag/' + encodeURIComponent(tag),
        description: release.prerelease ? 'Experimental beta. [Testing and feedback](' + SM_LINKS.testing + ').' : 'Verified stable release. [Installation](' + SM_LINKS.downloads + ') · [Support](' + SM_LINKS.support + ') · [Report a bug](' + SM_LINKS.bugs + ')',
        fields: [
          { name: 'Changes', value: clean(typeof release.body === 'string' && release.body.trim() ? release.body.trim() : 'See the published release notes.').slice(0, 1000) },
          ...(release.prerelease ? [{ name: 'Known issues', value: knownIssues(release.body) }] : []),
          ...assets.map(a => ({ name: 'Minecraft ' + a.mc, value: '[Download JAR](' + WEB + '/releases/download/' + encodeURIComponent(tag) + '/' + encodeURIComponent(a.name) + ')' }))
        ], footer: { text: notice }
      }], allowed_mentions: { parse: [] } };
    }
    requireValid(/^\d{17,22}$/.test(channel ?? ''), 'Release destination has not been configured.');
    const digest = createHash('sha256').update(JSON.stringify(message)).digest('hex');
    const state = this.options.store.claim(notice, channel, digest, this.now());
    if (state !== 'new') return { status: state, notice };
    try {
      const id = await this.options.discord.sendMessage(channel, message, createHash('sha256').update(notice).digest('hex').slice(0, 24));
      this.options.store.sent(notice, id);
      return { status: 'sent', notice, messageId: id };
    } catch (error) {
      if (error instanceof HttpError && error.status === 429)
        this.options.store.retryable(notice, retryAt(error.headers, this.now()));
      else this.options.store.uncertain(notice);
      throw new BotError('uncertain', 'Notification was not confirmed. Review the receipt before retrying.');
    }
  }
}
