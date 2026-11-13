# stillos-edge-gate

[![npm downloads](https://img.shields.io/npm/dw/stillos-edge-gate.svg)](https://www.npmjs.com/package/stillos-edge-gate)
[![npm version](https://img.shields.io/npm/v/stillos-edge-gate.svg)](https://www.npmjs.com/package/stillos-edge-gate)

**A callable trust primitive. Grade a track record *before* you commit capital.**

A real edge is not a prediction — it is a repeatable, out-of-sample, fee-adjusted
decision advantage that survives a regime change. This tells you, in one word, whether
a strategy has one:

```
REAL_EDGE | REGIME_LUCK | NEGATIVE_EV | INSUFFICIENT_DATA
```

Fail-closed: anything that isn't a surviving, fee-adjusted, regime-stable edge is rejected.
Every verdict ships with a signed, independently verifiable receipt.

## Try it now — no file needed
```bash
npx stillos-edge-gate demo
```
Runs on bundled sample data and prints a real verdict — REAL_EDGE, REGIME_LUCK,
NEGATIVE_EV, or INSUFFICIENT_DATA — computed live, nothing to set up first. The
demo verdict is unsigned (a free preview); it can't be shown to a counterparty as
proof. A signed, independently-verifiable receipt is $0.05 USDC via x402, no
signup — or $1 by card if you don't hold crypto.

## Install
```bash
npx stillos-edge-gate grade trades.json
# add --agent <name> to tag the receipt as you, not an anonymous caller
npx stillos-edge-gate grade trades.json --agent your-handle
```
or add as an MCP server (Claude Desktop / any MCP client):
```json
{ "mcpServers": { "stillos-edge-gate": { "command": "npx", "args": ["stillos-edge-gate", "mcp"] } } }
```

## Input
```json
[ { "t": "2026-06-01T12:00:00Z", "price": 0.62, "side": "no", "outcome": 1 }, ... ]
```
`price` = entry price 0..1 · `side` = yes|no · `outcome` = 1 won / 0 lost.

## How it decides
- chronological **70/30 out-of-sample holdout** (most-recent 30% is the test)
- **fee + slippage** adjusted per trade
- **significance test** (t ≥ 1.5) on fee-adjusted EV
- `REAL_EDGE` only if +EV in **both** splits after fees, significant.

## Why trust it
We ran it on our own live trading book first. It returned **NEGATIVE_EV** — and we
published the signed receipt. We don't sell edges; we tell you whether yours is real.

## Sample output
This is a real, live **paid** receipt from the `/grade-strategy` endpoint — not a mockup.
Verify it yourself, no account needed:

```json
{
  "verdict": "NEGATIVE_EV",
  "n": 120,
  "overall": { "wr": 0.55, "ev_net": -0.0718, "total_net": -8.62 },
  "train":   { "wr": 0.524, "ev_net": -0.098,  "total_net": -8.23 },
  "test":    { "wr": 0.611, "ev_net": -0.0107, "total_net": -0.38 },
  "t_stat": -1.57,
  "reasons": ["fee-adjusted EV negative overall (-0.0718/trade) and out-of-sample (-0.0107/trade) — loses money live"],
  "receipt_hash": "16ef2180d18359e1449062d0b6fb8cf780a2e6dfd2cb5ae201fce64cb4e7f59a",
  "verify": "https://stillosdigitalholdings.com/notary/verify?hash=16ef2180d18359e1449062d0b6fb8cf780a2e6dfd2cb5ae201fce64cb4e7f59a"
}
```

`verify` resolves independently of us — `hash_intact` and `signature_valid` are recomputed
on every request, not read from a cache.

The **free** tier returns the same verdict/train/test/reasons fields but no proof:
`"tier": "free", "signed": false, "receipt_hash": null, "signature": null` — enough to
decide whether to trust the edge, not enough to show anyone else that you did.

## Library
```js
const { gradeStrategy } = require('stillos-edge-gate');
const v = gradeStrategy(trades); // { verdict, train, test, t_stat, reasons }
```

MIT. https://stillosdigitalholdings.com/notary
