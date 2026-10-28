# Sources — TEG Contactor Sizer

Where each type of information in this tool comes from. Topic-level, not number-by-number: the aim is to show
nothing was invented, and to point a reader to the right book and section. Page and equation numbers are in
`README.md`, on the page's method notes, and in the comments of `contactor_engine.js`.

**Tiers**
- **Library** — reference textbook in the author's library (`Textbooks (Level 1)`, Economics project)
- **Project PDF** — paper or standard held in this project
- **Web** — public page, URL given
- **Own work** — derived, digitized or chosen in this project; the basis is stated

Copyrighted PDFs are cited here but never published.

| Topic | Source | Tier | Location |
|---|---|---|---|
| Water content of sweet gas; TEG–water equilibrium; TEG properties; operating limits; Kremser removal curves | GPSA Engineering Data Book (SI), Section 20 (Figs 20-3, 20-42, 20-54, 20-55–59) | Project PDF | Glycol Dehydrator folder |
| Fig 20-3 and 20-54 curves | Digitized from the PDF's vector paths; checked against GPSA Examples 20-1 and 20-11 | Own work | `contactor_engine.js` |
| Gas density | PC-SAFT (feos), the equation-of-state workflow's pick for this stream | Own work | `gas_property_grid.py` |
| Gas viscosity | Lee–Gonzalez–Eakin | Library (gap-fill) | — |
| Absorber type selection | *Absorbers* deck (Cheremisinoff, *Chemical Engineer's Condensed Encyclopedia of Process Equipment*) | Own work + Library | Netlify slides |
| Internals selection map, size step, hydraulics, wetting, distributors, Kremser, HTU/NTU | *Absorber Heuristics* deck (Kister et al. 1994; Bravo 1997; Ludwig) | Own work + Library | Netlify slides |
| Flood and pressure drop: Kister–Gill Eq 14-142, Figs 14-55/14-56 GPDCs; Fair tray flood; foaming factors (Table 14-9) | Perry's Chemical Engineers' Handbook, 9th ed., Sec 14 | Library | — |
| Random and structured packing data | Perry's 8th Table 14-13; Perry's 9th Table 14-14 | Library | — |
| HETP rules (Eqs 14-156, 14-159, 14-160, 14-161); maldistribution (Moore & Rukovena, Lockett & Billingham) | Perry's 9th Sec 14 | Library | — |
| AIChE tray efficiency (Eqs 13-72 to 13-78), Lewis relations, O'Connell | Perry's 9th Secs 13–14 | Library | — |
| Onda and Bravo–Fair mass transfer; diffusivities | Perry's 8th/9th Sec 5 | Library | — |
| Leva pressure drop constants; wetting Tables 9-24/9-25; max load Table 9-27; size table p.279; distributor Table 9-18; structured ΔP 0.3–0.5 in/ft; TEG field note (Dean et al.) | Ludwig, *Applied Process Design* Vol 2, 3rd ed. | Library | — |
| Packed-tower sizing criteria; max ΔP by service (Table 8.4); structured minimum wetting | Kister, *Distillation Design* (1992) | Library | — |
| Circulation rule; first-guess C-factor (Table 11); internals cost (Table 12) | *Rules of Thumb for Chemical Engineers*, 3rd ed. | Library | — |
| Column cost: shell, trays, packing, distributors, bare module | Seider et al., *Product and Process Design Principles*, §16.5; Peters, Timmerhaus & West | Library | Economics project (`column_cost_engine.js`) |
| Allowable stress SA-516-70 | ASME BPVC Section II Part D (2013) | Library | Vessel Scale Up project |
| Internals material by component | Materials of Construction evaluation methodology | Own work | Plant Resources project |
| Structured HETP and tray efficiency in TEG service | Kean, Turner & Price, *Oil & Gas Journal*, 23 Sept 1991 (ARCO field test) | Project PDF | — |
| Plant-fitted TEG mass transfer | Filep et al., *Chem. Biochem. Eng. Q.* 36(1) 2022 | Project PDF | — |
| Datasheet template | Coulson & Richardson, *Chemical Engineering* Vol 6, Appendix G (vessel and column tray data sheets) | Library | — |
| Vendor rating tools (outside check) | Koch-Glitsch KG-TOWER; Sulzer SULCOL | Web | koch-glitsch.com/services/digital-services; sulzer.com |
| Fouling-tier effects, replacement intervals, discount rate, life, gas-rate band, tray placeholders | Placeholders for the author's sign-off; no published value found | Own work | labelled on the page |
