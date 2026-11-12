# carb-tune-journal-pwa

A tuning logbook for carbureted motorcycles — as a phone app you install
from the browser. No app store, no account, no server.

Every jet, needle, mixture-screw, and float change goes in the book with
the date, the mileage, the conditions, and — most important — **how the
bike ran afterward**. The journal shows exactly what changed between
entries and how far the current setup has drifted from the factory
baseline, so a good tune never gets lost and a bad one is always
reversible. No more "wait, was it a 170 or a 175 in there last summer?"

This is the phone face of the
[carb-tune-journal CLI](https://github.com/JoshuaPopps/carb-tune-journal).
Same journal, same data model, same rules — the CLI keeps working, and
the two trade one JSON file back and forth.

> All bikes, names, and numbers below are examples only.

## What it does

- **Journal tab** — pick a carburetor, see its **current setup** with
  every line marked **STOCK** or **≠ stock** against the factory
  baseline, log a change (only the fields you actually touched, plus
  ambient conditions and how it ran at idle, off idle, cruise, wide
  open, and what the plugs looked like), and read the **history** —
  newest first, each entry showing its deltas from the setup before it
  (`Main jet  170 -> 175`).
- **Bikes & Carbs tab** — multiple bikes, multiple carbs per bike (the
  carb on the bike, the spare on the shelf, the clone you keep as a
  parts donor: `on-bike`, `spare`, `parts-donor`, `retired`). The
  **factory baseline requires a source** — cite the manual or the
  manufacturer's instruction sheet, or it won't save.
- **CV40 Ref tab** — the deep Keihin CV40 reference, plus the S&amp;S
  Super E reference, built from the Oct 26 requirement: factory specs,
  tuning guide, and leak/bench-check notes, every item tagged
  **FACTORY** or **COMMUNITY**. See "On specs" below.
- **Checklists tab** — two tap-through shop checklists with progress
  and per-step notes saved on the device:
  - **Fuel-leak diagnosis** — the 6-step order (needle valve, float
    tab, float itself, bowl O-ring, bowl screws, confirm the source).
  - **Clone carb bench check** — the 7-step pre-install check (read
    the jets, float level, valve type, shake the float, rubber,
    piston drop test, mixture-screw baseline).
- **Data tab** — export the whole journal as one JSON file, import a
  journal back, load example data to try it out, or wipe everything.
- **Installable & offline** — open it in Chrome (Android) or Safari
  (iPhone), "Add to Home Screen," and it works in the garage with no
  signal. A service worker caches the app shell; your journal lives in
  the browser's local storage on your device.

## Install

No build step, no dependencies. Any static host works — GitHub Pages,
a folder on your home server, or just the files on disk:

```bash
# Local preview
python3 -m http.server 8000
# then open http://localhost:8000/ on your phone or desktop
```

On your phone, open the hosted URL and use **Add to Home Screen**
(Android Chrome: menu → Add to Home Screen; iPhone Safari: Share →
Add to Home Screen). It then launches full-screen like a native app
and works offline.

## Try it with example data

Open the **Data** tab and tap **Load example data**. You get an
example bike with two carbs — the genuine CV40 (baseline set, two
logged entries) and a clone parts-donor — so you can see the history
deltas and STOCK / ≠ stock badges before entering your own bike.
Delete it any time from Bikes & Carbs, or wipe everything from Data.

Example walkthrough (what the example journal shows):

```
Current setup — Genuine CV40
  Main jet               175                          ≠ stock
  Slow/pilot jet         42                           STOCK
  Float height           0.413-0.453 in               STOCK

  baseline source: Harley-Davidson Softail Service Manual #99482-98, Section 4

History
  #2 — Oct 21, 2026 @ 61,245 mi
    Main jet  170 -> 175
    Cruise / midrange: slight surge at 55 mph, trying one size up
    Wide open: pulls clean
    Plug reading: eggshell/off-white

  #1 — Oct 20, 2026 @ 61,230 mi
    Accelerator pump  (not set) -> rebuilt: new diaphragm and spring
    Temp (F): 88
    Idle: steady, no stumble off idle
    notes: pump was leaking at the diaphragm
```

## Moving data between the app and the CLI

The app's export is the CLI's `data.json` format, field for field
(`bikes`, `carbs`, `entries`, same setup-field keys). So:

- **App → CLI:** Data tab → Download JSON backup → save as the CLI's
  data file (default `~/.carb-journal/data.json`, or wherever
  `CARB_JOURNAL_HOME` points). The CLI reads it as its own.
- **CLI → app:** Data tab → Import → pick the CLI's `data.json`. The
  app validates it (bikes, carbs, entries, and all cross-references
  must check out) and replaces the on-device journal.

Safe defaults, same as the CLI: confirmations on every delete, entry
numbers are append-only and **never reused** even after deletion,
warnings (not blocks) for mileage that goes backwards or future dates,
and the odometer advances automatically when you log a higher mileage.

## On specs: real numbers or nothing

This app will never invent a torque, clearance, or jetting value. The
CV40 reference ships exactly what is verified, each item tagged:

**FACTORY — Harley-Davidson Softail Service Manual #99482-98,
Section 4:**

| Spec | Value |
|---|---|
| Main jet — 49-state / California / HDI | 170 / 175 / 180 |
| Slow (pilot) jet — all markets | 42 |
| Float level | 0.413–0.453 in. (10.49–11.51 mm) |
| Float measuring tilt | Carb on its manifold side, tilted 15–20° off base |
| Inlet valve warning | Four-sided only — three-sided valves must NOT be used in CV carbs (they may cause overflow) |
| Idle mixture screw | Sealed under an aluminum EPA plug from the factory — intended non-adjustable; the drill-out method is community practice, see the tuning guide |
| Manifold mounting cap screws | 15–17 ft-lbs (20–23 Nm) |
| Backplate-to-cylinder-head screws | 10–12 ft-lbs (14–16 Nm) |
| Backplate-to-carburetor screws | 3–5 ft-lbs (4–7 Nm) |
| Air-cleaner cover screws | 3–5 ft-lbs (4–7 Nm) |
| Vacuum piston check | Blip the throttle — slide rises smoothly; lift and release — drops smoothly to its stop |
| Engine idle speed | 1000–1050 rpm |

**COMMUNITY — rider practice from the Keihin CV community guides, not
factory spec:** pilot-first tuning order (pilot → needle → main, one
change at a time); mixture-screw baseline ~2.5 turns out from gently
seated, tuned only at full operating temp; decel popping = lean idle
circuit, back out 1/4 turn at a time; needle shimming with 0.025 in.
washers, max ~two; main jet in steps of 5, matters only from 3/4 to
wide open; Stage 1 ballpark 45 pilot / 175–180 main (verify, don't
assume); plug chop method (eggshell/off-white target, plug gap
0.038–0.043 in.); the enrichener is not a choke — push it back in as
soon as the engine sustains itself; the idle-mixture-screw plug
drill-out (~1/16 in. bit, sheet-metal screw pull) is community
practice, not a factory procedure; drain the float bowl via the drain
screw before storage so fuel can't varnish the jets.

**FACTORY — S&S Super E, from S&S instruction sheets #510-0245 /
#51-1012 / #510-0279:**

| Spec | Value |
|---|---|
| Intermediate / main jet — 74–88ci | .0295 / .072 |
| Intermediate / main jet — 883cc | .0265–.028 / .066 |
| Intermediate / main jet — 96–107ci | .031 / .076 |
| Intermediate / main jet — 111–124ci | .031 / .078 |
| Idle mixture screw | 1¼ turns out from lightly seated |
| Idle speed screw | ½ turn clockwise from engagement point |
| Accelerator pump screw | 2 turns counter-clockwise from seated |
| Warm idle speed | 950–1050 rpm |
| Main jet air bleed | .040 stock (2004+ adjustable-bleed carbs only) |
| Float | Top of float even with the shelf in the bowl below the gasket surface |

S&S tuning order: idle mixture → idle speed → accelerator pump →
intermediate jet → main jet → air bleed (main jet last, pump off while
setting jets). Intermediate diagnostics at a steady 40–50 mph;
main-jet changes in .004 in. steps on a 50–70 mph roll-on in 3rd.
Enrichener cold start: lift the rod and leave it up, start without
opening the throttle, push it down in steps as the engine warms. S&S
calls the jetting a starting point only — re-jet for best performance.

Everything else — S&S Super G, Linkert M-series, Mikuni, and any carb
not listed — is explicitly flagged as unverified. You enter those
numbers yourself from the manufacturer's instruction sheet, with the
source cited on the baseline, so the numbers are always traceable.

## Files

| File | What it is |
|---|---|
| `index.html` | The app shell: five tabs, all forms |
| `styles.css` | Shop-manual styling, big touch targets, no frameworks |
| `app.js` | All of it: store, journal logic, CV40 + S&S Super E reference, checklists, UI |
| `sw.js` | Service worker — caches the app shell for offline use |
| `manifest.webmanifest` | Install metadata (name, icons, colors) |
| `icons/` | App icons (192/512 PNG + SVG) |
| `test.js` | Core-logic tests — `node test.js` |

## Testing

See [TESTING.md](TESTING.md) for the full test log: 30 core-logic
tests (`node test.js`) plus a 13-assertion DOM smoke test that drives
the real UI in jsdom (rendering, tab switching, checklist persistence,
form add/log flows), and a local static-server check that every asset
serves.

## Known limits

- One device, one browser: data lives in that browser's local storage.
  Multi-device sync (e.g. a self-hosted sync for your own use) is a
  future upgrade — for now, Export/Import is the sync.
- No locking or multi-user support — fine for one person in a garage.
- Setup values are freeform text; the app diffs and compares them as
  text, it does not parse units. Deliberate — carb setups don't fit
  one schema.

## License

MIT. Do whatever you want with it — it's a garage tool.
