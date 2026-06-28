#!/usr/bin/env node
'use strict';
/*
 * stillos-edge-gate CLI / MCP entry.
 *   stillos-edge-gate mcp                 -> run as an MCP stdio server (for agents/clients)
 *   stillos-edge-gate grade <file.json>   -> grade a track record JSON file
 *   cat trades.json | stillos-edge-gate   -> grade from stdin
 *
 * trades JSON = [{ "t":"ISO", "price":0..1, "side":"yes|no", "outcome":0|1 }, ...]
 */
const fs = require('fs');
const edge = require('./index.cjs');

const args = process.argv.slice(2);

if (args[0] === 'mcp') { require('./mcp.cjs'); return; }

function grade(trades) {
  const v = edge.gradeStrategy(trades);
  console.log(JSON.stringify(v, null, 2));
  // exit code encodes the verdict for shell pipelines: 0=REAL_EDGE, 1=anything else (fail-closed)
  process.exit(v.verdict === 'REAL_EDGE' ? 0 : 1);
}

if (args[0] === 'grade' && args[1]) {
  grade(JSON.parse(fs.readFileSync(args[1], 'utf8')));
} else if (!process.stdin.isTTY) {
  let buf = '';
  process.stdin.on('data', c => buf += c);
  process.stdin.on('end', () => grade(JSON.parse(buf || '[]')));
} else {
  console.log('stillos-edge-gate — grade a track record before risking capital.\n');
  console.log('  stillos-edge-gate mcp                 run as MCP server');
  console.log('  stillos-edge-gate grade <file.json>   grade a JSON track record');
  console.log('  cat trades.json | stillos-edge-gate   grade from stdin\n');
  console.log('verdicts: REAL_EDGE | REGIME_LUCK | NEGATIVE_EV | INSUFFICIENT_DATA');
  process.exit(2);
}
