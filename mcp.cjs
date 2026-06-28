'use strict';
/*
 * MCP stdio server for stillos-edge-gate — a callable trust primitive.
 * Newline-delimited JSON-RPC 2.0. Zero external deps.
 * Verdicts are computed LOCALLY (deterministic, offline-safe). A signed receipt is
 * optionally fetched from the StillOS notary so the verdict is independently verifiable.
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');
const edge = require('./index.cjs');

const SERVER = { name: 'stillos-edge-gate', version: '1.0.0' };
const PROTOCOL = '2024-11-05';
const NOTARY = process.env.STILLOS_NOTARY || 'https://nolawealthfinancial.com/notary';

function notarize(verdict, agent) {
  return new Promise((resolve) => {
    let u; try { u = new URL(NOTARY.replace(/\/+$/, '') + '/commit'); } catch { return resolve(null); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = JSON.stringify({ agent: String(agent || 'mcp-client').slice(0, 120), claim: JSON.stringify(verdict) });
    const req = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { const r = JSON.parse(b); resolve(r.receipt_hash ? { receipt_hash: r.receipt_hash, signature: r.signature, verify: r.verify } : null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end(data);
  });
}

const TOOLS = [{
  name: 'grade_strategy',
  description: 'Grade a trading/strategy track record BEFORE committing capital. Returns one verdict — REAL_EDGE, REGIME_LUCK, NEGATIVE_EV, or INSUFFICIENT_DATA — via chronological out-of-sample holdout, fee+slippage adjustment, and a significance test. Fail-closed. Includes a signed, independently verifiable receipt when reachable.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'who is asking (for the receipt)' },
      trades: { type: 'array', description: 'settled trades',
        items: { type: 'object', properties: {
          t: { type: 'string' }, price: { type: 'number' }, side: { type: 'string', enum: ['yes', 'no'] }, outcome: { type: 'number', enum: [0, 1] },
        }, required: ['price', 'outcome'] } },
    }, required: ['trades'],
  },
}];

function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return reply(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER });
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/call') {
    try {
      if (params.name !== 'grade_strategy') throw new Error(`unknown tool: ${params.name}`);
      const args = params.arguments || {};
      const v = edge.gradeStrategy(args.trades || [], args.opts || {});
      const signed = await notarize(v, args.agent);
      const out = { ...v, ...(signed ? { signed } : { signed: null, note: 'notary unreachable — verdict is still valid, just unsigned' }) };
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) { return replyError(id, -32000, e.message); }
  }
  if (id !== undefined) return replyError(id, -32601, `method not found: ${method}`);
}

let buf = '', inflight = 0, ended = false;
function track(p) { inflight++; Promise.resolve(p).finally(() => { inflight--; if (ended && inflight === 0) process.exit(0); }); }
process.stdin.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (line) { try { track(handle(JSON.parse(line))); } catch { /* ignore malformed */ } }
  }
});
// don't exit while async tool calls (remote signing) are still in flight
process.stdin.on('end', () => { ended = true; if (inflight === 0) process.exit(0); });

module.exports = { TOOLS };
