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
const NOTARY = process.env.STILLOS_NOTARY || 'https://stillosdigitalholdings.com/notary';
// Every prior real caller defaulted to the same bland 'mcp-client' tag, making distinct
// real installs indistinguishable from each other (and from our own test traffic) in the
// receipts ledger. A per-process random suffix costs nothing and makes real usage traceable.
const DEFAULT_AGENT = `mcp-client-${Math.random().toString(36).slice(2, 8)}`;
const { version: PKG_VERSION } = require('./package.json');
// Complements DEFAULT_AGENT above -- that tags the notary's own JSON ledger
// (application layer); this tags the raw HTTP request (edge/proxy visitor
// log layer). Different observability surfaces, both were previously blank.
const UA = `stillos-edge-gate/${PKG_VERSION} (mcp; +https://www.npmjs.com/package/stillos-edge-gate)`;

function notarize(verdict, agent) {
  return new Promise((resolve) => {
    let u; try { u = new URL(NOTARY.replace(/\/+$/, '') + '/commit'); } catch { return resolve(null); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = JSON.stringify({ agent: String(agent || DEFAULT_AGENT).slice(0, 120), claim: JSON.stringify(verdict) });
    const req = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'user-agent': UA } }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try {
          const r = JSON.parse(b);
          if (r.receipt_hash) return resolve({ receipt_hash: r.receipt_hash, signature: r.signature, verify: r.verify });
          // 2026-09-25: a 402 used to fall into the same `resolve(null)` as a dead
          // socket, and the caller then told every agent "notary unreachable". That is
          // FALSE -- the notary answered, correctly, asking to be paid. It also threw
          // away the free door the 402 carries (`building_on_this` -> /request-trial,
          // no wallet, no signup), which is how stillos-kya sat on a 130-hit adopter
          // for two months. Distinguish "asked for payment" from "did not answer".
          if (res.statusCode === 402) {
            return resolve({
              unsigned_reason: 'payment_required',
              payment: Array.isArray(r.accepts) ? r.accepts[0] : null,
              request_trial: r.building_on_this || null,
              contact: 'stillmarcus24@gmail.com',
            });
          }
          return resolve(null);
        } catch { resolve(null); }
      });
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
      // Three distinct outcomes, three honest messages. Previously two of them
      // collapsed into "notary unreachable", which was a false statement about the
      // world whenever the notary had in fact answered 402.
      const out = { ...v, ...(
        signed && signed.receipt_hash
          ? { signed }
          : signed && signed.unsigned_reason === 'payment_required'
            ? {
                signed: null,
                note: 'verdict is valid but unsigned — the signed receipt is the paid tier.'
                  + (signed.request_trial && signed.request_trial.path
                    ? ` Not ready to pay? ${signed.request_trial.path} with {"agent":"<same id>","contact":"<email>"} — no payment, no signup, a founder reads every one.`
                    : ''),
                payment: signed.payment || null,
                request_trial: signed.request_trial || null,
                contact: signed.contact,
              }
            : { signed: null, note: 'notary unreachable — verdict is still valid, just unsigned' }
      ) };
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
