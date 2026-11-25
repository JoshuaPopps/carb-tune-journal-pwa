# Test notes — carb-tune-journal-pwa v1.0.0

Tested 2026-10-28; re-tested 2026-11-20 (node test.js 53 passed, DOM smoke 13 passed) after the main/pilot corrections — step 5 of the DOM smoke test restated below. Re-tested 2026-11-24 after the jetting wizard + altitude build (node test.js 105 passed, Playwright smoke 35 passed, zero console errors; service worker cache v7). Re-tested 2026-11-25 after the weather (temperature/humidity) correction pull-in (node test.js 147 passed, 0 failed; service worker cache v10; static-server check all 200). No build step, no dependencies in the app itself.
Test data was throwaway example data — nothing here is anyone's real
bike or real mileage.

## Core-logic tests — `node test.js` (147 passed, 0 failed)

Run from the app directory against Node 24:

- **Sample journal** (mirrors the README walkthrough): 1 bike, 2
  carbs, 2 entries; effective setup folds to main jet 190, pilot
  still stock 45, float still the baseline range; entry #2's delta
  computes as main jet 185 → 190 against the folded setup (baseline +
  #1), not just the previous entry's changes.
- **Validation** (all rejected with clean errors): baseline without a
  source; duplicate bike name (case-insensitive); log with no setup
  change and no notes; log for an unknown carb; import of garbage
  JSON, JSON missing `entries`, and JSON pointing a carb at a missing
  bike.
- **Entry numbers never reused**: delete entry #2, log again → the
  new entry is #3, not #2 (the per-carb counter is never rewound).
- **Mileage handling**: backwards mileage warns but still logs and
  does not rewind the odometer; higher mileage advances it.
- **Export/import round-trip**: export → import keeps the effective
  setup; a CLI-shaped `data.json` (no `nextNum`/`checks` keys) imports
  cleanly with next numbers computed from the entries.
- **CV40 reference values** checked character-for-character against
  the compiled notes: mains 170/175/180, slow 42, float
  0.413–0.453 in., manifold 15–17 ft-lbs (20–23 Nm), backplate
  10–12 ft-lbs (14–16 Nm), backplate-to-carburetor and air-cleaner
  cover 3–5 ft-lbs, idle 1000–1050 rpm; leak checklist 6 steps, bench
  checklist 7 steps; tuning guide covers pilot-first order and
  enrichener-is-not-a-choke.
- **Knowledge-base fixes (Nov 2026):** sample plug reading is
  eggshell/off-white (not "light tan"); inlet-valve warning and both
  checklists say three-sided valves *may* cause overflow; the factory
  idle-mixture row carries no drill-out method (that lives in the
  tuning guide as community practice); plug chop gives the factory
  plug gap 0.038–0.043 in.; storage tip covers the float-bowl drain
  screw.
- **S&S Super E reference** checked against S&S #510-0245 / #51-1012 /
  #510-0279: 74–88ci jets .0295 / .072, mixture screw 1¼ turns out,
  idle speed screw ½ turn from engagement, pump screw 2 turns out,
  air bleed .040 stock, float even with the shelf; tuning order with
  the pump off while setting jets, .004 in. main-jet steps,
  intermediate diagnostics at 40–50 mph, enrichener cold start
  without opening the throttle.
- **Jetting wizard (Nov 2026):** S&S path is 10 steps with intermediate
  before main, main before pump-set-last, pump-off before intermediate
  tuning, altitude second-to-last and weather last; every step cites its source; the roll-off
  step is tagged UNVERIFIED with a source line starting "NOT in S&S"
  and all three readings (picks up / hesitates / just slows);
  idle step uses S&S's own mixture-screw thresholds (>1¾ / <1¼
  turns) and says S&S wins over the magazine rule; CV40 path is 6
  steps in pilot → needle → main order with altitude second-to-last
  and weather last; unknown carbs get the 4-step generic path with
  the same ending. Every weather step is tagged COMMUNITY, cites
  ER_166 §74, and carries the cool, dry day rule. Wizard progress
  records and rejects bogus outcomes and unknown carbs.
- **Altitude correction table (Nov 2026):** flagged
  `noNumericTable`, with the reason stated; no rule body contains a
  decimal jet-size number; rules carry the 7,000 ft S&S test-rider
  note, higher = richer / smaller jets, intermediate jet changed
  first; CV note cites #99484-98 p.191. `altitudeAdvice` reads richer
  Glendale → Flagstaff (+5,751 ft, smaller jets, intermediate first,
  mixture screw first) and leaner on the way down; under 500 ft
  reads "same"; missing elevation reads "unknown".
- **Arizona ZIP elevations (Nov 2026):** 85302 Glendale 1,152 ft,
  86001 Flagstaff 6,903 ft, 86336 Sedona 4,350 ft; unknown ZIP
  returns null; lookup tolerates spaces/dashes; table has 18 towns.
- **Per-bike elevation storage (Nov 2026):** stored at add with its
  source; `setBikeElevation` validates (rejects non-numbers, >14,000,
  unknown bikes) and a bad elevation leaves no half-added bike;
  sample bike carries Glendale 1,152 ft; elevation and wizard state
  survive export/import; CLI-shaped imports without the new keys
  still work.
- **Weather correction table (Nov 2026):** flagged
  `noNumericTable`, with the reason stated (no published per-degree
  or per-percent table in S&S, the factory manuals, Clymer, or the
  magazine index); no rule prescribes a jet size (p.303 is a page
  citation, not a jet number); rules carry the factory hotter/colder
  climate line plus the factory's own answer to "what size" (ask a
  dealer or performance tuner), the ER_166 §74 cool, dry day rule,
  the hot/humid = richer / cold/dry = leaner direction, the
  log-the-weather-with-every-entry rule (Temp (F) + Humidity (%)),
  and the air-density mechanism (ER_243 §33). No `weatherAdvice()`
  function: a computable answer would need a published threshold
  and none exists.

## Playwright smoke test — real UI in Chromium (35 passed, 0 failed, 0 console errors)

> NOTE (Nov 25, 2026): this run predates the weather pull-in — its
> wizard step-count assertions (CV40 0/5, S&S 1/9) are now stale
> (0/6 and 1/10). The harness was throwaway in /tmp and is gone; it
> needs rebuilding before the next UI smoke run. The node suite
> (147 passed) covers the new weather content in the meantime.

A throwaway harness in /tmp (not shipped) served a temp copy of the
staging dir over a local static server (Google Fonts replaced with
locally downloaded woff2 in the temp copy only) and drove the real UI
in headless Chromium at phone viewport (390×844):

1. Page loads, journal view active, six nav buttons including Wizard.
2. Sample data loads (1 bike, 2 carbs, 2 entries).
3. Wizard tab: CV40 path shows (pilot → needle → main), progress
   0/5, home elevation 1,152 ft shown from the bike.
4. Marking a CV40 step done reads 1/5; altitude check at 6,903 ft
   reads richer and says mixture screw first.
5. Adding a bike with elevation 1,152 ft, then an S&S Super E carb:
   wizard switches to the 9-step S&S path, intermediate before main
   in DOM order, roll-off step labelled UNVERIFIED / "NOT in S&S".
6. Picking the lean outcome on the intermediate step shows "ONE size
   larger" and a "Log intermediate jet change" button; progress 1/9.
7. The log button jumps to the Journal with the log-form altitude
   pre-filled from the bike (1152).
8. ZIP lookup on the bike card: 86001 → Flagstaff 6,903 ft, source
   `zip:86001`, saved.
9. Reference tab: altitude section, "No published per-foot jet-step
   table", the 7,000 ft note, AZ ZIP table rows for Flagstaff and
   Glendale.
10. Logging a main-jet change (0.076) through the form still works
    (toast + history).
11. Service worker registers; zero console errors and zero page
    errors across the whole run.

Two harness bugs caught during the run, both in the harness, not the
app: the carb form's bike select defaults to the alphabetically-first
bike (the carb first landed on the example bike), and one assertion
string did not match the rendered wording ("no per-foot…" vs the
rendered "No published per-foot…"). Fixed in the harness; the app
needed no change.

## DOM smoke test — real UI in jsdom (13 passed, 0 failed)

A throwaway harness in /tmp (not shipped) loaded the actual
`index.html` + `app.js`, seeded the sample journal, and drove the UI:

1. Journal renders current setup with STOCK and ≠ stock badges, the
   cited baseline source, history deltas (185 → 190), and entry #2.
2. Reference tab activates; factory table shows the float spec;
   tuning guide shows the pilot-first rule.
3. Checklists tab: ticking leak step 1 persists to localStorage and
   progress reads (1/6 done).
4. Adding a bike through the form renders it in the list.
5. Logging a main-jet change through the form (Genuine carb) appears
   in history as 190 → 180 with a "Logged entry #3" toast.

One real catch during this test: the first version of the harness
picked the alphabetically-first carb (the Clone) instead of the
Genuine carb, so the "new entry" landed on the Clone's journal — the
app was behaving correctly, the harness was selecting the wrong
carb. Fixed the harness to pick by nickname; the app needed no
change. (This also confirmed per-carb journals stay separate.)

## Static-server check (all 200)

`python3 -m http.server` from the app directory; every referenced
asset returned 200 with a sane size: `index.html`, `styles.css`,
`app.js`, `sw.js`, `manifest.webmanifest`, `icons/icon-192.png`,
`icons/icon-512.png`, `icons/icon.svg`, `test.js`.

## OPSEC scrub

Before staging, the whole directory was grepped for IPs, hostnames,
usernames, real file paths, credentials/tokens, network names, and
personal details. Clean: all bikes, names, and numbers are labeled
examples; the only external references are the published manual
citation (#99482-98) and the CLI repo link. No personal or system
information ships in the app.

## Known limits (also in README)

- Data lives in one browser's local storage; Export/Import is the
  sync story for now.
- jsdom is not a real phone browser: installability (Add to Home
  Screen) and the service worker's offline cache were verified by
  code inspection (manifest + sw.js asset list matches the shipped
  files) and the static-server check, not by an on-device install
  test — that step is for the owner on their own phone after approval.
- Tested on Node 24 (tests) and Python 3.12 (server); the app itself
  is plain ES5-era JavaScript and CSS with no build step, written to
  run in any modern mobile browser.
