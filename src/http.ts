import { BotError } from './profile.ts';
export class HttpError extends BotError {
  status: number; headers: Headers;
  constructor(status: number, headers: Headers) {
    super('upstream', 'Upstream service unavailable.'); this.status = status; this.headers = headers;
  }
}
export async function readJson(response: Response, maxBytes = 2 * 1024 * 1024): Promise<any> {
  if (!response.ok || response.status === 204) {
    await response.body?.cancel();
    throw new HttpError(response.status, response.headers);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new BotError('malformed', 'Empty upstream response.');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new BotError('malformed', 'Upstream response too large.');
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    await reader.cancel().catch(() => {});
    throw new BotError('malformed', 'Malformed upstream response.');
  } finally { reader.releaseLock(); }
}
export async function getJson(url: string, fetcher: typeof fetch = fetch, headers: Record<string, string> = {}) {
  try {
    return await requestJson(url, fetcher, { headers });
  } catch (error) {
    if (error instanceof BotError) throw error;
    throw new BotError('upstream', 'The lookup timed out or is temporarily unavailable.');
  }
}
// Clear the deadline after consuming the body, including all error paths. An
// AbortSignal.timeout timer otherwise keeps an idle Durable Object active.
export async function requestJson(url: string, fetcher: typeof fetch, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  timer.unref?.();
  try {
    // Workers rejects redirect:error during Request construction. Manual mode
    // is portable; readJson rejects every 3xx without following Location.
    const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'manual' });
    return { data: await readJson(response), headers: response.headers };
  } finally { clearTimeout(timer); }
}
export function retryAt(headers: Headers, now: number): number {
  const retry = headers.get('retry-after');
  if (retry && /^\d+(\.\d+)?$/.test(retry)) return now + Math.max(1000, Number(retry) * 1000);
  if (retry && Number.isFinite(Date.parse(retry))) return Math.max(now + 1000, Date.parse(retry));
  return now + 60000;
}
