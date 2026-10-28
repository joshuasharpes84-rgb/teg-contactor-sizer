# TEG Contactor Sizer — Tool Package

**What it answers:** for a glycol (TEG) gas-dehydration contactor, *how big a tower does this operating
case need, with which internals, and what will it cost to build and keep running?* Every internals type
(structured packing, bubble-cap trays, random packing) is sized from sourced methods at your conditions and
compared side by side; industry rules of thumb (GPSA) appear only as a check.

> **Make it yours, free:** download this repo (**Code → Download ZIP**, or `git clone`), open the folder in
> VS Code or any editor, and extend it for your own case with your AI assistant. This README is written for
> both of you. Taking these tools further is a free service of
> [Sharpes Process Engineering](https://jsharpes-portfolio.netlify.app); the site's Ask box can point you to the right starting file.

**Who this file is for:** the engineer using the tool, and that engineer's AI assistant. Hand it to an
assistant with your case and it has what it needs to check, challenge or adapt the method.

| | |
|---|---|
| Files | `index.html` (the tool, self-contained), `project/` (engine, page template, build and data scripts) , `SOURCES.md`, `DECISIONS.md` |
| Status | v1, 2026-10-27. FEL-1 screening tool, not a design deliverable; vendor rating confirms the final design. |
| Runs | Live at https://jsharpes-portfolio.netlify.app/#teg-tool, or open `index.html` in any browser, offline. Nothing is uploaded anywhere. |

---

## 1. Inputs

- **Operating case (sliders):** gas rate, contactor pressure (420–1,435 psig), temperature (61–122 °F).
  The bands come from GPSA Section 20: below about 16 °C TEG viscosity hurts mass transfer; above about 50 °C
  vaporization losses rise; above 10,000 kPa the water-content chart "may be inadequate". The gas-rate band
  (10–50 MMSCFD) is a placeholder.
- **Typed inputs:** outlet water spec, lean TEG purity, circulation (out-of-range entries are refused, not clamped).
- **Service:** glycol fouling tier (Clean → Severe), corrosion, whether pressure drop is crucial.
- **Internals and design basis:** internals type, internals material, foaming factor, operating point
  (% of flood) and allowable pressure drop (type-specific); the more conservative of the two governs.
- **Reset all to defaults** restores every input.

## 2. Method, in order

1. **Basis data (GPSA Sec 20):** saturated water content (Fig 20-3) and water–TEG equilibrium (Parrish, Fig 20-54),
   both digitized from the PDF's vector line art; pure-TEG properties (Fig 20-42). Gas density from PC-SAFT (the
   project's equation-of-state workflow pick) on a pressure–temperature grid; viscosity Lee–Gonzalez–Eakin.
2. **Stages:** Kremser with averaged absorption factor, and graphical stepping on the real equilibrium curve
   (captures the varying liquid rate the averaged factor misses).
3. **Internals selection:** the flow-parameter selection map (Kister et al. 1994), the trays-vs-structured
   flowchart (Bravo 1997: plugging/corrosion → is pressure drop crucial? → trays), the 3 ft structured/random
   rule as a flag with a Rules of Thumb first-guess diameter. The page follows the map's recommendation unless you
   pick a type; any decision that differs from the base case turns amber.
4. **Sizing each internals type:**
   - **Structured packing:** Kister–Gill flood (Perry's Eq 14-142 on Fig 14-56), allowable ΔP 0.3–0.5 in H₂O/ft
     (Ludwig), HETP by Perry's Eq 14-160 × glycol surface-tension factor × stripping-factor correction; minimum
     wetting 0.1 gpm/ft² (Kister).
   - **Random packing:** Leva pressure drop (Ludwig Table 9-33A) where constants exist, otherwise the Eckert/Strigle
     GPDC (Perry's Fig 14-55); Onda mass transfer; wetting by surface material (Ludwig Table 9-25); maximum load
     (Table 9-27); size step (Ludwig p.279 table + Robbins D ≥ 8 d_p); allowable ΔP 0.1–0.4 (Kister Table 8.4).
   - **Bubble-cap trays:** Fair flood (Perry's Eq 14-90/91) at 80–90% of flood; efficiency by the AIChE method
     (Perry's Sec 13 → point → Murphree → overall); O'Connell kept as an off-chart reference.
5. **Packing choice:** every packing in Perry's Tables 14-13 (75 random) and 14-14 (42 structured) is sized at the
   case and ranked: passes every sourced check first, then by shell + packing bare-module cost, then by packed
   volume where no price is published; failures last with the reason. No source gives a structured size-selection
   procedure; Ludwig recommends "several competitive designs", which is what the ranking is.
6. **Distributor:** drip-point types only (a TEG field study found them "far superior to a notched trough or spray
   nozzle"), then Ludwig Table 9-18 ratings against the fouling tier. Maldistribution checks (Moore & Rukovena;
   Lockett & Billingham) show this service is insensitive.
7. **Cost:** shell by ASME UG-27 thickness (SA-516-70, II-D stress) → weight → Seider tower/vessel correlations;
   trays, packing and distributors (Seider §16.5, Peters, Bravo); bare module ×4.16; lifecycle = present worth of
   maintenance (2–10%/yr) and internals replacement at the fouling tier's interval.
8. **Datasheet:** fills Coulson & Richardson Vol 6 Appendix G (vessel data sheet, plus the column tray data sheet
   for bubble caps) with the current design, as a PDF.

## 3. What to trust, and what not

- **Validated:** Kremser engine vs GPSA Example 20-11 (within 0.003 in removal fraction); AIChE tray efficiency
  reproduces a blind hand calculation; column costing reproduces Seider Example 16.13 (10/10 checks).
- **Field comparison:** structured HETP from the Eq 14-160 rule sits inside ARCO's 1991 field band at the same
  pressure and temperature; bubble-cap efficiency by the AIChE method runs above GPSA's 25–30% field values (Perry's
  warns fundamental methods over-predict).
- **Placeholders awaiting the author's sign-off** (labelled on the page): fouling-tier effects and internals
  replacement intervals; discount rate 10% and life 20 years; gas-rate band; tray spacing 24 in, downcomer 10%,
  weir 50 mm.
- **Gas composition** is illustrative (SG 0.633, sweet).
- **Raster charts** (Perry's Figs 14-55, 14-56, 14-63b, 14-9) were read at 300 dpi to about ±0.03.

## 4. Build

Run from `project/`: `build_contactor_tool.py` inlines the engine, gas grid, GPSA curves, Economics cost engine,
source thumbnails, datasheet template and pdf-lib into one page. Data builders: `gas_property_grid.py` (PC-SAFT
grid; needs `feos`), `build_source_thumbs.py`, `build_datasheet_template.py` (needs the textbook PDFs locally).
