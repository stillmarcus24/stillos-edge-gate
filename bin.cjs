#!/usr/bin/env node
'use strict';
/*
 * stillos-edge-gate CLI / MCP entry.
 *   stillos-edge-gate demo                -> grade bundled sample data, no file needed
 *   stillos-edge-gate mcp                 -> run as an MCP stdio server (for agents/clients)
 *   stillos-edge-gate grade <file.json>   -> grade a track record JSON file
 *   cat trades.json | stillos-edge-gate   -> grade from stdin
 *
 * trades JSON = [{ "t":"ISO", "price":0..1, "side":"yes|no", "outcome":0|1 }, ...]
 *
 * The README promises every verdict ships with a signed, independently verifiable
 * receipt -- until 2026-07-06 that was only true through the MCP tool path (mcp.cjs).
 * This CLI path computed the verdict locally and printed it, full stop -- no notary
 * call, no receipt, no verify link. Fixed here so the CLI honors the same claim.
 *
 * 2026-07-16: found live that (a) every usage example required a real trades.json
 * the installer doesn't have -- no copy-pasteable path to real output for a curious
 * first-run, unlike the notary's own proven "hero -> one command -> real output"
 * doctrine -- fixed with `demo` + bundled sample-trades.json (deterministically
 * grades REAL_EDGE, verified via test.cjs's own generator); and (b) piping
 * empty/malformed stdin (`echo | npx stillos-edge-gate`, a plausible shape for an
 * automated CI/agent-discovery probe) crashed with a raw unhandled SyntaxError
 * instead of the same clean usage text the interactive-TTY path already shows --
 * fixed by wrapping both the stdin and the `grade <file>` JSON.parse calls.
 */
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const edge = require('./index.cjs');

const NOTARY = process.env.STILLOS_NOTARY || 'https://stillosdigitalholdings.com/notary';
const DEFAULT_AGENT = `edge-gate-cli-${Math.random().toString(36).slice(2, 8)}`;
const { version: PKG_VERSION } = require('./package.json');
const UA = `stillos-edge-gate/${PKG_VERSION} (cli; +https://www.npmjs.com/package/stillos-edge-gate)`;

function notarize(trades, agent) {
  return new Promise((resolve) => {
    let u; try { u = new URL(NOTARY.replace(/\/+$/, '') + '/grade-strategy'); } catch { return resolve(null); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = JSON.stringify({ agent: String(agent || DEFAULT_AGENT).slice(0, 120), trades });
    const req = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'user-agent': UA } }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { const r = JSON.parse(b); resolve(r.receipt_hash ? { receipt_hash: r.receipt_hash, verify: r.verify } : null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end(data);
  });
}

function parseAgentFlag(args) {
  const i = args.indexOf('--agent');
  return i >= 0 ? args[i + 1] : null;
}

function parseNotifyFlag(args) {
  const i = args.indexOf('--notify');
  return i >= 0 ? args[i + 1] : null;
}

// Free-tier callers who never fund a wallet were, until now, a pure dead end --
// no record survives their run. /request-trial is the notary's own existing
// no-payment lead-capture route (logs to the founder's opportunity ledger,
// real-time alert) -- reusing it here rather than building a second one.
function requestTrial(agent, contact, reason) {
  return new Promise((resolve) => {
    let u; try { u = new URL(NOTARY.replace(/\/+$/, '') + '/request-trial'); } catch { return resolve(false); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = JSON.stringify({ agent: String(agent || DEFAULT_AGENT).slice(0, 120), endpoint: 'grade-strategy', contact, reason });
    const req = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'user-agent': UA } }, (res) => {
      res.on('data', () => {}); res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.end(data);
  });
}

const args = process.argv.slice(2);

if (args[0] === 'mcp') { require('./mcp.cjs'); return; }

function usage(exitCode) {
  console.log('stillos-edge-gate — grade a track record before risking capital.\n');
  console.log('  stillos-edge-gate demo                run on bundled sample data (no file needed)');
  console.log('  stillos-edge-gate mcp                 run as MCP server');
  console.log('  stillos-edge-gate grade <file.json>   grade a JSON track record');
  console.log('  cat trades.json | stillos-edge-gate   grade from stdin\n');
  console.log('verdicts: REAL_EDGE | REGIME_LUCK | NEGATIVE_EV | INSUFFICIENT_DATA');
  process.exit(exitCode);
}

async function grade(trades, agentFlag, notifyFlag) {
  const v = edge.gradeStrategy(trades);
  console.log(JSON.stringify(v, null, 2));
  const receipt = await notarize(trades, agentFlag);
  if (receipt) {
    console.log(`\nreceipt: ${receipt.receipt_hash}`);
    console.log(`verify:  ${receipt.verify}`);
    // 2026-07-23: found live that a successful free-tier call (this branch) had ZERO
    // capture path -- only a REJECTED call (the else branch below) ever invited the
    // caller to leave contact info. A real installed user ran this 3x successfully
    // from Hong Kong 2026-07-07 and left no trace beyond an IP hash; the resulting
    // lead sat unactioned for 16 days because there was nothing to act on. This does
    // not gate anything and costs the caller nothing to skip.
    if (notifyFlag) {
      const ok = await requestTrial(agentFlag, notifyFlag, 'free-tier grade succeeded via CLI, opted in for updates/early access');
      console.log(ok ? `\nLogged — you'll hear from us at ${notifyFlag}.` : '\nCould not reach the notify endpoint this run — no harm done, try again later.');
    } else {
      console.log(`\nWant updates on new features, or a heads-up before you hit the free-tier limit? add --notify you@email to this command.`);
    }
  } else {
    console.log('\n⚠ UNSIGNED — this verdict is NOT independently verifiable and cannot be shown to a counterparty.');
    // No hardcoded price. Found 2026-09-14: this line said $0.25 while the live
    // service charged $0.05 under launch pricing -- we quoted 5x the real number
    // to every caller, and a constant compiled into a published CLI can never
    // track a price that moves. The catalog is the source of truth; say so
    // instead of asserting a figure this process cannot check.
    console.log(`   Get a permanent, signed, shareable proof → ${NOTARY}/grade-strategy  (x402 in USDC on Base, no signup — live price at ${NOTARY}/catalog)`);
    console.log(`   No crypto wallet? Pay $1 by card → https://buy.stripe.com/aFadRagv09pw0T6gAp6kg3C (reply to your receipt email with your trades.json, signed back within 1 business day)`);
    if (notifyFlag) {
      const ok = await requestTrial(agentFlag, notifyFlag, 'ran edge-gate demo/grade via CLI, requested a heads-up on pricing/signed access');
      console.log(ok ? `   Logged — you'll hear from us at ${notifyFlag}.` : '   Could not reach the notify endpoint this run — no harm done, try again later.');
    } else {
      console.log(`   Want a heads-up instead of paying now? add --notify you@email to this command.`);
    }
  }
  // exit code encodes the verdict for shell pipelines: 0=REAL_EDGE, 1=anything else (fail-closed)
  process.exit(v.verdict === 'REAL_EDGE' ? 0 : 1);
}

function parseTradesOrDie(raw, sourceDesc) {
  try {
    const trimmed = String(raw || '').trim();
    if (!trimmed) throw new Error('empty input');
    return JSON.parse(trimmed);
  } catch (e) {
    console.error(`Could not parse trades JSON from ${sourceDesc}: ${e.message}\n`);
    usage(2);
  }
}

if (args[0] === 'demo') {
  const sample = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'sample-trades.json'), 'utf8'));
  console.log('Running on bundled SAMPLE data (not your real trades) -- for your own track record, use `grade <file.json>` or pipe via stdin.\n');
  // Was a literal 'demo' string -- traction_radar.cjs only counts agents matching the
  // edge-gate-cli-*/mcp-client-* prefix, so every real user of THIS exact promoted
  // onboarding command was invisible to activation tracking even if they went on to
  // pay for a signed receipt. Keep the 'demo' surface identifiable in the tag itself
  // instead of overloading the whole prefix scheme.
  grade(sample, parseAgentFlag(args) || `edge-gate-cli-demo-${Math.random().toString(36).slice(2, 8)}`, parseNotifyFlag(args));
} else if (args[0] === 'grade' && args[1]) {
  grade(parseTradesOrDie(fs.readFileSync(args[1], 'utf8'), args[1]), parseAgentFlag(args), parseNotifyFlag(args));
} else if (!process.stdin.isTTY) {
  let buf = '';
  process.stdin.on('data', c => buf += c);
  process.stdin.on('end', () => grade(parseTradesOrDie(buf, 'stdin'), parseAgentFlag(args), parseNotifyFlag(args)));
} else {
  usage(2);
}
