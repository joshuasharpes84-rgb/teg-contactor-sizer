// Column (tower) cost engine: shell + platforms + internals + distributors, then bare-module and
// lifecycle present worth. Pure functions, US units, no DOM; usable from HTML tools and Node.
//
// Sources (see notes/06_column_and_internals_costing.md):
//   Seider, Seader, Lewin & Widagdo, Product and Process Design Principles, Sec. 16.5 (PDF pp.500-505):
//     Eq 16.54 vertical vessel, 16.57 tower, 16.56/16.58 platforms+ladders, 16.59 weight, 16.60 UG-27,
//     16.61 design pressure, 16.62 wind/seismic, min thickness + plate increments (p.466),
//     16.66-16.68 trays, 16.69 + Table 16.27 packings, $285/ft3 structured, $140/ft2 distributor.
//     Table 16.11: F_BM vertical pressure vessels 4.16. Basis CE = 567 (2013).
//   Peters, Timmerhaus & West 5th ed. p.795: "the cost for a distributor plate in a packed column may
//     be assumed to be the same as that for one bubble-cap tray" (second distributor estimate).
//   Allowable stress: ASME II-D 2013 Table 1A, SA-516-70 = 20.0 ksi to 500 F (transcribed in
//     Vessel Scale Up\asme_iid_stress.json); shell method mirrors Vessel Scale Up vessel().
//   CEPCI: scripts/capital_cost_estimation.py (2013 = 567.3 published; 2025 = 812 ESTIMATE).
//   Present worth: notes/03_profitability_analysis.md (NPV at MARR).
//   Bravo, CEP July 1997, via Rules of Thumb for Chemical Engineers 3rd ed. Table 12 (p.94): 304 SS internals
//     hardware incl. distributors, 1997 $, installation and removal factors. CE 1997 = 386.5 (Peters Table 6-2).

const COL_CE = { 1997: 386.5, 2013: 567.3, 2025: 812.0 };       // keep in sync with capital_cost_estimation.py
const COL_CE_BASE = 567, COL_CE_YEAR = 2025, COL_CE_ESTIMATE = true;
const COL_RHO_CS = 0.284;                           // lb/in3 (Seider 16.59)

// ---------------------------------------------------------------------------
// Shell: design pressure, thickness, weight
// ---------------------------------------------------------------------------
function colDesignP(Po) {                           // psig; Seider Eq 16.61 and text
  if (Po <= 5) return 10;
  if (Po <= 1000) { const l = Math.log(Po); return Math.exp(0.60608 + 0.91615 * l + 0.0015655 * l * l); }
  return 1.1 * Po;
}
function colTmin(D_ft) {                            // Seider p.466 minimum wall for rigidity
  return D_ft <= 4 ? 0.25 : D_ft <= 6 ? 5 / 16 : D_ft <= 8 ? 3 / 8 : D_ft <= 10 ? 7 / 16 : 0.5;
}
function colRoundPlate(t) {                         // Seider p.466 plate increments
  if (t <= 3 / 16) return 3 / 16;
  if (t <= 0.5) return Math.ceil(t * 16 - 1e-9) / 16;
  if (t <= 2) return Math.ceil(t * 8 - 1e-9) / 8;
  return Math.ceil(t * 4 - 1e-9) / 4;
}
// o: {D_ft, L_ft, P_psig, S_psi, CA_in, wind}
function colShell(o) {
  const Di = o.D_ft * 12, R = Di / 2, Lin = o.L_ft * 12, S = o.S_psi ?? 20000, CA = o.CA_in ?? 0.125;
  const Pd = colDesignP(o.P_psig), flags = [];
  let E = 0.85, tp = Pd * R / (S * E - 0.6 * Pd);  // UG-27 = Seider 16.60 (R = Di/2)
  if (tp > 1.25) { E = 1.0; tp = Pd * R / (S * E - 0.6 * Pd); }
  if (Pd > 0.385 * S * E) flags.push('Thick-wall regime (P > 0.385 SE): UG-27 thin-wall form out of range.');
  const Do = Di + 2 * tp;
  const tw = o.wind === false ? 0 : 0.22 * (Do + 18) * Lin * Lin / (S * Do * Do);   // Eq 16.62
  const tv = (tp + (tp + tw)) / 2;                  // average of top and bottom
  const tmin = colTmin(o.D_ft);
  const t = colRoundPlate(Math.max(tv, tmin) + CA);
  const W = Math.PI * (Di + t) * (Lin + 0.8 * Di) * t * COL_RHO_CS;               // Eq 16.59
  return { Pd, S, E, tp, tw, tv, tmin, CA, t, W, governs: tv >= tmin ? 'pressure' : 'minimum thickness', flags };
}

// ---------------------------------------------------------------------------
// Vessel purchase cost (CE 567): tower Eq 16.57 (primary) and vertical vessel Eq 16.54 (check)
// ---------------------------------------------------------------------------
function colVessel(W, D_ft, L_ft, FM = 1) {
  const lw = Math.log(W), flags = [];
  const CVt = Math.exp(10.5449 - 0.4672 * lw + 0.05482 * lw * lw);                // 9,000-2,500,000 lb
  const CVv = Math.exp(7.1390 + 0.18255 * lw + 0.02297 * lw * lw);                // 4,200-1,000,000 lb
  const CPLt = 341 * Math.pow(D_ft, 0.63316) * Math.pow(L_ft, 0.80161);           // 3-24 ft D, 27-170 ft L
  const CPLv = 410 * Math.pow(D_ft, 0.73960) * Math.pow(L_ft, 0.70684);           // 3-21 ft D, 12-40 ft L
  const tIn = W >= 9000 && W <= 2.5e6, vIn = W >= 4200 && W <= 1e6;
  const pltIn = D_ft >= 3 && D_ft <= 24 && L_ft >= 27 && L_ft <= 170, plvIn = D_ft >= 3 && D_ft <= 21 && L_ft >= 12 && L_ft <= 40;
  if (!tIn) flags.push(`Weight ${Math.round(W).toLocaleString()} lb outside the tower correlation (9,000–2,500,000 lb).`);
  if (!pltIn) flags.push(`Tower platform correlation out of range (3–24 ft D, 27–170 ft L); vertical-vessel form ${plvIn ? 'in range' : 'also out of range'}.`);
  // Primary: tower forms; where a tower form is out of range and the vessel form is in range, use the vessel form.
  const CV = tIn || !vIn ? CVt : CVv, CPL = pltIn || !plvIn ? CPLt : CPLv;
  return { CVt, CVv, CPLt, CPLv, CV, CPL, CVsrc: CV === CVt ? 'Eq 16.57 tower' : 'Eq 16.54 vertical vessel',
           CPLsrc: CPL === CPLt ? 'Eq 16.58 tower' : 'Eq 16.56 vertical vessel', FM, CP: FM * CV + CPL, flags };
}

// ---------------------------------------------------------------------------
// Internals (CE 567)
// ---------------------------------------------------------------------------
const COL_FTT = { sieve: 1.0, valve: 1.18, bubble: 1.87 };                        // Seider p.467
const COL_FTM = { cs: () => 1.0, ss303: D => 1.189 + 0.0577 * D, ss316: D => 1.401 + 0.0724 * D };
function colTrays(N, D_ft, type = 'bubble', mat = 'cs') {                         // Eqs 16.66-16.68
  const CBT = 468 * Math.exp(0.1482 * D_ft);
  const FNT = N >= 20 ? 1 : 2.25 / Math.pow(1.0414, N);
  const FTM = COL_FTM[mat](D_ft);
  const flags = D_ft < 2 || D_ft > 16 ? ['Tray correlation valid for 2–16 ft diameter (extrapolated).'] : [];
  return { CBT, FNT, FTT: COL_FTT[type], FTM, perTray: FNT * COL_FTT[type] * FTM * CBT, CT: N * FNT * COL_FTT[type] * FTM * CBT, flags };
}
// Seider Table 16.27 installed $/ft3 (CE 567), Pall rings; structured corrugated sheet SS $285/ft3
const COL_PACK = {
  pall25: { cs: 56, ss: 160, pp: 50 }, pall38: { cs: 42, ss: 130, pp: 30 }, pall50: { cs: 36, ss: 100, pp: 20 },
  berl25: { ceramic: 50 }, berl38: { ceramic: 40 }, berl50: { ceramic: 32 },
  intalox25: { ceramic: 40, pp: 42 }, intalox38: { ceramic: 40 }, intalox50: { ceramic: 30, pp: 26 },
  raschig25: { cs: 50, ss: 150, ceramic: 20 }, raschig38: { cs: 50, ss: 116, ceramic: 20 }, raschig50: { cs: 30, ss: 80, ceramic: 20 },
  structured: { ss: 285 },
};
// Seider Table 16.27 in full (installed $/ft3, CE 567), by Seider family, material and nominal size (in).
const SEIDER_1627 = {
  berl: { ceramic: { 1: 50, 1.5: 40, 2: 32 } },
  raschig: { cs: { 1: 50, 1.5: 50, 2: 30, 3: 30 }, ss: { 1: 150, 1.5: 116, 2: 80, 3: 80 }, ceramic: { 1: 20, 1.5: 20, 2: 20, 3: 20 } },
  intalox: { ceramic: { 1: 40, 1.5: 40, 2: 30, 3: 22 }, pp: { 1: 42, 2: 26, 3: 14 } },
  pall: { cs: { 1: 56, 1.5: 42, 2: 36 }, ss: { 1: 160, 1.5: 130, 2: 100 }, pp: { 1: 50, 1.5: 30, 2: 20, 3: 18 } },
  cmr: { ss: { 1: 130, 1.5: 100, 2: 80, 3: 60, 4: 50 }, ceramic: { 1: 90, 2: 80, 3: 50 }, pp: { 1: 90, 2: 80, 3: 50 } },
  tellerettes: { pe: { 1: 100 } },
};
function colRandomPrice(family, mat, nom) {
  const v = SEIDER_1627[family]?.[mat]?.[nom];
  return v === undefined ? NaN : v;
}
function colPacking(key, mat, D_ft, H_ft, priceOverride) {
  const row = COL_PACK[key] || {}, c = priceOverride !== undefined ? priceOverride : row[mat];
  const V = Math.PI * D_ft * D_ft / 4 * H_ft;
  const flags = c === undefined ? [`No Seider installed cost for ${key} in ${mat} (structured: stainless only, "not normally available in carbon steel").`] : [];
  return { V, perFt3: Number.isFinite(c) ? c : NaN, CPK: V * (Number.isFinite(c) ? c : NaN), flags: Number.isFinite(c) ? [] : flags };
}
// Distributors: Seider $140/ft2 of column area (high-performance, installed); Peters: one bubble-cap tray
function colDistributor(D_ft, n = 1, trayMat = 'cs') {
  const A = Math.PI * D_ft * D_ft / 4;
  const seider = 140 * A * n;
  const peters = colTrays(1, D_ft, 'bubble', trayMat).perTray * n;               // Peters rule, priced with Seider trays
  return { A, seider, peters, lo: Math.min(seider, peters), hi: Math.max(seider, peters) };
}

// ---------------------------------------------------------------------------
// Escalation, bare module, present worth
// ---------------------------------------------------------------------------
const colEsc = c => c * COL_CE[COL_CE_YEAR] / COL_CE_BASE;
const colEscFrom = (c, year) => c * COL_CE[COL_CE_YEAR] / COL_CE[year];

// Bravo / Rules of Thumb Table 12 (1997 $, 304 SS). Returns installed cost range escalated to CE 567 so it sits
// on the same basis as Seider before colEsc. Structured: packings of 100-250 m2/m3 with high-performance
// distributors; install 0.5-0.8 x hardware. HP trays: install 1.0-1.4 x hardware (same spacing).
function colBravo(kind, D_ft, n, Nb = 1) {
  const hw = kind === 'structured' ? D_ft * D_ft * (79 * n + 160 * (2 * Nb - 1)) : D_ft * D_ft * (52 * n + 160);
  const f = kind === 'structured' ? [1.5, 1.8] : [2.0, 2.4];
  const to567 = c => c * COL_CE_BASE / COL_CE[1997];
  return { hw1997: hw, lo: to567(f[0] * hw), hi: to567(f[1] * hw), removal: to567(0.1 * hw) };
}
const COL_FBM = 4.16;                                                              // Table 16.11 vertical pressure vessels
function colPW(annual, i, n) { return i === 0 ? annual * n : annual * (1 - Math.pow(1 + i, -n)) / i; }
function colPWsingle(cost, i, year) { return cost / Math.pow(1 + i, year); }

// Whole column. o: {D_ft, H_int_ft, allow_ft, P_psig, S_psi, CA_in, FM, internals:{kind:'trays'|'packing', ...},
//                   distributors, life_yr, i, maintFrac, replaceEvery_yr}
function colCost(o) {
  const L = o.H_int_ft + o.allow_ft;
  const sh = colShell({ D_ft: o.D_ft, L_ft: L, P_psig: o.P_psig, S_psi: o.S_psi, CA_in: o.CA_in });
  const vs = colVessel(sh.W, o.D_ft, L, o.FM ?? 1);
  let internals, dist = { lo: 0, hi: 0, seider: 0, peters: 0 };
  if (o.internals.kind === 'trays') internals = colTrays(o.internals.N, o.D_ft, o.internals.type, o.internals.mat);
  else { internals = colPacking(o.internals.key, o.internals.mat, o.D_ft, o.H_int_ft, o.internals.price); dist = colDistributor(o.D_ft, o.distributors ?? 1, o.internals.trayMat ?? 'cs'); }
  const Cint = o.internals.kind === 'trays' ? internals.CT : internals.CPK;
  // Second estimate for structured packing (Bravo, distributors included): widens the internals range
  // Bravo's rule covers corrugated sheet of 100-250 m2/m3 (Rules of Thumb Table 12); outside that, Seider only
  const bravo = o.internals.kind === 'packing' && o.internals.key === 'structured' && (o.internals.a === undefined || (o.internals.a >= 100 && o.internals.a <= 250))
    ? colBravo('structured', o.D_ft, o.H_int_ft) : null;
  const intLo = bravo ? Math.min(Cint + dist.lo, bravo.lo) : Cint + dist.lo;
  const intHi = bravo ? Math.max(Cint + dist.hi, bravo.hi) : Cint + dist.hi;
  const CP567 = { lo: vs.CP + intLo, hi: vs.CP + intHi };                       // Eq 16.69 / 16.52 + 16.66
  const CP = { lo: colEsc(CP567.lo), hi: colEsc(CP567.hi) };
  const BM = { lo: CP.lo * COL_FBM, hi: CP.hi * COL_FBM };
  // Lifecycle: present worth of maintenance (fraction of BM per year) + internals replacement events.
  // Each event = new installed internals + removal at 0.1 x new hardware (Bravo factors span 0.07-0.2).
  const repl = colEsc((intLo + intHi) / 2 * 1.1);
  let replPW = 0, events = 0;
  if (o.replaceEvery_yr && Number.isFinite(o.replaceEvery_yr))
    for (let y = o.replaceEvery_yr; y < o.life_yr - 1e-9; y += o.replaceEvery_yr) { replPW += colPWsingle(repl, o.i, y); events++; }
  const maint = f => colPW(f * (BM.lo + BM.hi) / 2, o.i, o.life_yr);
  const maintLo = maint(o.maintFrac[0]), maintHi = maint(o.maintFrac[1]);
  const LC = { lo: BM.lo + maintLo + replPW, hi: BM.hi + maintHi + replPW };
  return { L, sh, vs, internals, Cint, dist, bravo, intLo, intHi, CP567, CP, BM, repl, replPW, events, maintLo, maintHi, LC,
           flags: [...sh.flags, ...vs.flags, ...(internals.flags || [])] };
}

if (typeof module !== 'undefined') module.exports = {
  COL_CE, COL_CE_BASE, COL_CE_YEAR, COL_CE_ESTIMATE, COL_FBM, COL_FTT, COL_PACK, colDesignP, colTmin, colRoundPlate,
  SEIDER_1627, colRandomPrice, colShell, colVessel, colTrays, colPacking, colDistributor, colEsc, colEscFrom, colBravo, colPW, colPWsingle, colCost,
};
