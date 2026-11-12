# Test notes — carb-tune-journal-pwa v1.0.0

Tested 2026-10-28. No build step, no dependencies in the app itself.
Test data was throwaway example data — nothing here is anyone's real
bike or real mileage.

## Core-logic tests — `node test.js` (53 passed, 0 failed)

Run from the app directory against Node 24:

- **Sample journal** (mirrors the README walkthrough): 1 bike, 2
  carbs, 2 entries; effective setup folds to main jet 175, pilot
  still stock 42, float still the baseline range; entry #2's delta
  computes as main jet 170 → 175 against the folded setup (baseline +
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

## DOM smoke test — real UI in jsdom (13 passed, 0 failed)

A throwaway harness in /tmp (not shipped) loaded the actual
`index.html` + `app.js`, seeded the sample journal, and drove the UI:

1. Journal renders current setup with STOCK and ≠ stock badges, the
   cited baseline source, history deltas (170 → 175), and entry #2.
2. Reference tab activates; factory table shows the float spec;
   tuning guide shows the pilot-first rule.
3. Checklists tab: ticking leak step 1 persists to localStorage and
   progress reads (1/6 done).
4. Adding a bike through the form renders it in the list.
5. Logging a main-jet change through the form (Genuine carb) appears
   in history as 175 → 180 with a "Logged entry #3" toast.

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
