// Validation of column_cost_engine.js against Seider worked examples (CE 567 basis before escalation).
// Run: node column_cost_check.js
const C = require('./column_cost_engine.js');

const rows = [];
const chk = (name, got, want, tol) => rows.push([name, got, want, Math.abs(got / want - 1) <= tol ? 'ok' : 'FAIL']);

// Example 16.13: 10 ft ID x 212 ft T-T, 95.5 psig, 200 F design, CS at S = 15,000 psi, 100 sieve trays
const sh = C.colShell({ D_ft: 10, L_ft: 212, P_psig: 95.5, S_psi: 15000, CA_in: 0.125 });
chk('Ex 16.13 design pressure, psig', sh.Pd, 123, 0.01);
chk('Ex 16.13 pressure thickness tP, in', sh.tp, 0.582, 0.01);
chk('Ex 16.13 wind thickness tW, in', sh.tw, 0.889, 0.03);            // Seider assumes Do = 122.5 in; engine uses Di + 2 tP
chk('Ex 16.13 plate thickness tS, in', sh.t, 1.25, 0.001);
chk('Ex 16.13 weight W, lb', sh.W, 356800, 0.005);
const vs = C.colVessel(356800, 10, 212);
chk('Ex 16.13 tower cost CV, $', vs.CVt, 753400, 0.005);
chk('Ex 16.13 platforms CPL, $', vs.CPLt, 107300, 0.005);
const tr = C.colTrays(100, 10, 'sieve', 'cs');
chk('Ex 16.13 base tray cost CBT, $', tr.CBT, 2060, 0.005);

// Example 16.14 (packing and distributor unit costs only; the vacuum shell method is not implemented)
const pk = C.colPacking('structured', 'ss', 14, 15);
chk('Ex 16.14 structured packing volume, ft3', pk.V, 2310, 0.005);
chk('Ex 16.14 distributor, 14 ft column, $', C.colDistributor(14, 1).seider, 154 * 140, 0.01);

console.table(rows.map(([n, g, w, s]) => ({ check: n, engine: +g.toPrecision(5), seider: w, result: s })));
if (rows.some(r => r[3] !== 'ok')) process.exit(1);
