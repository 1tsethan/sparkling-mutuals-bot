import { createServer } from 'node:http';
import type { Reply } from './app.ts';
export function createHttpServer(handle: (path: string, headers: Record<string, string>, body: Buffer) => Promise<Reply>,
  log: (code: string) => void = () => {}) {
  const server = createServer(createRequestHandler(handle, log));
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 50;
  return server;
}
export function createRequestHandler(handle: (path: string, headers: Record<string, string>, body: Buffer) => Promise<Reply>,
  log: (code: string) => void = () => {}) {
  return async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status: number, value: any) => { if (!res.writableEnded) { res.writeHead(status); res.end(JSON.stringify(value)); } };
    if (req.method === 'GET' && req.url === '/health') { reply(200, { status: 'ok' }); return; }
    if (req.method !== 'POST') { reply(405, { error: 'Method not allowed' }); return; }
    if (!['/interactions', '/notifications'].includes(req.url ?? '')) { reply(404, { error: 'Not found' }); req.resume(); return; }
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { reply(413, { error: 'Request too large' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[name] = value;
      const response = await handle(req.url!, headers, Buffer.concat(chunks));
      reply(response.status, response.body);
      if (response.after) void response.after().catch(() => log('interaction_job_failed'));
    } catch { log('http_request_failed'); reply(500, { error: 'Service temporarily unavailable' }); }
  };
}
