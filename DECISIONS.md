# Engineering Decisions — TEG Contactor Sizer

The calls that shaped the tool: what was decided, what was rejected, and why. Sources for each topic are in
`SOURCES.md`.

*Built by Joshua Sharpes, EIT, with AI assistance (Claude) for drafting, coding and checks. Scope, method
selection, validation criteria and the corrections below are his.*

## How the tool is built

**The author's own workflow first, industry practice second.** Every selection and sizing step runs through
Joshua's methodology decks (*Absorbers*, *Absorber Heuristics*) before any comparison with GPSA. Where a deck has
no step, the gap is filled from Perry's, Ludwig or Kister and labelled as a proposed deck step, rather than chosen
by judgment. GPSA design practice appears only as a type-matched check after the blind result.

**Compare like with like.** GPSA's figures are shown only for the internals type selected, never structured
packing against bubble-cap numbers.

**Size every recommended option.** When the selection map recommends structured packing and bubble caps for this
low-liquid-rate service, both are sized, along with random packing, so the comparison is real.

## Equilibrium and properties

**Data correlations for the glycol loop.** No equation-of-state route was validated for TEG–water, so equilibrium
uses GPSA's experimental correlations (Parrish dewpoint chart and the McKetta–Wehe water-content chart), digitized
from the PDF's vector paths rather than read by eye. Gas density comes from the project's own equation-of-state
workflow (PC-SAFT), on a pressure–temperature grid so the operating sliders move it.

## Selection

**Two-pass structured-vs-random rule.** The deck's 3 ft rule tests a diameter that the deck only computes later.
The tool takes a first guess from the Rules of Thumb C-factor range, then checks it against the computed diameter.
The rule stays a flag, not an override (Joshua's ruling): diameters near 3 ft are normal at this flow.

**Fouling drives the trays-vs-packing branch.** A fouling tier replaced a plugging checkbox. At Dirty or above,
the deck's flowchart asks whether pressure drop is crucial; if not, the recommendation moves to bubble caps, and
the page flags the shift.

**Random packing is not only Pall rings.** Unglazed ceramic wets at liquid rates where bright-metal rings do not
(Table 9-25), so every packing family with published data is sized, and the stainless-packing choice from the MOC
screening is what rules out metal random packing here.

**Structured packing has no published size-selection procedure.** Perry's, Kister, Ludwig, Rules of Thumb and GPSA
give trade-offs only. The tool follows Ludwig's advice to run "several competitive designs": all 42 tabulated
structured packings are sized and ranked. Joshua's conclusion: the missing rules of thumb should come from case
studies, now a separate project.

## Sizing

**Type-specific allowable pressure drop, used jointly with % of flood.** Random packing uses Kister's and the
deck's absorber limits (0.1–0.4 in H₂O/ft); structured uses Ludwig's 0.3–0.5. Most services do not foam, so both
criteria are kept and the more conservative governs.

**Onda, not Bravo–Fair, for random-packing mass transfer.** At 70 bar the Bravo–Fair effective area exceeds the
packing's own surface area, which is physically out of range. Onda lands within about 20% of Perry's HETP rule.

**AIChE tray efficiency, not O'Connell.** O'Connell's chart ends below the TEG parameter, so it can only give a
lower bound on tray count. The AIChE method (Perry's Sec 13) gives 30–45% depending on weir height, against GPSA's
field 25–30%; both are shown.

**Foaming derating applied to all internals.** Perry's lists glycol contactors as foaming service (factor 0.50 for
non-syngas service). With it, Fair's bubble-cap capacity reproduces GPSA's K-factor. Field data suggest structured
packing needs little derating; the factor is an input.

**Distributor: drip-point types only.** A TEG field study (Ludwig, Dean et al.) found drip-point distributors far
superior to notched troughs and spray nozzles. An earlier proposed rule that picked a notched trough was corrected.
Maldistribution checks show the service is insensitive (fewer than 2.5 stages per bed; circulation well above the
pinch minimum), so the distributor matters for plugging and cost, not height.

## Cost

**Costing built in the Economics project, validated against Seider.** The column cost engine (shell thickness →
weight → cost, internals, bare module, lifecycle present worth) lives in the Economics project for reuse, and
reproduces Seider Example 16.13. Small high-pressure shells fall below the tower correlation's weight range, so the
vertical-vessel form is used and flagged rather than extrapolated silently.

## Errors caught in review

**A crash at the edges of the operating bands.** Cases where the spec cannot be met (low pressure, high
temperature at standard lean purity) froze the page. Fixed so the tool reports the case as unreachable.

**Wrong distributor recommendation.** The first auto-pick chose a notched trough for moderate and dirty glycol;
the TEG field finding reversed it.

**Datasheet field placement.** The template pages sit inside a larger PDF media box; values were positioned against
the visible page instead.
