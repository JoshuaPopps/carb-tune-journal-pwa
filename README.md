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
  (`Main jet  185 -> 190`).
- **Bikes & Carbs tab** — multiple bikes, multiple carbs per bike (the
  carb on the bike, the spare on the shelf, the clone you keep as a
  parts donor: `on-bike`, `spare`, `parts-donor`, `retired`). The
  **factory baseline requires a source** — cite the manual or the
  manufacturer's instruction sheet, or it won't save.
- **CV40 Ref tab** — the deep Keihin CV40 reference, plus the S&amp;S
  Super E reference, built from the Oct 26 requirement: factory specs,
  tuning guide, and leak/bench-check notes, every item tagged
  **FACTORY** or **COMMUNITY**. See "On specs" below.
- **Jetting wizard tab** — step by step, in the manufacturer's own
  tuning order: intermediate jet first, main jet last, mixture screw
  re-adjusted after every intermediate change, accelerator pump set
  last. The wizard follows the carb you pick (S&S Super E, Keihin
  CV40, or a generic path for anything else), each step cites its
  source, and your outcome at each test step is saved on the device.
  Jet-change outcomes offer a one-tap jump into the journal to log
  the change. See "Jetting wizard" below.
- **Altitude, per bike** — every bike carries a home elevation (the
  elevation it is jetted for): type it, look it up from the bundled
  Arizona ZIP table, or read the phone GPS (cached on the bike, so it
  works offline from then on). The wizard's altitude step works out
  the direction from home elevation using S&S's published guidance,
  and the log form pre-fills altitude from the bike. See "Altitude &
  elevation" below.
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
  Main jet               190                          ≠ stock
  Slow/pilot jet         45                           STOCK
  Float height           0.413-0.453 in               STOCK

  baseline source: 1984-1999 Softail Repair Manual (secondary - 1990 factory manual not in library)

History
  #2 — Oct 21, 2026 @ 61,245 mi
    Main jet  185 -> 190
    Cruise / midrange: slight surge at 55 mph, trying one size up
    Wide open: pulls clean
    Plug reading: eggshell/off-white

  #1 — Oct 20, 2026 @ 61,230 mi
    Accelerator pump  (not set) -> rebuilt: new diaphragm and spring
    Temp (F): 88
    Idle: steady, no stumble off idle
    notes: pump was leaking at the diaphragm
```

## Jetting wizard

The wizard walks the manufacturer's own tuning order, one step at a
time, and saves your outcome at each test step (per carburetor, on
the device). Pick a carb and the wizard follows it:

**S&S Super E (10 steps)** — from S&S Quick Tuning Guide #510-0245
and Installation & Jetting Instructions #51-1012 (2014 revision
510-0251): verify stock settings (mixture 1¼ turns out, idle speed
screw ½ turn from engagement, pump 2 turns out; .0295 / .072 for
74–88ci) → warm the engine fully → idle mixture, then idle speed
(S&S diagnostic: more than 1¾ turns out means the intermediate jet
is probably too small; less than 1¼ means it may need one size
smaller) → shut the accelerator pump OFF → intermediate jet first
(steady 40–50 mph, slow roll-on at ~2,000/2,500/3,000 rpm;
sneezing/popping = one size larger, rough/fouled/black smoke = one
size smaller) → **main jet last** (roll-on 50–70 mph in 3rd, .004 in.
steps) → accelerator pump set last → altitude step → weather step.

Two honest flags in the S&S path:

- **The roll-off cross-check (step 7) is UNVERIFIED.** At 3,500–
  4,500 rpm, full throttle, roll off to ~¾: picks up speed = too
  lean, hesitates = too large, just slows = within one size. That
  test appears in **neither** S&S #510-0245 **nor** #51-1012 /
  510-0251 (both read in full, Nov 2026), so the app labels it
  UNVERIFIED and says S&S's roll-on test is the deciding test. If
  Joshua wants it struck, it is one step definition in `app.js`.
- **The mixture-screw diagnostic disagrees with the older magazine
  rule.** The reference section still carries the Easyriders rule of
  thumb (<½ turn = too large, >1¼ turns = too small). S&S's own
  numbers are >1¾ / <1¼. The wizard uses S&S and says so on the
  step; S&S wins.

**Keihin CV40 (6 steps)** — pilot / idle first (~2.5 turns out
baseline, community practice), needle next (0.025 in. shims, max
~two), main jet last (steps of 5), then the altitude step and the
weather step. The CV40 altitude step notes the factory
self-compensation: the CV carb partially holds its mixture as
pressure drops (#99484-98, p.191).

**Anything else (4 steps)** — generic path: start from a cited
baseline, idle circuit first / main last, then altitude and weather.
No numbers are given for a carb the app has no verified reference for.

## Altitude & elevation

S&S publishes the **direction** of an altitude correction, not a
table. From S&S Instruction 510-0251, "Elevation changes":

- Try the idle mixture screw first — it "will often compensate for
  changes in elevation of several thousand feet." S&S test riders
  rode through changes upwards of **7,000 feet** without changing
  jets.
- Higher elevation runs **richer** — smaller jets may be required.
  Lower elevation runs **leaner** — larger jets may be required.
  Put the larger jets back when you return to lower elevation.
- If jets must change, change the **intermediate** jet first "in
  most cases", one size at a time, re-adjusting the mixture screw
  after every change.

**There is no published per-foot jet-step table.** None in S&S
51-1012 / 510-0251 / 510-0245 (the p.14 Jetting Chart is displacement
baselines only), none in the factory Harley manuals in the garage
library (the Softail repair manual p.303 lists altitude change only
as a reason rejetting *may* be necessary; the Sportster manual
#99484-98 p.191 describes the CV's partial self-compensation), and
none in the Easyriders magazine index (searched Nov 2026 — only
Edelbrock ads mention altitude). The app says so in the reference
tab and in the code, and the exact jet size comes from road-testing
at that elevation. The correction table is structured for reuse by
the diagnostics app's carb flow: `ALTITUDE_CORRECTION`,
`altitudeAdvice(homeFt, rideFt)`, and `AZ_ZIP_ELEVATIONS` in
`app.js` — direction only, no invented numbers.

**Elevation per bike** — home elevation is stored on the bike
record (with its source: `manual`, `zip:85302`, or `gps`), so it
survives export/import and works offline. Three ways to set it:
type the number, look up an Arizona ZIP (18 towns, town-centre
elevations from the Arizona Office of Tourism city-elevation list —
a full US ZIP table is too big to ship), or read the phone GPS
(`navigator.geolocation`; many phones report a position but no
altitude, in which case the app says so and falls back to typing it
or the ZIP table). The log form pre-fills altitude from the bike's
home elevation. Town-centre figures can sit a few hundred feet off
your exact spot — type your own number if you know it.

## Weather, temperature & humidity

The rest of jetting correction, and the honest answer is the same
shape as altitude: direction, not a table. Temperature and humidity
move jetting through air density, exactly like altitude does — but
**no published per-degree or per-percent jet-step table exists**
anywhere checked: not in S&S 51-1012 / 510-0251 / 510-0245 (no
temperature or humidity content at all), not in the factory Harley
manuals (FSM §4 carburetor chapters), not in Clymer Evo 84-98, and
not in the Easyriders magazine index (searched Nov 2026).

What the sources *do* publish:

- **Factory** (Softail 1984–1999 Repair Manual, p.303): rejetting
  *may* be necessary if "the motorcycle is in use at considerably
  higher or lower altitudes or in a considerably hotter or colder
  climate than in the past." That is as far as the factory goes —
  the same page says to check with a dealer or motorcycle
  performance tuner for recommendations as to the size of jets to
  install for your specific situation. The factory publishes no
  number either.
- **Magazine** (Easyriders ER_166 §74): "Keep in mind that
  altitude, temperature, and humidity all play a role in determining
  the correct jets. These factors won't be of much concern if you
  tune for the lean side on a cool, dry day at the altitude you plan
  to do most of your riding." A working rule, not a table — and its
  own implication gives the direction: a cool, dry day is the lean
  side, so hot, humid air runs richer and cold, dry air runs leaner.
- **Mechanism** (Easyriders ER_243 §33): "what happens if the air
  density (think elevation) changes?" — altitude, temperature, and
  humidity all move air density, and the carb only sees density:
  thinner air can't draw fuel as well.

The app wires that in as `WEATHER_CORRECTION` in `app.js`
(direction-only, `noNumericTable: true`), a "Weather, temperature
& humidity" section in the reference tab, and a final weather step
in every wizard path (S&S 10, CV40 6, generic 4) — tagged
COMMUNITY, since the working rule is magazine wisdom, not factory
spec. There is deliberately **no** `weatherAdvice()` function to
match `altitudeAdvice()`: a computable answer would need a
threshold ("hotter than X°F means one size…") and no published
threshold exists. The working tool is the one the journal already
has — every log entry records Temp (F), Altitude (ft), and Humidity
(%), so a rich reading on a hot Phoenix afternoon is checked
against the day before a jet gets blamed.

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
| `index.html` | The app shell: six tabs, all forms |
| `styles.css` | Shop-manual styling, big touch targets, no frameworks |
| `app.js` | All of it: store, journal logic, CV40 + S&S Super E reference, checklists, jetting wizard, altitude (AZ ZIP table + S&S direction-only correction), weather (temperature/humidity direction-only correction), UI |
| `sw.js` | Service worker — caches the app shell for offline use |
| `manifest.webmanifest` | Install metadata (name, icons, colors) |
| `icons/` | App icons (192/512 PNG + SVG) |
| `test.js` | Core-logic tests — `node test.js` |

## Testing

See [TESTING.md](TESTING.md) for the full test log: 147 core-logic
tests (`node test.js`) plus a 35-assertion Playwright smoke test
that drives the real UI in Chromium (wizard flows, altitude advice,
ZIP lookup, GPS fallback path, reference rendering, journal logging),
and a local static-server check that every asset serves.

## Known limits

- One device, one browser: data lives in that browser's local storage.
  Multi-device sync (e.g. a self-hosted sync for your own use) is a
  future upgrade — for now, Export/Import is the sync.
- No locking or multi-user support — fine for one person in a garage.
- Setup values are freeform text; the app diffs and compares them as
  text, it does not parse units. Deliberate — carb setups don't fit
  one schema.
- The wizard's roll-off cross-check (S&S path, step 7) could not be
  verified against S&S #510-0245 or #51-1012 / 510-0251 and is
  labelled UNVERIFIED in the app. The altitude correction is
  direction-only: no published per-foot jet-step table exists in any
  source checked (see "Altitude & elevation"). The weather
  correction is direction-only too: no published per-degree or
  per-percent jet-step table exists in any source checked (see
  "Weather, temperature & humidity"), and there is no computable
  weather-advice function because no published threshold exists to
  compute from.
- The ZIP elevation table covers 18 Arizona towns only. GPS altitude
  depends on the phone — many report a position but no altitude.

## License

MIT. Do whatever you want with it — it's a garage tool.
