'use strict';
// Minimal self-test: all four verdicts must fire correctly. Run: npm test
const { gradeStrategy } = require('./index.cjs');
let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) { pass++; console.log(`  ok   ${name}: ${got}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${got}, want ${want}`); }
}
const mk = (n, winEvery, price = 0.6, side = 'no', month = 5) =>
  Array.from({ length: n }, (_, i) => ({ t: `2026-0${month}-${String(1 + (i % 27)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`, price, side, outcome: (i % winEvery !== 0) ? 1 : 0 }));

check('INSUFFICIENT_DATA', gradeStrategy(mk(12, 2)).verdict, 'INSUFFICIENT_DATA');
check('REAL_EDGE', gradeStrategy(mk(120, 4)).verdict, 'REAL_EDGE'); // 75% win @0.60 NO, stable
// regime: +EV first 84, -EV last 36
const reg = [...mk(84, 5, 0.6, 'no', 5), ...Array.from({ length: 36 }, (_, i) => ({ t: `2026-06-${String(1 + i % 27).padStart(2, '0')}T00:00`, price: 0.6, side: 'no', outcome: i % 5 < 2 ? 1 : 0 }))];
check('REGIME_LUCK', gradeStrategy(reg).verdict, 'REGIME_LUCK');
// negative EV: 55% win @0.60 NO -> loses after fees
check('NEGATIVE_EV', gradeStrategy(mk(120, 100, 0.6, 'no').map((t, i) => ({ ...t, outcome: i % 20 < 11 ? 1 : 0 }))).verdict, 'NEGATIVE_EV');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
