// TEG contactor engine: GPSA basis data -> Kremser (estimate 1) -> HTU/NTU (estimate 2).
// SI internally; US units at the boundaries. Pure functions; no DOM.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MW_W = 18.015, MW_TEG = 150.17;          // GPSA Fig 20-42 (TEG 150.2)
const SCF_PER_LBMOL = 379.49;                  // 60 F, 14.696 psia
const MOL_PER_SM3 = 42.29;                     // 15 C, 101.325 kPa (GPSA Sm3)
const LB_KG = 0.45359237, GAL_L = 3.785411784, FT_M = 0.3048;
const G = 9.80665, R = 8.314462;
const F_TO_C = f => (f - 32) / 1.8;
const PSIG_TO_KPA = p => (p + 14.696) * 6.894757;

// ---------------------------------------------------------------------------
// GPSA Fig 20-3 (McKetta-Wehe) -- digitized from the PDF vector paths
// chart x = piecewise map of T; chart y = log10(W) linear; isobars straight
// ---------------------------------------------------------------------------
const F203 = {
  VX: [134.91,149.95,164.83,178.37,191.12,203.45,215.56,227.38,238.64,249.4,259.73,269.28,278.96,287.72,297.06,305.97,314.52,322.92,330.68,338.09,345.57,352.99,360.03,366.59,373.5,379.7,385.89,391.73,397.36,403.21,408.69,413.75,418.8,423.65,428.86,433.76,438.68,443.31,447.87,452.44],
  TT: Array.from({length: 40}, (_, i) => -50 + 5 * i),
  yRef: 462.76, decade: 116.28,
  iso: [[3000,-1.636746046265412,970.4241664166003],[4000,-1.6345815008548856,982.639534006104],
        [5000,-1.6194740014818485,985.7065237448712],[6000,-1.6129680218146911,989.4521656196887],
        [8000,-1.6052509105508364,996.4569445650898],[10000,-1.5906726596469203,999.1717717523003],
        [15000,-1.5463592449904888,997.1418979722828]],
};

function interp(x, xs, ys) {           // linear, end-segment extrapolation
  let i = 0;
  if (xs[0] > xs[xs.length - 1]) { xs = xs.slice().reverse(); ys = ys.slice().reverse(); }
  if (x <= xs[0]) i = 0;
  else if (x >= xs[xs.length - 1]) i = xs.length - 2;
  else while (x > xs[i + 1]) i++;
  return ys[i] + (x - xs[i]) * (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
}

// Saturated water content, mg/Sm3, sweet gas (metastable liquid below hydrate line)
function waterContent(T_C, P_kPa, Cg = 1) {
  const x = interp(T_C, F203.TT, F203.VX);
  const W = ([, a, b]) => Math.pow(10, 3 + (F203.yRef - (a * x + b)) / F203.decade);
  const iso = F203.iso;
  let j = 0;
  while (j < iso.length - 2 && P_kPa > iso[j + 1][0]) j++;
  const f = Math.log(P_kPa / iso[j][0]) / Math.log(iso[j + 1][0] / iso[j][0]);
  const lnW = Math.log(W(iso[j])) + f * (Math.log(W(iso[j + 1])) - Math.log(W(iso[j])));
  return Cg * Math.exp(lnW);
}
const mgSm3ToY = W => W / (MW_W * 1000 * MOL_PER_SM3);
const lbMMSCFToY = W => W * SCF_PER_LBMOL / (MW_W * 1e6);
const yToLbMMSCF = y => y * MW_W * 1e6 / SCF_PER_LBMOL;

// ---------------------------------------------------------------------------
// GPSA Fig 20-54 (Parrish, Won & Baltatu 1986) -- straight lines, vector-digitized
// [mass% TEG, Td at 24.443 C, Td at 59.446 C]
// ---------------------------------------------------------------------------
const F2054 = { T0: 24.443, T1: 59.446, lines: [
  [95.0, -1.125, 30.541], [98.0, -12.763, 16.107], [98.5, -16.688, 11.100],
  [99.0, -21.650, 5.010], [99.5, -30.581, -6.087], [99.9, -48.308, -27.739],
  [99.95, -54.984, -35.588], [99.97, -59.991, -41.678], [99.99, -69.418, -52.773]] };

function dewpointOverTEG(wTEG, Tc_C) {
  const u = F2054.lines.map(l => Math.log10(100 - l[0]));
  const td = F2054.lines.map(l => l[1] + (Tc_C - F2054.T0) * (l[2] - l[1]) / (F2054.T1 - F2054.T0));
  return interp(Math.log10(100 - wTEG), u, td);
}
const xFromW = w => ((100 - w) / MW_W) / ((100 - w) / MW_W + w / MW_TEG);   // w = mass% TEG
const wFromX = x => 100 * (1 - x) * MW_TEG / ((1 - x) * MW_TEG + x * MW_W);

// Equilibrium gas-phase water mole fraction over TEG solution with water mole fraction x
function yStar(x, B) {
  const w = wFromX(x);
  const Td = dewpointOverTEG(w, B.T_C);
  return mgSm3ToY(waterContent(Td, B.P_kPa, B.Cg));
}

// ---------------------------------------------------------------------------
// TEG liquid properties: GPSA Fig 20-42 pure TEG, interpolated to T
// rho linear in T; mu Andrade (ln mu vs 1/T); sigma at 25 C only
// ---------------------------------------------------------------------------
function tegProps(T_C) {
  const T = T_C + 273.15, T1 = 298.15, T2 = 333.15;
  const rho = 1119 + (T_C - 25) * (1092 - 1119) / 35;
  const lnmu = Math.log(37.3) + (1 / T - 1 / T1) * (Math.log(8.77) - Math.log(37.3)) / (1 / T2 - 1 / T1);
  return { rho, mu: Math.exp(lnmu) * 1e-3, sigma: 0.045 };
}

// ---------------------------------------------------------------------------
// Dry-gas properties at P, T
//   rho: PC-SAFT (EOS workflow step 5 pick) on a grid from gas_property_grid.py, bilinear in P and T
//   mu : Lee-Gonzalez-Eakin (GAP-FILL), from rho, T and MW
// ---------------------------------------------------------------------------
function gasRho(P_psig, T_F) {
  const g = typeof GAS_GRID !== 'undefined' ? GAS_GRID : null;
  if (!g) return 57.44;                          // 1000 psig / 100 F basis value if the grid is absent
  const col = T => interp(P_psig, g.P_psig, g.rho[T]);
  let i = 0;
  while (i < g.T_F.length - 2 && T_F > g.T_F[i + 1]) i++;
  const f = (T_F - g.T_F[i]) / (g.T_F[i + 1] - g.T_F[i]);
  return col(i) + f * (col(i + 1) - col(i));
}
function muLGE(rho, T_F, MW) {                     // Pa s; rho kg/m3
  const TR = T_F + 459.67;
  const K = (9.4 + 0.02 * MW) * Math.pow(TR, 1.5) / (209 + 19 * MW + TR);
  const X = 3.5 + 986 / TR + 0.01 * MW, Y = 2.4 - 0.2 * X;
  return 1e-4 * K * Math.exp(X * Math.pow(rho / 1000, Y)) * 1e-3;
}

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------
function basis(o = {}) {
  const B = Object.assign({ Q_MMSCFD: 25, P_psig: 1000, T_F: 100, Wout_lb: 7, Cg: 1.0, gasMW: 18.33 }, o);
  if (B.rhoG === undefined) B.rhoG = gasRho(B.P_psig, B.T_F);
  if (B.muG === undefined) B.muG = muLGE(B.rhoG, B.T_F, B.gasMW);
  B.T_C = F_TO_C(B.T_F); B.P_kPa = PSIG_TO_KPA(B.P_psig);
  B.Vdry = B.Q_MMSCFD * 1e6 / SCF_PER_LBMOL * LB_KG / 24 / 3600;   // kmol/s dry gas
  B.Win_mg = waterContent(B.T_C, B.P_kPa, B.Cg);
  B.yin = mgSm3ToY(B.Win_mg);
  B.yout = lbMMSCFToY(B.Wout_lb);
  B.Yin = B.yin / (1 - B.yin); B.Yout = B.yout / (1 - B.yout);
  B.water_kgs = B.Vdry * (B.Yin - B.Yout) * MW_W;                     // removed, kg/s
  B.Ea = (B.Yin - B.Yout) / B.Yin;
  B.liq = tegProps(B.T_C);
  return B;
}

// Lean solvent from circulation (gal lean solution per lb water removed)
function solvent(B, wLean, galPerLb, removed_kgs = B.water_kgs) {
  const Vl = galPerLb * GAL_L / 1000 / LB_KG * removed_kgs;        // m3/s lean solution
  const m = Vl * B.liq.rho;                                         // kg/s
  const nTEG = m * wLean / 100 / MW_TEG, nW = m * (1 - wLean / 100) / MW_W;
  return { Vl, m, Lp: nTEG, X0: nW / nTEG, x0: nW / (nTEG + nW), L0: nTEG + nW };
}

// ---------------------------------------------------------------------------
// Estimate 1 -- Kremser (deck slides 29, 34, 37)
// ---------------------------------------------------------------------------
function kremserA(B, S, Yout, avg) {
  const XN = S.X0 + B.Vdry * (B.Yin - Yout) / S.Lp;
  const xN = XN / (1 + XN);
  const Ktop = yStar(S.x0, B) / S.x0, Kbot = yStar(xN, B) / xN;
  const Atop = S.L0 / (Ktop * B.Vdry * (1 + Yout));
  const Abot = S.Lp * (1 + XN) / (Kbot * B.Vdry * (1 + B.Yin));
  const A = avg === 'top' ? Atop : avg === 'bottom' ? Abot : Math.sqrt(Atop * Abot);
  return { A, Atop, Abot, Ktop, Kbot, xN, wRich: wFromX(xN), y0s: yStar(S.x0, B) };
}

function kremserDesign(B, wLean, galPerLb, avg = 'geo') {
  const S = solvent(B, wLean, galPerLb);
  const k = kremserA(B, S, B.Yout, avg);
  const r = { S, ...k, feasible: B.yout > k.y0s };
  if (!r.feasible) { r.N = Infinity; return r; }
  const ratio = (B.yin - k.y0s) / (B.yout - k.y0s), A = k.A;
  r.N = Math.abs(A - 1) < 1e-9 ? ratio - 1 : Math.log(ratio * (1 - 1 / A) + 1 / A) / Math.log(A);
  r.pinchLean = k.y0s / B.yout;
  return r;
}

// Rating: given N and circulation (per lb water ABSORBED, GPSA convention), find outlet water
function kremserRate(B, wLean, galPerLb, N, avg = 'geo') {
  let Yout = B.Yout, k, S;
  for (let it = 0; it < 60; it++) {
    S = solvent(B, wLean, galPerLb, B.Vdry * (B.Yin - Yout) * MW_W);
    k = kremserA(B, S, Yout, avg);
    const A = k.A, phi = Math.abs(A - 1) < 1e-9 ? N / (N + 1) : (Math.pow(A, N + 1) - A) / (Math.pow(A, N + 1) - 1);
    const yo = B.yin - phi * (B.yin - k.y0s);
    const Ynew = yo / (1 - yo);
    if (Math.abs(Ynew - Yout) < 1e-12) { Yout = Ynew; break; }
    Yout = 0.5 * Yout + 0.5 * Ynew;
  }
  const yo = Yout / (1 + Yout);
  return { yout: yo, removal: (B.yin - yo) / B.yin, A: k.A, wRich: k.wRich, S };
}

// ---------------------------------------------------------------------------
// Estimate 2 -- HTU/NTU (deck slides 32, 36): NOG over the real equilibrium curve
// ---------------------------------------------------------------------------
function nog(B, S) {
  const n = 400, Yin = B.Yin, Yout = B.Yout;
  const f = Y => {
    const X = S.X0 + B.Vdry * (Y - Yout) / S.Lp;
    const y = Y / (1 + Y), ys = yStar(X / (1 + X), B);
    return { g: 1 / ((y - ys) * (1 + Y) * (1 + Y)), drive: y - ys };   // dy = dY/(1+Y)^2
  };
  let sum = 0, minDrive = Infinity;
  const h = (Yin - Yout) / n;
  for (let i = 0; i <= n; i++) {
    const v = f(Yout + i * h);
    if (v.drive <= 0) return { NOG: Infinity, pinch: true };
    minDrive = Math.min(minDrive, v.drive);
    sum += v.g * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return { NOG: sum * h / 3, pinch: false, minDrive };
}

// Graphical stage count on the real equilibrium curve (McCabe-Thiele, mole ratios), top down
function stepStages(B, S, maxN = 30) {
  const opX = Y => S.X0 + B.Vdry * (Y - B.Yout) / S.Lp;               // operating line X(Y)
  const eqX = Y => {                                                   // invert y*(x) by bisection
    let lo = 1e-6, hi = 0.6, yt = Y / (1 + Y);
    for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); (yStar(m, B) < yt ? lo = m : hi = m); }
    const x = 0.5 * (lo + hi); return x / (1 - x);
  };
  const steps = []; let Y = B.Yout;
  for (let n = 1; n <= maxN; n++) {
    const X = eqX(Y);                                                  // liquid leaving stage n
    const Ynext = B.Yout + (X - S.X0) * S.Lp / B.Vdry;                 // gas entering stage n
    steps.push({ Y, X, Ynext });
    if (Ynext >= B.Yin) { const frac = (B.Yin - Y) / (Ynext - Y); return { N: n - 1 + frac, steps }; }
    Y = Ynext;
  }
  return { N: Infinity, steps };
}

// ---------------------------------------------------------------------------
// Packing data (sourced) -- metal Pall rings
//   a, voids, Fp: Perry's 8th Table 14-13 (Fp also Ludwig Table 9-26A: 56/40/27 ft-1)
//   alpha, beta : Ludwig Table 9-33A (Leva form), metal Pall rings
//   maxLoad     : Ludwig Table 9-27 (Strigle), gpm/ft2
// ---------------------------------------------------------------------------
//   Families added 2026-10-27 (user: "is Pall the only random packing?"): every packing with a complete
//   data set at 1/1.5/2 in -- Perry's 8th Table 14-13 (a, voids, Fp) AND Ludwig Table 9-33A (Leva alpha,
//   beta). Ceramic Intalox and Raschig have no 38 mm row in Table 14-13, so only 1 and 2 in exist here.
//   Plastic Pall 1.5 in pairs Ludwig's 1-3/8 in constants with Perry's 40 mm row (flagged).
//   mat: 'metal' (wetting surface from the internals-material input), 'ceramic' (unglazed, Table 9-25),
//   'plastic' (polypropylene, Table 9-25). nom: nominal inches (Table 9-27 max load, Seider cost keys).
// Full random catalog (2026-10-27, user: "comprehensive drop-down menus"): every Perry's 8th Table 14-13 row
// with a normal packing factor. Rows with Ludwig Table 9-33A Leva constants (alpha, beta) keep the deck's Leva
// hydraulics; the rest use the Kister-Gill / Strigle GPDC for random packing (Perry's 9th Fig 14-55, proposed deck
// step). Row: [key, fam, mat, nominal in, size label, a m2/m3, voids %, Fp m-1, alpha, beta, note]. '#' sizes take
// the number as nominal inches (flagged). maxLoad from Ludwig Table 9-27 interpolated on nominal size.
const RANDOM_ROWS = [
  ['pall16', 'pall', 'metal', 0.625, '16 mm', 360, 92, 256, 0.43, 0.17], ['pall25', 'pall', 'metal', 1, '25 mm', 205, 94, 183, 0.15, 0.15],
  ['pall38', 'pall', 'metal', 1.5, '38 mm', 130, 95, 131, 0.08, 0.16], ['pall50', 'pall', 'metal', 2, '50 mm', 105, 96, 89, 0.06, 0.12],
  ['pall90', 'pall', 'metal', 3.5, '90 mm', 66, 97, 59],
  ['imtp25', 'imtp', 'metal', 1, '25 mm', 207, 97, 134], ['imtp40', 'imtp', 'metal', 1.5, '40 mm', 151, 97, 79],
  ['imtp50', 'imtp', 'metal', 2, '50 mm', 98, 98, 59], ['imtp70', 'imtp', 'metal', 2.75, '70 mm', 60, 98, 39],
  ['nutter1', 'nutter', 'metal', 1, '#1', 168, 98, 98], ['nutter15', 'nutter', 'metal', 1.5, '#1.5', 124, 98, 79],
  ['nutter2', 'nutter', 'metal', 2, '#2', 96, 98, 59], ['nutter25', 'nutter', 'metal', 2.5, '#2.5', 83, 98, 52], ['nutter3', 'nutter', 'metal', 3, '#3', 66, 98, 43],
  ['sring1', 'sring', 'metal', 1, '#1', 160, 98, 82], ['sring15', 'sring', 'metal', 1.5, '#1.5', 115, 98, 59],
  ['sring2', 'sring', 'metal', 2, '#2', 98, 99, 49], ['sring3', 'sring', 'metal', 3, '#3', 80, 98, 36],
  ['cmr1', 'cmr', 'metal', 1, '#1', 250, 96, 131], ['cmr15', 'cmr', 'metal', 1.5, '#1.5', 190, 96, 95], ['cmr2', 'cmr', 'metal', 2, '#2', 151, 97, 72],
  ['cmr25', 'cmr', 'metal', 2.5, '#2.5', 121, 97, 62], ['cmr3', 'cmr', 'metal', 3, '#3', 103, 98, 46], ['cmr4', 'cmr', 'metal', 4, '#4', 71, 98, 33],
  ['hypak1', 'hypak', 'metal', 1, '#1', 174, 97, 148], ['hypak15', 'hypak', 'metal', 1.5, '#1.5', 118, 98, 95],
  ['hypak2', 'hypak', 'metal', 2, '#2', 92, 98, 85], ['hypak3', 'hypak', 'metal', 3, '#3', 69, 98, 52],
  ['vsp25', 'vsp', 'metal', 1, '25 mm', 206, 98, 105], ['vsp50', 'vsp', 'metal', 2, '50 mm', 112, 96, 69],
  ['ralu25', 'ralu', 'metal', 1, '25 mm', 215, 98, 157], ['ralu38', 'ralu', 'metal', 1.5, '38 mm', 135, 97, 92], ['ralu50', 'ralu', 'metal', 2, '50 mm', 105, 98, 66],
  ['tripack1', 'tripack', 'metal', 1, '#1', 118, 96, 85], ['tripack2', 'tripack', 'metal', 2, '#2', 75, 98, 46],
  ['hiflow50', 'hiflow', 'metal', 2, '50 mm', 92, 98, 52],
  ['mraschig19', 'mraschig', 'metal', 0.75, '19 mm', 245, 80, 722], ['mraschig25', 'mraschig', 'metal', 1, '25 mm', 185, 86, 472],
  ['mraschig50', 'mraschig', 'metal', 2, '50 mm', 95, 92, 187], ['mraschig75', 'mraschig', 'metal', 3, '75 mm', 66, 95, 105],
  ['berl13', 'berl', 'ceramic', 0.5, '13 mm', 465, 62, 790, 1.16, 0.47], ['berl25', 'berl', 'ceramic', 1, '25 mm', 250, 68, 360, 0.53, 0.18],
  ['berl38', 'berl', 'ceramic', 1.5, '38 mm', 150, 71, 215, 0.21, 0.16], ['berl50', 'berl', 'ceramic', 2, '50 mm', 105, 72, 150, 0.16, 0.12],
  ['intalox13', 'intalox', 'ceramic', 0.5, '13 mm', 623, 71, 660, 1.04, 0.37], ['intalox25', 'intalox', 'ceramic', 1, '25 mm', 256, 73, 302, 0.52, 0.16],
  ['intalox50', 'intalox', 'ceramic', 2, '50 mm', 118, 76, 131, 0.14, 0.10], ['intalox75', 'intalox', 'ceramic', 3, '75 mm', 92, 79, 72],
  ['raschig13', 'raschig', 'ceramic', 0.5, '13 mm', 370, 64, 1900, 1.96, 0.56], ['raschig25', 'raschig', 'ceramic', 1, '25 mm', 190, 74, 587, 0.53, 0.22],
  ['raschig50', 'raschig', 'ceramic', 2, '50 mm', 92, 74, 213, 0.23, 0.17], ['raschig75', 'raschig', 'ceramic', 3, '75 mm', 62, 75, 121, 0.18, 0.15],
  ['cpall25', 'cpall', 'ceramic', 1, '25 mm', 220, 75, 350], ['cpall38', 'cpall', 'ceramic', 1.5, '38 mm', 164, 78, 180],
  ['cpall50', 'cpall', 'ceramic', 2, '50 mm', 121, 78, 142], ['cpall80', 'cpall', 'ceramic', 3, '80 mm', 82, 78, 85],
  ['chiflow38', 'chiflow', 'ceramic', 1.5, '38 mm', 108, 83, 121], ['chiflow50', 'chiflow', 'ceramic', 2, '50 mm', 89, 82, 95], ['chiflow70', 'chiflow', 'ceramic', 2.75, '70 mm', 52, 86, 49],
  ['ppall15', 'ppall', 'plastic', 0.625, '15 mm', 350, 87, 320], ['ppall25', 'ppall', 'plastic', 1, '25 mm', 206, 90, 180, 0.22, 0.14],
  ['ppall38', 'ppall', 'plastic', 1.5, '40 mm', 131, 91, 131, 0.14, 0.13, "Leva constants are Ludwig's 1-3/8 in; Perry's row is 40 mm"],
  ['ppall50', 'ppall', 'plastic', 2, '50 mm', 102, 92, 85, 0.10, 0.12], ['ppall90', 'ppall', 'plastic', 3.5, '90 mm', 85, 95, 56],
  ['sintalox25', 'sintalox', 'plastic', 1, '25 mm', 207, 90, 131], ['sintalox50', 'sintalox', 'plastic', 2, '50 mm', 108, 93, 92], ['sintalox75', 'sintalox', 'plastic', 3, '75 mm', 89, 96, 59],
  ['pcmr1', 'pcmr', 'plastic', 1, '#1A', 185, 97, 98], ['pcmr2', 'pcmr', 'plastic', 2, '#2A', 115, 97, 59], ['pcmr3', 'pcmr', 'plastic', 3, '#3A', 74, 98, 39],
  ['pralu15', 'pralu', 'plastic', 0.625, '15 mm', 320, 94, 230], ['pralu25', 'pralu', 'plastic', 1, '25 mm', 190, 94, 135], ['pralu38', 'pralu', 'plastic', 1.5, '38 mm', 150, 95, 80],
  ['pralu50', 'pralu', 'plastic', 2, '50 mm', 110, 95, 55], ['pralu90', 'pralu', 'plastic', 3.5, '90 mm', 75, 96, 38],
];
const FAMILIES = {
  pall: 'Metal Pall rings', imtp: 'Metal Intalox (IMTP)', nutter: 'Nutter rings', sring: 'Raschig Super-rings', cmr: 'Cascade Mini-Rings (metal)',
  hypak: 'Hy-Pak / K-Pak', vsp: 'VSP rings', ralu: 'Ralu-rings (metal)', tripack: 'Jaeger Tripacks', hiflow: 'Hiflow rings (metal)',
  mraschig: 'Metal Raschig rings', berl: 'Ceramic Berl saddles', intalox: 'Ceramic Intalox saddles', raschig: 'Ceramic Raschig rings',
  cpall: 'Ceramic Pall rings', chiflow: 'Ceramic Hiflow rings', ppall: 'Plastic Pall rings', sintalox: 'Plastic Super Intalox',
  pcmr: 'Plastic Cascade Mini-Rings', pralu: 'Plastic Ralu-rings',
};
const MAX_LOAD_927 = [[0.625, 25], [1, 40], [1.5, 55], [2, 70], [3.5, 125]];   // Ludwig Table 9-27, gpm/ft2
const PACKINGS = Object.fromEntries(RANDOM_ROWS.map(([key, fam, mat, nom, size, a, eps, Fp, alpha, beta, note]) => [key, {
  fam, mat, nom, size, a, eps: eps / 100, Fp_m: Fp, alpha, beta, note, leva: alpha !== undefined,
  dp: nom * 0.0254, maxLoad: interp(nom, MAX_LOAD_927.map(r => r[0]), MAX_LOAD_927.map(r => r[1])),
  sizeAssumed: size.startsWith('#'), name: `${size} ${FAMILIES[fam].replace(/s( \(.*\))?$/, '$1').replace('rings', 'ring')}`,
}]));

// Onda critical surface tension, dyn/cm (Perry's Table 5-24-C note): ceramic 61, steel 75, polyethylene 33
// (used for polypropylene: closest listed polyolefin, flagged), PVC 40
const SIGMA_C = { metal: 75, ceramic: 61, plastic: 33 };
const packingSurface = (pk, metalSurface) => pk.mat === 'metal' ? metalSurface : pk.mat === 'ceramic' ? 'ceramic' : 'pp';
const M2_PER_FT2 = FT_M * FT_M, KG_LB = 1 / LB_KG;
const fluxToLbsFt2 = f => f * KG_LB * M2_PER_FT2;                      // kg/(s m2) -> lb/(s ft2)
const RHO_TO_LBFT3 = 0.062428;

// Hydraulics per Absorber Heuristics (portfolio copy) slides 7, 8, 12-17, 23, 29
// Flood basis: 'm2' = slide 17 (Eq 9-20 dP_flood, Sherwood chart off-range so G from Leva)
//              'm1' = slide 16 Leva dP with incipient flood at 0.4 in/ft (slide 14)
function hydraulics(B, S, pk, o) {
  const mG = B.Vdry * (B.gasMW + B.Yin * MW_W);                       // kg/s wet gas
  const mL = S.m;                                                      // kg/s lean solution
  const rhoG = B.rhoG, rhoL = B.liq.rho;
  const FP = (mL / mG) * Math.sqrt(rhoG / rhoL);                       // flow parameter (slide 6)
  const rG = rhoG * RHO_TO_LBFT3, LoG = mL / mG;
  const Fp_ft = pk.Fp_m * FT_M;
  const dPflood920 = 0.115 * Math.pow(Fp_ft, 0.7);                     // in H2O/ft (slide 17, Eq 9-20)
  const dPflood = o.floodBasis === 'm1' ? 0.4 : dPflood920;
  const leva = Glb => pk.alpha * Math.pow(10, pk.beta * LoG * Glb) * Glb * Glb / rG;   // slide 16
  const solveG = dP => { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); (leva(m) < dP ? lo = m : hi = m); } return 0.5 * (lo + hi); };
  const Gf = solveG(dPflood) * (o.sf ?? 1);                            // lb/(s ft2) at flood, Table 14-9 system factor
  const Gop_flood = o.fracFlood * Gf, Gop_dp = solveG(o.dPallow);
  const Gop = Math.min(Gop_flood, Gop_dp);
  const governs = Gop_dp < Gop_flood ? 'allowable pressure drop' : '% of flood';
  const Gsi = Gop / (KG_LB * M2_PER_FT2);                              // kg/(s m2)
  const A = mG / Gsi, D = Math.sqrt(4 * A / Math.PI);
  const uG = Gsi / rhoG, Cs = uG * Math.sqrt(rhoG / (rhoL - rhoG));
  const Lsi = mL / A;
  const gpmft2 = S.Vl * 15850.32 / (A / M2_PER_FT2);
  const a_ft = pk.a * FT_M;                                            // ft2/ft3
  const mwr924 = 0.85 * a_ft * 7.48052 / 60;                           // Table 9-24 -> gpm/ft2
  // Table 9-25 MWR_T, gpm/ft2: unglazed ceramic 0.187, oxidized metal 0.27, surface-treated 0.40, bright metal 1.20, polypropylene 1.60
  const surf = packingSurface(pk, o.surface);
  const mwrT = { ceramic: 0.187, cs: 0.27, treated: 0.40, ss: 1.20, pp: 1.60 }[surf];
  const mwr925 = mwrT ? mwrT * Math.sqrt(60 / a_ft) : NaN;             // Table 9-25 + Eq 9-15
  // User rule 2026-10-22: Table 9-25 (newer, surface-material based) governs when the MOC is listed;
  // otherwise fall back to Table 9-24
  const mwrTable = mwrT ? '9-25' : '9-24';
  const mwrGov = mwrT ? mwr925 : mwr924;
  return {
    mG, mL, FP, offSherwood: FP < 0.01, dPflood, dPflood920, Gf, Gop, Gop_flood, Gop_dp, governs,
    dPop: leva(Gop), pctFlood: Gop / Gf, A, D, D_ft: D / FT_M, uG, Cs, Cs_fts: Cs / FT_M,
    Gsi, Lsi, gpmft2, maxLoad: pk.maxLoad, mwr924, mwr925, mwrTable, mwrGov, wets: gpmft2 >= mwrGov, surf,
  };
}

// Random packing without Leva constants: Kister-Gill / Strigle GPDC, Perry's 9th Fig 14-55 (raster, read at 300 dpi
// 2026-10-27, +/-0.03) with the Kister-Gill flood pressure drop (Eq 14-142). Same fields as hydraulics().
const KG_RP = { x: [0.005, 0.02, 0.06], curves: [
  [0.05, 0.44, 0.44, 0.43], [0.10, 0.67, 0.67, 0.64], [0.25, 1.11, 1.04, 0.98], [0.50, 1.56, 1.46, 1.29], [1.00, 2.07, 1.84, 1.47], [1.50, 2.38, 2.02, 1.62]] };
function hydraulicsGPDC(B, S, pk, o) {
  const mG = B.Vdry * (B.gasMW + B.Yin * MW_W), mL = S.m, rhoG = B.rhoG, rhoL = B.liq.rho;
  const FP = (mL / mG) * Math.sqrt(rhoG / rhoL);
  const Fp_ft = pk.Fp_m * FT_M, nu = B.liq.mu / rhoL * 1e6;
  const dPflood = 0.12 * Math.pow(Fp_ft, 0.7);
  const toCs = CP => CP / (Math.sqrt(Fp_ft) * Math.pow(nu, 0.05)) * FT_M;
  const CsFlood = toCs(kgCP(dPflood, FP, KG_RP)) * (o.sf ?? 1), CsDp = toCs(kgCP(o.dPallow, FP, KG_RP));
  const Cs = Math.min(o.fracFlood * CsFlood, CsDp);
  const governs = CsDp < o.fracFlood * CsFlood ? 'allowable pressure drop' : '% of flood';
  const uG = Cs * Math.sqrt((rhoL - rhoG) / rhoG), A = mG / (rhoG * uG), D = Math.sqrt(4 * A / Math.PI);
  const Gsi = mG / A, Lsi = mL / A, gpmft2 = S.Vl * 15850.32 / (A / M2_PER_FT2);
  const a_ft = pk.a * FT_M, surf = packingSurface(pk, o.surface);
  const mwrT = { ceramic: 0.187, cs: 0.27, treated: 0.40, ss: 1.20, pp: 1.60 }[surf];
  const mwr924 = 0.85 * a_ft * 7.48052 / 60, mwr925 = mwrT ? mwrT * Math.sqrt(60 / a_ft) : NaN;
  const mwrGov = mwrT ? mwr925 : mwr924;
  return {
    method: 'gpdc', mG, mL, FP, offSherwood: false, offChart: FP < KG_RP.x[0] || FP > KG_RP.x[2], extrapFlood: dPflood > 1.5,
    dPflood, dPflood920: dPflood, Gf: NaN, Gop: NaN, governs, dPop: kgDP(Cs / FT_M * Math.sqrt(Fp_ft) * Math.pow(nu, 0.05), FP, KG_RP),
    pctFlood: Cs / CsFlood, A, D, D_ft: D / FT_M, uG, Cs, Cs_fts: Cs / FT_M, Gsi, Lsi, gpmft2, maxLoad: pk.maxLoad,
    mwr924, mwr925, mwrTable: mwrT ? '9-25' : '9-24', mwrGov, wets: gpmft2 >= mwrGov, surf,
  };
}

// ---------------------------------------------------------------------------
// Random packing size -- deck "Random Packing Size Selection" (updated 2026-10-27): Ludwig Vol 2 p.279
// table (nominal size vs column diameter, in) + Robbins: tower diameter >= 8 x packing size; "smaller packing
// is more efficient, but carries higher pressure drop" (pressure drop is checked in the hydraulics).
// ---------------------------------------------------------------------------
const LUDWIG_SIZE_279 = [[0.5, 0.625, 6, 12], [0.625, 1, 12, 18], [1, 1.5, 18, 24], [1.5, 2, 24, 48], [2, 3, 36, Infinity]];

function packingSizeCheck(D_m, pk) {
  const D_in = D_m / 0.0254, nom = pk.nom;
  const band279 = LUDWIG_SIZE_279.filter(r => D_in >= r[2] && D_in < r[3]);
  const fit279 = band279.some(r => nom >= r[0] && nom <= r[1]);
  const ratio = D_in / nom;
  return { D_in, nom, ratio, ok8: ratio >= 8, band279, fit279, fits: fit279 && ratio >= 8 };
}

// Gas diffusivity -- deck "Gas and Liquid Diffusivities" -> Perry's Table 5-11, Fuller-Schettler-Giddings
// (Eq 5-202) with Perry's Table 5-13 volumes (H2O 12.7; CH4 = 16.5 + 4 x 1.98). The deck notes the
// table does not cover high-pressure gases; the 1/P scaling to 70 bar is an extrapolation.
function diffGas(B) {
  const T = B.T_C + 273.15, Patm = B.P_kPa / 101.325;
  const sv = Math.pow(12.7, 1 / 3) + Math.pow(16.5 + 4 * 1.98, 1 / 3);
  return 1e-3 * Math.pow(T, 1.75) * Math.sqrt(1 / MW_W + 1 / B.gasMW) / (Patm * sv * sv) * 1e-4;   // m2/s
}

// Liquid diffusivity of water (A, dilute) in TEG (B) -- deck -> Perry's 9th Table 5-14 (Table 2-142 has
// no water-TEG entry). Perry's text: Wilke-Chang is "not very accurate for water as the solute"; neither
// it nor Olander's /2.3 form is accurate "for higher-viscosity liquids, especially diols". Tyn-Calus holds
// for mu_B < 30 cP with water treated as a dimer (V 37.4 cm3/mol, parachor 105.2). Stokes-Einstein is
// valid only for M > 1000 or V > 500 cm3/mol (Perry's Eq 5-213 text) -- comparison only.
const V_W_NBP = MW_W / 0.9584;                  // cm3/mol, water at its normal boiling point
const DL_METHODS = {
  tc: 'Tyn–Calus (Eq 5-215)', wc: 'Wilke–Chang (Eq 5-214)', ol: 'Olander (Wilke–Chang ÷ 2.3)', se: 'Stokes–Einstein (Eq 5-213)',
};
function diffLiq(B, method = 'tc', r_m = 1.4e-10) {
  const T = B.T_C + 273.15, mu_cP = B.liq.mu * 1000;
  const p25 = tegProps(25), VB = MW_TEG / (p25.rho / 1000);           // cm3/mol at 25 C (parachor basis)
  const psiB = VB * Math.pow(p25.sigma * 1000, 0.25);
  const wc = 7.4e-8 * Math.sqrt(1.0 * MW_TEG) * T / (mu_cP * Math.pow(V_W_NBP, 0.6));   // phi_B = 1.0 (others)
  const cm2 = {
    tc: 8.93e-8 * Math.pow(37.4 / (VB * VB), 1 / 6) * Math.pow(psiB / 105.2, 0.6) * T / mu_cP,
    wc, ol: wc / 2.3,
    se: 1.380649e-23 * T / (6 * Math.PI * B.liq.mu * r_m) * 1e4,
  }[method];
  return cm2 * 1e-4;                                                    // m2/s
}

// Mass transfer: Onda (Perry's 8th Table 5-24-C) + Bravo & Fair area (Table 5-24-D)
function massTransfer(B, S, pk, H, Z_m, o) {
  const T = B.T_C + 273.15, muG = B.muG, rhoG = B.rhoG, L = H.Lsi, Gm = H.Gsi;
  const { rho: rhoL, mu: muL, sigma } = B.liq;
  const DG = diffGas(B), ScG = muG / (rhoG * DG);
  const ReGo = Gm / (pk.a * muG);                                      // Onda G/(a mu)
  const Aonda = pk.dp >= 0.012 ? 5.23 : 2.0;
  // Onda correlates kc = kG'RT/(a D); on a partial-pressure basis the real-gas molar density P/(ZRT)
  // applies, so kG' = kc/(ZRT). (Ideal-gas RT here overstated HG by 1/Z = 16% at 70 bar.)
  const Zg = B.P_kPa * 1000 * B.gasMW / (rhoG * 8314.462 * T);
  const kG = Aonda * Math.pow(ReGo, 0.7) * Math.pow(ScG, 1 / 3) * Math.pow(pk.a * pk.dp, -2) * pk.a * DG / (Zg * 8314.462 * T);  // kmol/(s m2 Pa)
  const sig_dyn = sigma * 1000, sigc = SIGMA_C[pk.mat || 'metal'];     // Perry's Table 5-24-C note
  const aw = pk.a * (1 - Math.exp(-1.45 * Math.pow(sigc / sig_dyn, 0.75) * Math.pow(L / (pk.a * muL), 0.1)
             * Math.pow(L * L * pk.a / (rhoL * rhoL * G), -0.05) * Math.pow(L * L / (rhoL * sigma * pk.a), 0.2)));
  const ReGbf = 6 * Gm / (pk.a * muG), CaL = L * muL / (rhoL * sigma);
  const Z_ft = Math.max(Z_m, 0.3) / FT_M;
  const aeBF = 0.498 * pk.a * Math.sqrt(sig_dyn) / Math.pow(Z_ft, 0.4) * Math.pow(CaL * ReGbf, 0.392);
  const ae = o.area === 'onda' ? aw : o.area === 'dry' ? pk.a : aeBF;   // deck-literal default: Bravo-Fair
  const Gmol = Gm / B.gasMW;
  const HG = Gm / (kG * ae * B.P_kPa * 1000 * B.gasMW);
  let HL = 0, kL = 0, DL = 0;
  if (o.liquidSide) {
    DL = diffLiq(B, o.dlMethod, o.rSolute);
    kL = 0.0051 * Math.pow(L / (aw * muL), 2 / 3) * Math.pow(muL / (rhoL * DL), -0.5) * Math.pow(pk.a * pk.dp, 0.4)
         / Math.pow(rhoL / (muL * G), 1 / 3);                          // m/s
    HL = L / (kL * ae * rhoL);
  }
  return { DG, ScG, ReGo, kG, Zg, aw, ae, aeBF, aeRatio: ae / pk.a, aeBFRatio: aeBF / pk.a, CaL, ReGbf, HG, HL, kL, DL, Gmol,
           LonOnda: L / (aw * muL), ondaGOK: ReGo > 5 && ReGo < 1000, ondaLOK: L / (aw * muL) > 4 && L / (aw * muL) < 400 };
}

// Estimate 2 driver: iterate Z (Bravo-Fair area depends on bed depth)
function rateBased(B, wLean, galPerLb, pkKey, o) {
  const pk = PACKINGS[pkKey];
  const S = solvent(B, wLean, galPerLb);
  const H = pk.leva ? hydraulics(B, S, pk, o) : hydraulicsGPDC(B, S, pk, o);   // deck Leva route where constants exist
  const ng = nog(B, S);
  const XN = S.X0 + B.Vdry * (B.Yin - B.Yout) / S.Lp;
  const m = (yStar(XN / (1 + XN), B) - yStar(S.x0, B)) / (XN / (1 + XN) - S.x0);
  const lambda = m / ((S.L0 / B.Vdry));                               // m / (LM/GM)
  const size = packingSizeCheck(H.D, pk);
  if (ng.pinch) {                                                      // spec unreachable: no height, but keep H_OG for display
    const mt = massTransfer(B, S, pk, H, 3, o);
    return { pk, S, H, ng, mt, lambda, HOG: mt.HG + lambda * mt.HL, Z: Infinity, Z_ft: Infinity, size };
  }
  let Z = 3, mt, HOG;
  for (let it = 0; it < 50; it++) {
    mt = massTransfer(B, S, pk, H, Z, o);
    HOG = mt.HG + lambda * mt.HL;
    const Zn = HOG * ng.NOG;
    if (Math.abs(Zn - Z) < 1e-6) { Z = Zn; break; }
    Z = 0.5 * (Z + Zn);
  }
  return { pk, S, H, ng, mt, lambda, HOG, Z, Z_ft: Z / FT_M, size };
}

// HETP rule-of-thumb check -- Perry's 9th Sec 14 (Kister), random Pall rings >= 25 mm:
//   Eq 14-156 HETP = 18 Dp; Eq 14-159 HETP = 93/ap  (organic systems, sigma < 25 mN/m)
//   x1.5 for "some amines and glycols" at 40-50 mN/m; x2 for water-rich (~70 mN/m); no factor given between
//   x[1 + 0.278 |ln lambda|^3] (Strigle, Eq 14-161) -- lambda outside 0.5-2 raises HETP
// Perry's: rules of thumb "are more accurate and more reliable than mass-transfer models"; slightly
// conservative vs test data with good distribution; maldistribution can raise HETP 2-3x.
function hetpRule(B, pk, lambda) {
  const sig = B.liq.sigma * 1000;
  const fSig = sig < 25 ? 1 : sig >= 40 && sig <= 50 ? 1.5 : sig >= 65 ? 2 : NaN;
  const fLam = 1 + 0.278 * Math.pow(Math.abs(Math.log(lambda)), 3);
  const base156 = 18 * pk.dp, base159 = 93 / pk.a;
  return { base156, base159, fSig, fLam, lo: Math.min(base156, base159) * fSig * fLam, hi: Math.max(base156, base159) * fSig * fLam };
}

// Packing size step per family: size each available size on its own diameter, keep the sizes inside the
// p.279 band with D >= 8 dp, pick the smallest ("smaller packing is more efficient").
function selectPackingSize(B, wLean, galPerLb, o, fam = 'pall') {
  const runs = Object.keys(PACKINGS).filter(k => PACKINGS[k].fam === fam).map(k => ({ key: k, r: rateBased(B, wLean, galPerLb, k, o) }));
  const fit = runs.filter(x => x.r.size.fits);
  return { fam, runs, pick: fit.length ? fit[0].key : null };
}
function selectRandomFamilies(B, wLean, galPerLb, o) {
  return Object.keys(FAMILIES).map(fam => {
    const s = selectPackingSize(B, wLean, galPerLb, o, fam);
    const r = s.pick ? s.runs.find(x => x.key === s.pick).r : null;
    return { fam, pick: s.pick, runs: s.runs, r, wets: r ? r.H.wets : false, loadOK: r ? r.H.gpmft2 <= r.H.maxLoad : false };
  });
}

// Structured vs Random first guess (deck circularity): Rules of Thumb 3rd ed. Table 11 (Chen 1984), typical
// C-factor, ft/s: trays 0.03-0.25, random 0.03-0.3, structured 0.01-0.45. Diameter range from that range.
const ROT_C_FTS = { bc: [0.03, 0.25], rd: [0.03, 0.30], st: [0.01, 0.45] };
function rotDiameterGuess(B, S, typ) {
  const mG = B.Vdry * (B.gasMW + B.Yin * MW_W), rhoG = B.rhoG, rhoL = B.liq.rho;
  const D = C => Math.sqrt(4 * mG / (rhoG * (C * FT_M) * Math.sqrt((rhoL - rhoG) / rhoG)) / Math.PI) / FT_M;
  const [c0, c1] = ROT_C_FTS[typ];
  return { C: [c0, c1], D: [D(c1), D(c0)] };          // high C -> small D
}

// ---------------------------------------------------------------------------
// Shared: stripping factor lambda = m / (L_M/G_M) over the operating range (secant slope of y*)
// ---------------------------------------------------------------------------
function lambdaOf(B, S) {
  const XN = S.X0 + B.Vdry * (B.Yin - B.Yout) / S.Lp;
  const m = (yStar(XN / (1 + XN), B) - yStar(S.x0, B)) / (XN / (1 + XN) - S.x0);
  return m / (S.L0 / B.Vdry);
}

// ---------------------------------------------------------------------------
// Structured packing -- no deck steps (gap); Perry's 9th Sec 14 (Kister)
//   Data      : Table 14-14 (a_p m2/m3, % voids, normal Fp in m-1), Sulzer Mellapak Y (45 deg, C_XY = 1)
//   Flood     : Kister & Gill Eq 14-142, dP_flood = 0.12 Fp^0.7 (in H2O/ft, Fp ft-1), read on the
//               Kister & Gill GPDC (SP), Fig 14-56. Capacity parameter = Cs Fp^0.5 nu^0.05 (ft/s, ft-1, cS)
//   Foaming   : system factor on flood (Table 14-9); Perry's: derating "also extend[s]" to packings
//   Efficiency: Eq 14-160 HETP = 100 C_XY / a_p + 0.10 (m), x1.5 glycols at 40-50 mN/m, x Strigle lambda
// Fig 14-56 is a raster image; each dP curve is straight on the log-x axis between F_LG 0.005 and
// 0.061 and was read at those two ends (300 dpi crop, 2026-10-24). Read to about +/-0.03.
// ---------------------------------------------------------------------------
// Full structured catalog (2026-10-27): every Perry's 9th Table 14-14 row with a normal packing factor.
// C_XY (Perry's p.14-65): 1 for Y-type, S-type and high-performance; 1.45 for X-type below 300 m2/m3; X-type at or
// above 300 m2/m3 has "insufficient data" (1.45 used, flagged). mat: metal sheet | gauze | ceramic | plastic.
// Row: [key, name, a m2/m3, voids %, Fp m-1, C_XY, mat, TEG field-tested (ARCO, OGJ 1991)]
const STRUCTURED_ROWS = [
  ['m125y', 'Mellapak 125Y', 125, 99, 33, 1, 'metal'], ['m170y', 'Mellapak 170Y', 170, 99, 39, 1, 'metal'], ['m2y', 'Mellapak 2Y', 223, 99, 46, 1, 'metal'],
  ['m250y', 'Mellapak 250Y', 250, 98, 66, 1, 'metal'], ['m350y', 'Mellapak 350Y', 350, 98, 75, 1, 'metal'], ['m500y', 'Mellapak 500Y', 500, 98, 112, 1, 'metal'],
  ['m125x', 'Mellapak 125X', 125, 99, 16, 1.45, 'metal'], ['m170x', 'Mellapak 170X', 170, 99, 20, 1.45, 'metal'], ['m2x', 'Mellapak 2X', 223, 99, 23, 1.45, 'metal'],
  ['m250x', 'Mellapak 250X', 250, 98, 26, 1.45, 'metal'], ['m500x', 'Mellapak 500X', 500, 98, 82, 1.45, 'metal'],
  ['mp252y', 'Mellapak Plus 252Y', 250, 98, 39, 1, 'metal'], ['mp452y', 'Mellapak Plus 452Y', 350, 98, 69, 1, 'metal'], ['mp752y', 'Mellapak Plus 752Y', 500, 98, 131, 1, 'metal'],
  ['fp1y', 'Flexipac 1Y', 420, 98, 98, 1, 'metal'], ['fp16y', 'Flexipac 1.6Y', 290, 98, 59, 1, 'metal'], ['fp2y', 'Flexipac 2Y', 220, 99, 49, 1, 'metal'],
  ['fp35y', 'Flexipac 3.5Y', 80, 99, 30, 1, 'metal'], ['fp4y', 'Flexipac 4Y', 55, 99, 23, 1, 'metal'],
  ['fp1x', 'Flexipac 1X', 420, 98, 52, 1.45, 'metal', true], ['fp16x', 'Flexipac 1.6X', 290, 98, 33, 1.45, 'metal'], ['fp2x', 'Flexipac 2X', 220, 99, 23, 1.45, 'metal'],
  ['fp3x', 'Flexipac 3X', 110, 99, 16, 1.45, 'metal'],
  ['fphc700', 'Flexipac HC 700', 710, 96, 223, 1, 'metal'], ['fphc1y', 'Flexipac HC 1Y', 420, 98, 82, 1, 'metal'], ['fphc16y', 'Flexipac HC 1.6Y', 290, 99, 56, 1, 'metal'],
  ['fphc2y', 'Flexipac HC 2Y', 220, 99, 43, 1, 'metal'],
  ['int1t', 'Intalox 1T', 310, 98, 66, 1, 'metal'], ['int2t', 'Intalox 2T', 215, 99, 56, 1, 'metal'], ['int3t', 'Intalox 3T', 170, 99, 43, 1, 'metal'],
  ['spak250', 'Super-Pak 250', 250, 98, 39, 1, 'metal'], ['spak350', 'Super-Pak 350', 350, 98, 69, 1, 'metal'], ['ralupak', 'Ralu-Pak 250YC', 250, 98, 66, 1, 'metal'],
  ['rhombo6m', 'Rhombopac 6M', 230, 98, 59, 1, 'metal'], ['maxpak', 'Max-Pak 0.5 in', 229, 98, 39, 1, 'metal'],
  ['montz250y', 'Montz-Pak B1-250Y', 250, 97, 66, 1, 'metal'], ['montz250m', 'Montz-Pak B1-250M', 250, 97, 43, 1, 'metal'],
  ['bx', 'Sulzer BX (wire gauze)', 492, 90, 69, 1, 'gauze', true],
  ['flexc28', 'Flexeramic 28', 260, 66, 131, 1, 'ceramic'], ['flexc48', 'Flexeramic 48', 160, 77, 79, 1, 'ceramic'], ['flexc88', 'Flexeramic 88', 100, 86, 49, 1, 'ceramic'],
  ['pm250y', 'Mellapak 250Y (plastic)', 250, 96, 72, 1, 'plastic'],
];
const STRUCTURED = Object.fromEntries(STRUCTURED_ROWS.map(([key, name, a, eps, Fp, Cxy, mat, teg]) => [key, {
  name, a, eps: eps / 100, Fp_m: Fp, Cxy, mat, tegTested: !!teg, cxyUncertain: Cxy === 1.45 && a >= 300,
  // Kister p.515 minimum wetting: metal corrugated sheet 0.1 gpm/ft2, wire mesh 0.05; none sourced for ceramic/plastic
  mwr: { metal: 0.1, gauze: 0.05 }[mat] ?? NaN,
}]));
const KG_SP = { x: [0.005, 0.0613], curves: [   // [dP in H2O/ft, CP at x0, CP at x1]
  [0.10, 0.741, 0.672], [0.25, 1.180, 1.006], [0.50, 1.644, 1.270], [1.00, 2.120, 1.450], [1.50, 2.243, 1.540]] };

function kgCP(dP, FLG, chart = KG_SP) {           // capacity parameter on a GPDC chart at dP (in/ft), log-x interpolation
  const lx = chart.x.map(Math.log10);
  const cp = chart.curves.map(c => interp(Math.log10(FLG), lx, c.slice(1)));
  return interp(Math.log(dP), chart.curves.map(c => Math.log(c[0])), cp);
}
function kgDP(CP, FLG, chart = KG_SP) {           // invert: dP (in/ft) at a capacity parameter
  let lo = Math.log(0.02), hi = Math.log(5);
  for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); (kgCP(Math.exp(m), FLG, chart) < CP ? lo = m : hi = m); }
  return Math.exp(0.5 * (lo + hi));
}

function structuredDesign(B, wLean, galPerLb, key, o) {
  const pk = STRUCTURED[key], S = solvent(B, wLean, galPerLb);
  const mG = B.Vdry * (B.gasMW + B.Yin * MW_W), mL = S.m, rhoG = B.rhoG, rhoL = B.liq.rho;
  const FLG = (mL / mG) * Math.sqrt(rhoG / rhoL);
  const Fp_ft = pk.Fp_m * FT_M, nu = B.liq.mu / rhoL * 1e6;            // cS
  const dPflood = 0.12 * Math.pow(Fp_ft, 0.7);
  const toCs = CP => CP / (Math.sqrt(Fp_ft) * Math.pow(nu, 0.05)) * FT_M;   // m/s
  const CsFlood = toCs(kgCP(dPflood, FLG)) * o.sf;
  const CsDp = toCs(kgCP(o.dPallowSt ?? o.dPallow, FLG));            // structured cap (Ludwig p.342), else shared
  const Cs = Math.min(o.fracFlood * CsFlood, CsDp);
  const governs = CsDp < o.fracFlood * CsFlood ? 'allowable pressure drop' : '% of flood';
  const uG = Cs * Math.sqrt((rhoL - rhoG) / rhoG), A = mG / (rhoG * uG), D = Math.sqrt(4 * A / Math.PI);
  const dPop = kgDP(Cs / FT_M * Math.sqrt(Fp_ft) * Math.pow(nu, 0.05), FLG);
  const lambda = lambdaOf(B, S), hr = hetpRule(B, { dp: NaN, a: pk.a }, lambda);
  const hetp0 = 100 * pk.Cxy / pk.a + 0.10;
  return {
    pk, S, FLG, offChart: FLG < KG_SP.x[0] || FLG > KG_SP.x[1], dPflood, extrapFlood: dPflood > 1.5, CsFlood, Cs, governs,
    pctFlood: Cs / CsFlood, uG, A, D, D_ft: D / FT_M, dPop, gpmft2: S.Vl * 15850.32 / (A / M2_PER_FT2),
    // Kister, Distillation Design (1992) p.515: metal corrugated-sheet structured packing performs
    // "down to 0.1 gpm/ft2" (wire mesh 0.05)
    mwr: pk.mwr, wets: Number.isFinite(pk.mwr) ? S.Vl * 15850.32 / (A / M2_PER_FT2) >= pk.mwr : null,
    lambda, hetp0, fSig: hr.fSig, fLam: hr.fLam, hetp: hetp0 * hr.fSig * hr.fLam,
  };
}

// ---------------------------------------------------------------------------
// Bubble-cap trays -- no deck tray steps (gap); Perry's 9th Sec 14
//   Flood     : Fair (Fig 14-32) as Eq 14-90, Csbf = 0.0105 + 8.127e-4 TS^0.755 exp(-1.463 F_LG^0.842),
//               TS in mm; "may be used for sieve, valve, or bubble-cap trays". Eq 14-91 gives U_nf
//               on the net area. Restriction 1 is "low or nonfoaming": system factor from Table 14-9.
//   Operation : "usually designed to operate at 80 to 90 percent of the flood limit" (p.14-35)
//   Efficiency: O'Connell for absorbers, Fig 14-9, parameter P/(H mu) = rho_L/(K M mu_L) (lb/ft3, cP).
//               Fig 14-9 is a raster image read at 300 dpi; the curve ends at 10 (~63%).
// ---------------------------------------------------------------------------
const OCONNELL_ABS = [[0.01, 5.5], [0.03, 12.3], [0.1, 21.4], [0.3, 31.5], [1, 40], [3, 50.6], [10, 63]];

// ---------------------------------------------------------------------------
// AIChE tray efficiency (Bubble Tray Design Manual 1958) -- Perry's 9th Sec 13, Eqs 13-72 to 13-78
//   N_V = (0.776 + 4.57 h_w - 0.238 F_s + 104.8 Q_L/W) / Sc_V^0.5          (13-77; h_w m, Q_L/W m3/(s m))
//   N_L = 19,700 D_L^0.5 (0.4 F_s + 0.17) t_L,  t_L = h_L Z W / Q_L          (13-78, 13-76)
//   Point: E_OG = 1 - exp(-1/(1/N_V + lambda/N_L))   (Fig 14-42, resistances in series)
//   Tray : E_MV = (exp(lambda E_OG) - 1)/lambda      (Lewis case 1, Eq 14-137)
//   Column: E_OC = ln(1 + E_MV (lambda - 1))/ln lambda (Lewis, Eq 14-135)
//   h_L = h_w + h_ow, h_ow = 664 (Q/L_w)^(2/3) mm (Eqs 14-108/109; hydraulic gradient ~0 in spray regime)
//   Single-pass tray: weir = chord of the downcomer segment, flow path Z = D - 2 x segment height.
//   Perry's p.14-50: fundamental methods tend to over-predict (80-100% vs ~60% real).
// ---------------------------------------------------------------------------
function segmentChord(adFrac, D) {                 // segment with area fraction adFrac of a circle of diameter D
  let lo = 0, hi = Math.PI;                         // central angle theta: A_seg/A_circle = (theta - sin theta)/(2 pi)
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); ((m - Math.sin(m)) / (2 * Math.PI) < adFrac ? lo = m : hi = m); }
  const th = 0.5 * (lo + hi);
  return { W: D * Math.sin(th / 2), hseg: D / 2 * (1 - Math.cos(th / 2)) };
}
function aicheTray(B, S, td, o, lambda) {
  const rhoG = B.rhoG, mG = B.Vdry * (B.gasMW + B.Yin * MW_W);
  const seg = segmentChord(o.adFrac, td.D);
  const Abub = td.AT * (1 - 2 * o.adFrac);                             // active area: total minus two downcomers
  const us = mG / (rhoG * Abub), Fs = us * Math.sqrt(rhoG);
  const QL = S.Vl, hw = o.weirMm / 1000, W = seg.W, Z = td.D - 2 * seg.hseg;
  const how = 664 * Math.pow(QL / W, 2 / 3) / 1000, hL = hw + how;      // m clear liquid
  const tL = hL * Z * W / QL;
  const ScV = B.muG / (rhoG * diffGas(B)), DL = diffLiq(B, o.dlMethod || 'tc');
  const NV = (0.776 + 4.57 * hw - 0.238 * Fs + 104.8 * QL / W) / Math.sqrt(ScV);
  const NL = 19700 * Math.sqrt(DL) * (0.4 * Fs + 0.17) * tL;
  const EOG = 1 - Math.exp(-1 / (1 / NV + lambda / NL));
  const EMV = (Math.exp(lambda * EOG) - 1) / lambda;
  const EOC = Math.abs(lambda - 1) < 1e-6 ? EMV : Math.log(1 + EMV * (lambda - 1)) / Math.log(lambda);
  return { Abub, us, Fs, W, Z, how, hL, tL, ScV, DL, NV, NL, EOG, EMV, EOC, gasFilm: (1 / NV) / (1 / NV + lambda / NL) };
}

// ---------------------------------------------------------------------------
// Maldistribution -- Perry's 9th Sec 14, "Maldistribution and Its Effects on Packing Efficiency"
//   Moore & Rukovena (Fig 14-63b, Pall/IMTP): slope = d(stages/bed)/d(DQ%) vs stages/bed at 100% DQ.
//     Raster figure read at 300 dpi (2026-10-26), +/-0.003. Loss = slope x (100 - DQ).
//     For structured packing the method "may penalize" drip-line distributors (Perry's) -- flagged.
//   Lockett & Billingham f_max: two parallel half-columns, liquid (1 +/- f)L, gas split equally;
//     f_max = maldistribution at which the lean-liquid half pinches = 1 - L_min/L.
//     <0.05 extremely sensitive; 0.05-0.10 sensitive; 0.10-0.20 not particularly; >0.20 insensitive.
// ---------------------------------------------------------------------------
const MR_SLOPE = [[0, 0], [2, 0], [3, 0.003], [4, 0.007], [5, 0.014], [6, 0.023], [7, 0.033], [8, 0.043],
                  [9, 0.054], [10, 0.064], [12, 0.085], [14, 0.105], [16, 0.125], [17, 0.135]];
function mooreRukovena(Nbed, DQ) {
  const slope = interp(Math.min(Nbed, 17), MR_SLOPE.map(p => p[0]), MR_SLOPE.map(p => p[1]));
  const lost = slope * (100 - DQ);
  return { slope, lost, Neff: Math.max(Nbed - lost, 0), heightFactor: Nbed / Math.max(Nbed - lost, 1e-9), offChart: Nbed > 17 };
}
function minCirculation(B, wLean) {                 // gal/lb at which the column pinches (N -> infinity)
  let lo = 0.05, hi = 20;
  if (nog(B, solvent(B, wLean, hi)).pinch) return Infinity;      // lean-end pinch: no circulation meets the spec
  for (let i = 0; i < 50; i++) { const m = Math.sqrt(lo * hi); (nog(B, solvent(B, wLean, m)).pinch ? lo = m : hi = m); }
  return hi;
}
function fmaxLB(B, wLean, galPerLb) {
  const cmin = minCirculation(B, wLean);
  const f = Number.isFinite(cmin) ? 1 - cmin / galPerLb : -Infinity;
  const cls = f < 0.05 ? 'extremely sensitive' : f < 0.10 ? 'sensitive' : f < 0.20 ? 'not particularly sensitive' : 'insensitive';
  return { cmin, f, cls };
}

function trayDesign(B, wLean, galPerLb, o, Ntheo, kd) {
  const S = solvent(B, wLean, galPerLb);
  const mG = B.Vdry * (B.gasMW + B.Yin * MW_W), rhoG = B.rhoG, rhoL = B.liq.rho, sig = B.liq.sigma * 1000;
  const FLG = (S.m / mG) * Math.sqrt(rhoG / rhoL);
  const TS = o.trayIn * 25.4;
  const Csbf = 0.0105 + 8.127e-4 * Math.pow(TS, 0.755) * Math.exp(-1.463 * Math.pow(FLG, 0.842));
  const Unf = Csbf * Math.pow(sig / 20, 0.2) * Math.sqrt((rhoL - rhoG) / rhoG) * o.sf;
  const Un = o.trayFlood * Unf, AN = mG / (rhoG * Un), AT = AN / (1 - o.adFrac), D = Math.sqrt(4 * AT / Math.PI);
  // O'Connell parameter at the mean liquid: K geometric mean of the two ends, M of the mean solution
  const xm = 0.5 * (S.x0 + kd.xN), K = Math.sqrt(kd.Ktop * kd.Kbot);
  const M = xm * MW_W + (1 - xm) * MW_TEG;
  const X = rhoL * RHO_TO_LBFT3 / (K * M * B.liq.mu * 1000);
  const offChart = X > OCONNELL_ABS[OCONNELL_ABS.length - 1][0] || X < OCONNELL_ABS[0][0];
  const Eoc = interp(Math.log10(Math.min(Math.max(X, 0.01), 10)), OCONNELL_ABS.map(p => Math.log10(p[0])), OCONNELL_ABS.map(p => p[1])) / 100;
  // Efficiency: AIChE (default, Perry's Sec 13) or O'Connell (off chart for TEG; reference only)
  const ai = aicheTray(B, S, { D, AT }, o, lambdaOf(B, S));
  const method = o.trayEff === 'oconnell' ? 'oconnell' : 'aiche';
  const E = method === 'aiche' ? ai.EOC : Eoc;
  const trays = Number.isFinite(Ntheo) ? Math.ceil(Ntheo / E) : Infinity;
  return { S, FLG, TS, Csbf, Unf, Un, AN, AT, D, D_ft: D / FT_M, X, E, Eoc, ai, method, offChart, lowerBound: method === 'oconnell' && offChart, trays, height: trays * TS / 1000,
           Cs: Un * Math.sqrt(rhoG / (rhoL - rhoG)) * (1 - o.adFrac), K, M };
}

// ---------------------------------------------------------------------------
// Internals selection -- Absorber Heuristics, deck-literal
//   Internals Selection Map (F_P spectrum; Kister et al. 1994 via Perry's 9th p.14-78): five bands
//   Packing: Structured vs Random Rules of Thumb: D > 3 ft structured, D < 3 ft random;
//     0.02 < F_P < 0.3 structured, 0.3 < F_P < 0.5 random; F_P < 0.02 consider bubble cap
// Lead below 0.02: structured (tool ruling 2026-10-24: bubble caps beat random there, not structured).
// Above 0.5 the map has no study data: lead = null (no recommendation; the tool refuses to pick).
// ---------------------------------------------------------------------------
const FP_BANDS = [
  { hi: 0.02, label: 'F_P < 0.02', lead: 'st', bc: true,
    tray: 'Bubble cap (very low L and G)', st: 'No study data; the Trays vs Structured flowchart decides (fouling, corrosion)', rd: 'Wetting-limited: check min. wetting rate' },
  { hi: 0.1, label: '0.02–0.1', lead: 'st', bc: false,
    tray: 'Sieve · fixed valve · moving valve (≈ random)', st: 'Leads: ~1.5× efficiency', rd: '≈ trays' },
  { hi: 0.3, label: '0.1–0.3', lead: 'st', bc: false,
    tray: 'Sieve · fixed valve · moving valve (≈ random)', st: 'Edge fades to 1.2×', rd: '≈ trays' },
  { hi: 0.5, label: '0.3–0.5', lead: 'rd', bc: false, tray: 'Just behind random', st: 'Trails', rd: 'Leads' },
  { hi: Infinity, label: 'F_P > 0.5', lead: null, bc: false, tray: 'Multipass (high L)', st: 'Falls off at high L', rd: 'No study data' },
];

// FP: flow parameter; D_st_ft: structured diameter (the D the size rule is tested on); wets: random
// packing passes minimum wetting; pick: Ludwig random size (key or null)
// j: judgment calls {plug, corr, dpCrucial}. Low Liquid Rates: Trays vs Structured Packing flowchart:
// plugging or corrosion a real issue -> "Is pressure drop crucial?" -> no -> trays (bubble cap at this F_P).
function internalsSelection(FP, D_st_ft, wets, pick, j = {}) {
  const band = FP_BANDS.find(b => FP < b.hi);
  const toTrays = (j.plug || j.corr) && !j.dpCrucial && band.lead !== null;
  return {
    band, lead: toTrays ? 'bc' : band.lead, toTrays, mapLead: band.lead, // the 3 ft size rule is reported, not used to
                                                                       // override (deck finding: it tests a D the deck computes later)
    sizeRule: D_st_ft >= 3 ? 'st' : 'rd',                              // Structured vs Random: D vs 3 ft
    bcApplies: band.bc, wets, pick,
  };
}

// ---------------------------------------------------------------------------
// Liquid distributors -- Absorber Heuristics, Liquid Distributor Type Selection = Ludwig Table 9-18
// (Bonilla, CEP 89(3) 1993 p.47). Ratings VG/G/F/P; cost and height H/M/L/VL.
// Quality class -> distribution-quality rating DQ (Perry's 9th p.14-67, Moore & Rukovena): "10 to 70
// percent for most standard commercial distributors, 75 to 90 percent for intermediate-quality
// distributors, and over 90 percent for high-performance distributors".
// ---------------------------------------------------------------------------
const RATE = { P: 0, F: 1, G: 2, VG: 3 };
const DISTRIBUTORS = {
  pan:  { name: 'Pan (riser tube)',              uniform: 'VG', solids: 'P',  turndown: 'G', lowL: 'G',  highV: 'P',  cost: 'H', height: 'M', drip: true },
  pohg: { name: 'Pipe orifice header, gravity',  uniform: 'VG', solids: 'P',  turndown: 'G', lowL: 'VG', highV: 'G',  cost: 'M', height: 'L', drip: true },
  pohp: { name: 'Pipe orifice header, pressure', uniform: 'F',  solids: 'F',  turndown: 'G', lowL: 'G',  highV: 'G',  cost: 'L', height: 'VL', drip: true },
  ntd:  { name: 'Notched trough',                uniform: 'VG', solids: 'G',  turndown: 'G', lowL: 'VG', highV: 'G',  cost: 'H', height: 'H', drip: false },
  snh:  { name: 'Spray nozzle header',           uniform: 'P',  solids: 'G',  turndown: 'P', lowL: 'P',  highV: 'VG', cost: 'L', height: 'M', drip: false },
  vnd:  { name: 'V-notch trough',                uniform: 'P',  solids: 'VG', turndown: 'P', lowL: 'P',  highV: 'G',  cost: 'M', height: 'H', drip: false },
};
// TEG service (Ludwig Vol 2 p.342, Dean et al., his ref. 117): a high-efficiency drip-point distributor was "far
// superior to a notched trough or spray nozzle distributor". drip: pan and orifice headers discharge through
// drip points; notched/V-notch troughs and spray nozzles do not. Dean tested structured packing; applied here
// to every packed TEG design (flagged).
const DQ_CLASS = { std: { name: 'Standard commercial', lo: 10, hi: 70 }, mid: { name: 'Intermediate', lo: 75, hi: 90 },
                   hp: { name: 'High-performance', lo: 90, hi: 100 } };
const COST_RANK = { L: 0, M: 1, H: 2 };

// ---------------------------------------------------------------------------
// Glycol fouling tiers (tier basis: user 2026-10-26). Descriptors are qualitative (GPSA Sec 20: salt water,
// hydrocarbons, treating chemicals, corrosion products -> foaming and losses; low pH degrades glycol). No
// source found gives numeric glycol-quality limits or packing cleaning intervals, so every number marked
// ASSUMED below is an engineering assumption (not sourced).
//   plug          : tier >= 2 makes plugging "a real issue" (feeds the Trays vs Structured flowchart)   ASSUMED
//   solidsMin     : minimum Table 9-18 solids-handling rating for the distributor                         ASSUMED
//   replaceYr     : internals replacement interval, years [structured, random, bubble cap]                 ASSUMED
// ---------------------------------------------------------------------------
const FOUL_TIERS = [
  { name: 'Clean', desc: 'Scrubber and filters effective; no brine carryover; glycol pH held.', plug: false, solidsMin: 'P', replaceYr: { st: Infinity, rd: Infinity, bc: Infinity } },
  { name: 'Moderate', desc: 'Occasional hydrocarbon or treating-chemical carryover; some corrosion products in filters.', plug: false, solidsMin: 'F', replaceYr: { st: 10, rd: 15, bc: Infinity } },
  { name: 'Dirty', desc: 'Recurring brine/salt or iron sulfide; foaming episodes.', plug: true, solidsMin: 'G', replaceYr: { st: 5, rd: 8, bc: 20 } },
  { name: 'Severe', desc: 'Continuous salt or solids loading; degraded, low-pH glycol.', plug: true, solidsMin: 'VG', replaceYr: { st: 2, rd: 4, bc: 10 } },
];

// Distributor auto-pick: drip-point type (TEG finding above, sourced), then (ASSUMED, Table 9-18) rated >= G at
// low liquid rates (absorbers run lean), solids handling >= the tier's minimum; then best uniformity, then lowest cost.
function pickDistributor(tier) {
  const need = RATE[FOUL_TIERS[tier].solidsMin];
  const ok = Object.entries(DISTRIBUTORS).filter(([, d]) => d.drip && RATE[d.lowL] >= RATE.G && RATE[d.solids] >= need);
  ok.sort((a, b) => RATE[b[1].uniform] - RATE[a[1].uniform] || COST_RANK[a[1].cost] - COST_RANK[b[1].cost]);
  return ok.length ? ok[0][0] : null;
}

if (typeof module !== 'undefined') module.exports = {
  FP_BANDS, internalsSelection, FAMILIES, RANDOM_ROWS, STRUCTURED_ROWS, KG_RP, hydraulicsGPDC, SIGMA_C, selectRandomFamilies, rotDiameterGuess, ROT_C_FTS, DISTRIBUTORS, DQ_CLASS, FOUL_TIERS, pickDistributor, RATE, aicheTray, segmentChord, mooreRukovena, MR_SLOPE, minCirculation, fmaxLB,
  basis, gasRho, muLGE, solvent, kremserDesign, kremserRate, nog, stepStages, hydraulics, massTransfer, rateBased,
  diffGas, diffLiq, DL_METHODS, packingSizeCheck, hetpRule, selectPackingSize, yStar, xFromW, wFromX, waterContent, dewpointOverTEG,
  yToLbMMSCF, lbMMSCFToY, mgSm3ToY, tegProps, interp, PACKINGS,
  STRUCTURED, KG_SP, kgCP, kgDP, structuredDesign, trayDesign, lambdaOf, OCONNELL_ABS,
  consts: { MW_W, MW_TEG, LB_KG, GAL_L, FT_M, G, R },
};
