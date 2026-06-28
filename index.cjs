'use strict';
/*
 * stillos-edge-gate — the edge-rejection layer.
 *
 * "A real edge is not a prediction; it is a repeatable, out-of-sample, fee-adjusted
 *  decision advantage that survives when the regime changes." Everything else is
 *  evidence until it proves it survives live.
 *
 * gradeStrategy(trades, opts) -> ONE verdict:
 *   REAL_EDGE | REGIME_LUCK | NEGATIVE_EV | INSUFFICIENT_DATA
 *
 * Pure + deterministic. Zero dependencies. Fail-closed.
 */

const DEFAULTS = {
  fee_rate: 0.07,      // fee ≈ fee_rate * p * (1-p) per contract (Kalshi-style)
  slippage: 0.005,     // conservative per-contract slippage (prob units)
  min_n: 30,           // total settled trades required to judge
  min_split_n: 10,     // each of train/test must have at least this many
  test_frac: 0.30,     // most-recent fraction held out
  t_stat_min: 1.5,     // fee-adjusted EV significance bar
};

function netPnl(trade, cfg) {
  const price = Number(trade.price);
  const gross = trade.outcome === 1 ? (1 - price) : -price;
  const fee = cfg.fee_rate * price * (1 - price) + cfg.slippage;
  return gross - fee;
}
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function std(a) {
  if (a.length < 2) return null;
  const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function summarize(trades, cfg) {
  if (!trades.length) return { n: 0, wr: null, ev_net: null, total_net: null };
  const nets = trades.map(t => netPnl(t, cfg));
  return {
    n: trades.length,
    wr: +(trades.filter(t => t.outcome === 1).length / trades.length).toFixed(3),
    ev_net: +mean(nets).toFixed(4),
    total_net: +nets.reduce((s, x) => s + x, 0).toFixed(2),
  };
}

function gradeStrategy(rawTrades, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const trades = (rawTrades || [])
    .filter(t => t && (t.outcome === 0 || t.outcome === 1) && isFinite(Number(t.price)) && Number(t.price) > 0 && Number(t.price) < 1)
    .sort((a, b) => String(a.t || '').localeCompare(String(b.t || '')));

  const reasons = [];
  const all = summarize(trades, cfg);
  const base = { n: trades.length, config: cfg, overall: all };

  if (trades.length < cfg.min_n)
    return { verdict: 'INSUFFICIENT_DATA', ...base, reasons: [`only ${trades.length} valid settled trades; need >= ${cfg.min_n}`] };

  const k = Math.floor(trades.length * (1 - cfg.test_frac));
  const train = trades.slice(0, k), test = trades.slice(k);
  const trS = summarize(train, cfg), teS = summarize(test, cfg);

  if (train.length < cfg.min_split_n || test.length < cfg.min_split_n)
    return { verdict: 'INSUFFICIENT_DATA', ...base, train: trS, test: teS,
      reasons: [`split too thin (train ${train.length}, test ${test.length}); need >= ${cfg.min_split_n} each`] };

  const nets = trades.map(t => netPnl(t, cfg));
  const s = std(nets), t_stat = (s && s > 0) ? +(mean(nets) / (s / Math.sqrt(nets.length))).toFixed(2) : 0;
  const result = { ...base, train: trS, test: teS, t_stat, window: { from: trades[0].t, to: trades[trades.length - 1].t } };

  if (all.ev_net <= 0 && teS.ev_net <= 0) {
    reasons.push(`fee-adjusted EV negative overall (${all.ev_net}/trade) and out-of-sample (${teS.ev_net}/trade) — loses money live`);
    return { verdict: 'NEGATIVE_EV', ...result, reasons };
  }
  if (trS.ev_net > 0 && teS.ev_net <= 0) {
    reasons.push(`+EV in-sample (${trS.ev_net}) but collapses out-of-sample (${teS.ev_net}) — does not survive regime change`);
    return { verdict: 'REGIME_LUCK', ...result, reasons };
  }
  if (trS.ev_net > 0 && teS.ev_net > 0 && t_stat >= cfg.t_stat_min) {
    reasons.push(`+EV in BOTH splits (train ${trS.ev_net}, test ${teS.ev_net}) after fees, t=${t_stat} >= ${cfg.t_stat_min}`);
    return { verdict: 'REAL_EDGE', ...result, reasons };
  }
  reasons.push(`+EV both splits but t=${t_stat} < ${cfg.t_stat_min} — not yet distinguishable from luck`);
  return { verdict: 'REGIME_LUCK', ...result, reasons };
}

module.exports = { gradeStrategy, summarize, netPnl, DEFAULTS };
