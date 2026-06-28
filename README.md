# stillos-edge-gate

**A callable trust primitive. Grade a track record *before* you commit capital.**

A real edge is not a prediction — it is a repeatable, out-of-sample, fee-adjusted
decision advantage that survives a regime change. This tells you, in one word, whether
a strategy has one:

```
REAL_EDGE | REGIME_LUCK | NEGATIVE_EV | INSUFFICIENT_DATA
```

Fail-closed: anything that isn't a surviving, fee-adjusted, regime-stable edge is rejected.
Every verdict ships with a signed, independently verifiable receipt.

## Install
```bash
npx stillos-edge-gate grade trades.json
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

## Library
```js
const { gradeStrategy } = require('stillos-edge-gate');
const v = gradeStrategy(trades); // { verdict, train, test, t_stat, reasons }
```

MIT. https://nolawealthfinancial.com/notary
