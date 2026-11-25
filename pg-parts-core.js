/* Pocket Garage shared parts + torque core — pg-parts-core.js (v1).
   Read-only data module: part prices + torque values every app reads.
   Canonical copy: ~/workspace/github-buildout/pg-parts-core.js.
   Vendor verbatim; do not fork. No dependencies, no DOM, no storage,
   no network. Prices: merchant + URL + check date, or the entry
   does not exist. Torque: manual + section, or the row does not
   exist. No shop labor rate exists anywhere — shop cost stays
   "part + ask your shop".
   Seed data: copied verbatim from evo-diagnostic/data.js prices +
   torque (prices read from live product pages Nov 24, 2026; torque
   read from the rendered FSM pages Nov 24–25, 2026). Nothing
   invented, nothing added, nothing re-checked in v1.
   Torque slugs are kebab-case derivations of the fastener name;
   the parenthetical model/year split is part of the slug, so the
   same fastener name in different splits stays distinct.
   Format spec: ~/workspace/github-buildout/PARTS-CORE-FORMAT.md */
(function (root) {
  "use strict";

  var VERSION = 1;
  var DATA_AS_OF = "2026-11-24";

  var PARTS = {
    "master-cyl": {
      "name": "Front master cylinder assembly, 5/8 in. bore (Milwaukee Twins)",
      "price": 189.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-front-brake-master-cylinder-assembly",
      "date": "2026-11-24",
      "note": "Complete assembly, not a rebuild kit."
    },
    "brake-line": {
      "name": "Front brake line kit, stainless braided (Drag Specialties)",
      "price": 57.7,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-standard-length-front-brake-line-kit-for-harley-flstcfn-1987-1999",
      "date": "2026-11-24"
    },
    "caliper": {
      "name": "Front caliper rebuild kit — piston + seals (Drag Specialties)",
      "price": 33.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-front-caliper-rebuild-piston-and-seals-kit-for-harley-1984-1999",
      "date": "2026-11-24",
      "note": "Rebuild kit, not a complete caliper."
    },
    "disc": {
      "name": "Front brake rotor, vented stainless (Milwaukee Twins)",
      "price": 95.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-steel-disc-brake-rotor-for-harley-1984-1999",
      "date": "2026-11-24",
      "note": "Per rotor."
    },
    "pads": {
      "name": "Front brake pads 44063-83C/D, organic (Milwaukee Twins)",
      "price": 20.89,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-organic-front-brake-pads-for-harley-1984-1999",
      "date": "2026-11-24",
      "note": "One set per disc."
    },
    "dot5-fluid": {
      "name": "DOT 5 silicone brake fluid, 500ml (Maxima)",
      "price": 39.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/maxima-dot-5-silicone-brake-fluid",
      "date": "2026-11-24",
      "note": "DOT 5 only — never mix with DOT 3, DOT 4, or 5.1."
    },
    "fork": {
      "name": "Fork seal kit, 41mm (James Gasket)",
      "price": 25.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/james-gasket-fork-seal-kit-for-harley-1984-2016?sku_id=984925",
      "date": "2026-11-24",
      "note": "Seal kit for both forks, not a full fork assembly."
    },
    "front-axle": {
      "name": "Front axle + hardware kit (V-Twin)",
      "price": 56.4,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/v-twin-mfg-replacement-front-axle-hardware-kit-for-harley-fl-softail-1987-1995",
      "date": "2026-11-24"
    },
    "rear-axle": {
      "name": "Rear axle kit, chrome (Drag Specialties)",
      "price": 87.69,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-chrome-rear-axle-kit-for-harley-softail-1986-1999?sku_id=1153461",
      "date": "2026-11-24"
    },
    "shocks": {
      "name": "Adjustable shocks, Softail 1989-1999 (V-Twin)",
      "price": 288.36,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/v-twin-mfg-adjustable-shocks-for-harley-softail-1989-1999",
      "date": "2026-11-24",
      "note": "The listing does not say whether this is per pair or per shock."
    },
    "wheel-bearing": {
      "name": "Wheel bearing + race 9052 (Timken)",
      "price": 24.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/timken-wheel-bearing-and-race-for-harley-1973-1999",
      "date": "2026-11-24",
      "note": "Each — two bearings per wheel."
    },
    "exhaust-gaskets": {
      "name": "Tapered exhaust gasket (S&S)",
      "price": 8.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/ss-tapered-exhaust-gasket-for-harley-1984-2021?rrec=true",
      "date": "2026-11-24",
      "note": "Each — two per bike."
    },
    "slide": {
      "name": "CV40 vacuum piston / slide + diaphragm (Milwaukee Twins)",
      "price": 39.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-cv-vacuum-piston-for-harley-1988-2006",
      "date": "2026-11-24"
    },
    "carb-body": {
      "name": "CV40 rebuild kit, 13-piece (Cycle Pro)",
      "price": 25.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/cycle-pro-deluxe-rebuild-kit-for-keihin-cv-for-harley-1990-2006",
      "date": "2026-11-24",
      "note": "A whole CV40 body is not sold alone — this rebuild kit is the buyable proxy. Contains the rubber plug."
    },
    "float-bowl": {
      "name": "CV carb rebuild kit, 13-piece (James Gasket)",
      "price": 82.55,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/401-016/genuine-james-rebuild-kit-for-keihin-cv-carbs",
      "date": "2026-11-24",
      "note": "A float bowl alone is not sold — this kit is the buyable proxy."
    },
    "rubber-plug": {
      "see": "carb-body",
      "note": "No standalone price — the plug only ships inside rebuild kits."
    },
    "jackshaft": {
      "see": "starter",
      "note": "No standalone price verified in the Nov 25, 2026 library sweep — the jackshaft ships with the starter drive; no price invented."
    },
    "enrichener": {
      "name": "CV choke cable, 8 in. (Drag Specialties)",
      "price": 26.45,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-keihin-cv-choke-cable-for-harley-1988-2006",
      "date": "2026-11-24",
      "note": "Discontinued — the replacement cable is $23.99 and out of stock."
    },
    "mixture-screw": {
      "name": "Extended fuel mixture screw (All Balls Racing)",
      "price": 14.02,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/all-balls-racing-extended-fuel-mixture-screw-for-harley-cv-carb-1990-2006",
      "date": "2026-11-24"
    },
    "accel-pump": {
      "name": "CV accelerator pump upgrade kit (Cycle Pro)",
      "price": 18.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/cycle-pro-cv-accelerator-pump-upgrade-for-harley-cv-carb-1990-2006",
      "date": "2026-11-24",
      "note": "Upgrade kit, not a diaphragm alone — the standalone diaphragm only ships inside rebuild kits."
    },
    "main-jet": {
      "name": "CV40 main jet, size 185 (Cycle Pro)",
      "price": 6.26,
      "source": "Dennis Kirk",
      "url": "https://www.denniskirk.com/cycle-pro/main-jet-for-cv-type-keihin-carb.ph17217.prd/173477.sku",
      "date": "2026-11-24",
      "note": "Price from the family page; size 185 is a listed orderable size."
    },
    "pilot-jet": {
      "name": "CV40 pilot jet, size 45 (CV Performance)",
      "price": 4.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/cv-performance-cv-style-carburetor-pilot-jet-for-harley-1988-2006",
      "date": "2026-11-24"
    },
    "float": {
      "name": "CV carb float (V-Twin)",
      "price": 18.64,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/v-twin-mfg-cv-carburetor-float-for-harley-1992-2006",
      "date": "2026-11-24",
      "note": "Fits 1992 and later — the 1995 Fat Boy only, not the 1990 Softail."
    },
    "intake-seals": {
      "name": "Intake manifold seal (James Gasket)",
      "price": 4.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/james-gasket-intake-manifold-seal-for-harley-big-twin-sportster-1986-2022",
      "date": "2026-11-24",
      "note": "Each — two per bike."
    },
    "primary-chain": {
      "name": "Primary chain, 82 links (Twin Power)",
      "price": 89.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/twin-power-primary-chain-for-harley-big-twin-1941-2006",
      "date": "2026-11-24"
    },
    "primary-shoe": {
      "name": "Primary chain tensioner shoe (Milwaukee Twins)",
      "price": 8.79,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-primary-chain-tensioner-shoe-for-harley-big-twin-1965-2000",
      "date": "2026-11-24"
    },
    "clutch": {
      "name": "Clutch kit — 8 Kevlar + 6 steel plates (Twin Power)",
      "price": 256.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/twin-power-clutch-kit-for-harley-big-twin-sportster-1990-2021",
      "date": "2026-11-24"
    },
    "transmission": {
      "name": "Transmission rebuild kit, 5-speed (Baker)",
      "price": 429,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/baker-drivetrain-transmission-rebuild-kit-for-harley-big-twin-evo-1987-1993",
      "date": "2026-11-24",
      "note": "Covers 1987-1993 — the 1990 Softail only; the 1995 needs the 1994-1998 kit."
    },
    "belt": {
      "name": "Final drive belt, 130-tooth (S&S X7N)",
      "price": 305.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/ss-cycle-x7n-high-strength-final-drive-belt-for-harley-fl-softail-1995-1999",
      "date": "2026-11-24",
      "note": "Fits 1995-1999 only — the 1990 Softail uses a 132-tooth belt."
    },
    "heads": {
      "name": "Cylinder head / base gasket kit (James Gasket)",
      "price": 52.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/james-gasket-cylinder-headbase-gasket-kit-for-harley-evo-1984-1999",
      "date": "2026-11-24",
      "note": "Price shown on the page; the listing ranges $47.85-$78.95 by bore/gasket option."
    },
    "valves": {
      "name": "Adjustable chromoly pushrod set (S&S)",
      "price": 152.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/ss-adjustable-chromoly-pushrods-for-harley-big-twin-1984-1999",
      "date": "2026-11-24",
      "note": "Pushrod set — the buyable proxy for valves + pushrods."
    },
    "lifters": {
      "name": "Hydraulic lifters, set of 4 (Feuling HP+)",
      "price": 289.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/feuling-hp-hydraulic-lifters-for-harley-1984-1999",
      "date": "2026-11-24"
    },
    "crankcase": {
      "name": "Complete engine gasket set (James Gasket)",
      "price": 126.95,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/james-gasket-engine-gasket-set-for-harley-evo-1992-1999",
      "date": "2026-11-24",
      "note": "Covers 1992-1999 — the 1995 Fat Boy only; the 1990 needs the 1984-1991 kit."
    },
    "battery": {
      "name": "Battery — Yuasa YB16-B-CX, 12V 225 CCA",
      "price": 116.96,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/yuasa-yb16-b-cx-yumicron-cx-battery",
      "date": "2026-11-24",
      "note": "Fits the 1990 Softail only — the 1995 Fat Boy takes the larger YTX20-size battery. Out of stock at time of check."
    },
    "ignition-module": {
      "name": "Ignition module — Dynatek Dyna 2000i (D2KI-1P)",
      "price": 311.1,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/dynatek-2000i-ignition-kit-for-harley-1970-2000",
      "date": "2026-11-24"
    },
    "coil": {
      "name": "Single-fire 3-ohm coil, chrome (Twin Power)",
      "price": 114.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/twin-power-single-fire-3-ohm-ignition-coil-for-harley-1980-1999?sku_id=10066572",
      "date": "2026-11-24",
      "note": "Chrome finish; the black finish ($99.99) was out of stock."
    },
    "plugs": {
      "name": "Spark plugs, pair (Drag Specialties, replaces 5R6A)",
      "price": 15.85,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-performance-spark-plugs-for-harley-big-twin-1975-2000",
      "date": "2026-11-24",
      "note": "Price is per pair."
    },
    "voes": {
      "name": "VOES (Drag Specialties replacement)",
      "price": 67.36,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-replacement-vacuum-operated-electrical-switch",
      "date": "2026-11-24"
    },
    "stator": {
      "name": "Stator, 32-amp (Drag Specialties, replaces 29970-88)",
      "price": 93.04,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/drag-specialties-stator-for-harley-evo-1988-1999",
      "date": "2026-11-24"
    },
    "regulator": {
      "name": "Regulator, 32-amp, black (Milwaukee Twins, replaces 74519-88)",
      "price": 72.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/milwaukee-twins-regulator-for-harley-evo-1989-1999",
      "date": "2026-11-24"
    },
    "plug-wires": {
      "name": "Spark plug wire set (Hot Fire, 1980-1999)",
      "price": 58.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/hot-fire-spark-plug-wire-set-for-harley-1980-1999",
      "date": "2026-11-24"
    },
    "starter": {
      "name": "Starter motor, 1.4kW, black (All Balls Racing)",
      "price": 389.99,
      "source": "J&P Cycles",
      "url": "https://www.jpcycles.com/product/all-balls-racing-high-performance-14kw-starter-for-harley-big-twin-1990-2006",
      "date": "2026-11-24"
    }
  };

  var TORQUE = {
    source: "Harley-Davidson Softail 1997-1998 Service Manual 99482-98. Section 2 (Specifications), pp. 2-1 to 2-3; chapter torque tables: §3 p. 3-2, §4 p. 4-1, §5 p. 5-1, §6 p. 6-1, §8 p. 8-1; torque sequences: §3 pp. 3-21–3-22 (head bolts, Figs. 3-16/3-17) and p. 3-66 (crankcase, Fig. 3-88); turn direction and per-head structure from the 1984–1999 Repair Manual step 6B. Covers FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS.",
    tables: [
    {
      id: "fsm-99482-98-sec2",
      title: "Specifications",
      ref: "FSM #99482-98 §2, pp. 2-1–2-3",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Slider cap nuts (FLSTC, FLSTF, FXSTC)","slug":"slider-cap-nuts-flstc-flstf-fxstc","value":"9-13 ft-lbs (12-18 Nm)"},
        { "fastener":"Front axle nut (FXSTC, FLSTC, FLSTF)","slug":"front-axle-nut-fxstc-flstc-flstf","value":"45-50 ft-lbs (61-68 Nm)"},
        { "fastener":"Front axle nut (FXSTS, FXSTSB, FLSTS)","slug":"front-axle-nut-fxsts-fxstsb-flsts","value":"60-65 ft-lbs (81-88 Nm)"},
        { "fastener":"Rear axle nut","slug":"rear-axle-nut","value":"60-65 ft-lbs (81-88 Nm)"},
        { "fastener":"Brake disc screws, rear","slug":"brake-disc-screws-rear","value":"30-45 ft-lbs (41-61 Nm)"},
        { "fastener":"Brake disc screws, front","slug":"brake-disc-screws-front","value":"16-24 ft-lbs (22-33 Nm)"},
        { "fastener":"Brake bleeder valve","slug":"brake-bleeder-valve","value":"80-100 in-lbs (9-11.3 Nm)"},
        { "fastener":"Brake pad retainer screw","slug":"brake-pad-retainer-screw","value":"40-50 in-lbs (4.5-5.6 Nm)"},
        { "fastener":"Rear wheel sprocket mounting bolts","slug":"rear-wheel-sprocket-mounting-bolts","value":"55-65 ft-lbs (74.6-88.1 Nm)"},
        { "fastener":"Rear brake caliper (mounting) pin bolts","slug":"rear-brake-caliper-mounting-pin-bolts","value":"15-20 ft-lbs (20-27 Nm)"},
        { "fastener":"Rear fender supports","slug":"rear-fender-supports","value":"30-33 ft-lbs (41-45 Nm)"},
        { "fastener":"Rear shock absorber mounting bolts","slug":"rear-shock-absorber-mounting-bolts","value":"115-130 ft-lbs (156-176 Nm)"},
        { "fastener":"Front brake bracket to fender bracket mounting bolt (FXSTS, FXSTSB, FLSTS)","slug":"front-brake-bracket-to-fender-bracket-mounting-bolt-fxsts-fxstsb-flsts","value":"10-20 ft-lbs (14-27 Nm)"},
        { "fastener":"Front brake caliper mounting bolts, FXSTC/FLSTC/FLSTF (upper)","slug":"front-brake-caliper-mounting-bolts-fxstc-flstc-flstf-upper","value":"25-30 ft-lbs (34-41 Nm)"},
        { "fastener":"Front brake caliper mounting bolts, FXSTS/FXSTSB/FLSTS (upper), 1997 models (12 pt. bolt)","slug":"front-brake-caliper-mounting-bolts-fxsts-fxstsb-flsts-upper-1997-models-12-pt-bolt","value":"42-46 ft-lbs (57-62 Nm)"},
        { "fastener":"Front brake caliper mounting bolts, FXSTS/FXSTSB/FLSTS (upper), 1998 models (socket head bolt)","slug":"front-brake-caliper-mounting-bolts-fxsts-fxstsb-flsts-upper-1998-models-socket-head-bolt","value":"28-30 ft-lbs (38-41 Nm)"},
        { "fastener":"Front brake caliper mounting bolts, FXSTS/FXSTSB/FLSTS (lower)","slug":"front-brake-caliper-mounting-bolts-fxsts-fxstsb-flsts-lower","value":"25-30 ft-lbs (34-41 Nm)"},
        { "fastener":"Brake banjo bolts","slug":"brake-banjo-bolts","value":"17-22 ft-lbs (23-30 Nm)"}
      ]
    },
    {
      id: "fsm-99482-98-ch3",
      title: "Engine",
      ref: "FSM #99482-98 §3, p. 3-2",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Crank pin nut","slug":"crank-pin-nut","value":"180-210 ft-lbs (244-285 Nm)"},
        { "fastener":"Pinion gear nut","slug":"pinion-gear-nut","value":"35-45 ft-lbs (47-61 Nm)"},
        { "fastener":"Oil pump cover bolts","slug":"oil-pump-cover-bolts","value":"90-120 in-lbs (10.2-13.6 Nm)"},
        { "fastener":"Hydraulic lifter guide bolts","slug":"hydraulic-lifter-guide-bolts","value":"9-12 ft-lbs (12-16 Nm)"},
        { "fastener":"Hydraulic lifter screen plug","slug":"hydraulic-lifter-screen-plug","value":"90-120 in-lbs (10.2-13.6 Nm)"},
        { "fastener":"Rocker cover screws — Part No. 4718A","slug":"rocker-cover-screws-part-no-4718a","value":"90-120 in-lbs (10-13 Nm)"},
        { "fastener":"Rocker cover screws — Part Nos. 3997/882","slug":"rocker-cover-screws-part-nos-3997-882","value":"10-14 ft-lbs (14-19 Nm)"},
        { "fastener":"Rocker cover screws — Part Nos. 3501/3500","slug":"rocker-cover-screws-part-nos-3501-3500","value":"15-19 ft-lbs (20-26 Nm)"},
        { "fastener":"Cylinder head bolts","slug":"cylinder-head-bolts","value":"See Cylinder Head Torque Sequence below (FSM §3)"},
        { "fastener":"Upper engine mounting bracket — to cylinder heads","slug":"upper-engine-mounting-bracket-to-cylinder-heads","value":"28-35 ft-lbs (38-48 Nm)"},
        { "fastener":"Upper engine mounting bracket — to frame","slug":"upper-engine-mounting-bracket-to-frame","value":"28-32 ft-lbs (38-43 Nm)"},
        { "fastener":"Crankcase stud nut","slug":"crankcase-stud-nut","value":"See Crankcase Torque Sequence below (FSM §3)"},
        { "fastener":"Crankcase bolt","slug":"crankcase-bolt","value":"See Crankcase Torque Sequence below (FSM §3)"},
        { "fastener":"Gearcase cover screws","slug":"gearcase-cover-screws","value":"90-120 in-lbs (10.2-13.6 Nm)"},
        { "fastener":"Timer screws (inner cover and sensor plate)","slug":"timer-screws-inner-cover-and-sensor-plate","value":"15-30 in-lbs (1.7-3.4 Nm)"},
        { "fastener":"Spark plug","slug":"spark-plug","value":"18-22 ft-lbs (24-30 Nm)"}
      ]
    },
    {
      id: "fsm-99482-98-ch4",
      title: "Carburetor",
      ref: "FSM #99482-98 §4, p. 4-1",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Manifold mounting capscrews","slug":"manifold-mounting-capscrews","value":"15-17 ft-lbs (20-23 Nm)"},
        { "fastener":"Backplate-to-cylinder head screws","slug":"backplate-to-cylinder-head-screws","value":"10-12 ft-lbs (14-16 Nm)"},
        { "fastener":"Backplate-to-carburetor screws","slug":"backplate-to-carburetor-screws","value":"3-5 ft-lbs (4-7 Nm)"},
        { "fastener":"Air cleaner cover screw","slug":"air-cleaner-cover-screw","value":"3-5 ft-lbs (4-7 Nm)"}
      ]
    },
    {
      id: "fsm-99482-98-ch5",
      title: "Starter",
      ref: "FSM #99482-98 §5, p. 5-1",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Thru-bolts","slug":"thru-bolts","value":"39-65 in-lbs (4.4-7.3 Nm)"},
        { "fastener":"End cover mounting bracket","slug":"end-cover-mounting-bracket","value":"50-60 in-lbs (5.6-6.8 Nm)"},
        { "fastener":"End cover center screw","slug":"end-cover-center-screw","value":"90-110 in-lbs (10.2-12.4 Nm)"},
        { "fastener":"Cable terminal nuts","slug":"cable-terminal-nuts","value":"65-80 in-lbs (7.3-9.0 Nm)"},
        { "fastener":"Starter mounting bolts","slug":"starter-mounting-bolts","value":"13-20 ft-lbs (18-27 Nm)"},
        { "fastener":"Jackshaft bolt","slug":"jackshaft-bolt","value":"7-9 ft-lbs (9-12 Nm)"}
      ]
    },
    {
      id: "fsm-99482-98-ch6",
      title: "Clutch & primary",
      ref: "FSM #99482-98 §6, p. 6-1",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Primary cover screws","slug":"primary-cover-screws","value":"108-120 in-lbs (12-13.5 Nm)"},
        { "fastener":"Primary chain inspection cover screws","slug":"primary-chain-inspection-cover-screws","value":"50-70 in-lbs (5.6-7.9 Nm)"},
        { "fastener":"Clutch inspection cover screws","slug":"clutch-inspection-cover-screws","value":"50-70 in-lbs (5.6-7.9 Nm)"},
        { "fastener":"Compensating sprocket nut","slug":"compensating-sprocket-nut","value":"150-165 ft-lbs (203-224 Nm)"},
        { "fastener":"Transmission sprocket nut","slug":"transmission-sprocket-nut","value":"50 ft-lbs (67.8 Nm) initial torque, then turn another 30°-45°"},
        { "fastener":"Transmission sprocket locking screw","slug":"transmission-sprocket-locking-screw","value":"7-9 ft-lbs (9-12 Nm)"},
        { "fastener":"Clutch hub nut (left hand threads)","slug":"clutch-hub-nut-left-hand-threads","value":"70-80 ft-lbs (95-108 Nm)"},
        { "fastener":"Clutch adjusting screw jamnut","slug":"clutch-adjusting-screw-jamnut","value":"6-10 ft-lbs (8-14 Nm)"}
      ]
    },
    {
      id: "fsm-99482-98-ch8",
      title: "Electrical & charging",
      ref: "FSM #99482-98 §8, p. 8-1",
      appliesTo: "FXSTC, FXSTS, FXSTSB, FLSTC, FLSTF, FLSTS (1997–1998 Softail)",
      rows: [
        { "fastener":"Neutral switch (1997 models)","slug":"neutral-switch-1997-models","value":"3-5 ft-lbs (4-7 Nm)"},
        { "fastener":"Neutral switch (1998 models)","slug":"neutral-switch-1998-models","value":"10-15 ft-lbs (13.6-20.3 Nm)"},
        { "fastener":"Sensor plate screws","slug":"sensor-plate-screws","value":"15-30 in-lbs (1.7-3.4 Nm)"},
        { "fastener":"Inner timer cover screws","slug":"inner-timer-cover-screws","value":"12-20 in-lbs (1.4-2.3 Nm)"},
        { "fastener":"Rotor bolt","slug":"rotor-bolt","value":"75-80 in-lbs (8.5-9.0 Nm)"},
        { "fastener":"Alternator stator Torx screws","slug":"alternator-stator-torx-screws","value":"30-40 in-lbs (3.5-4.5 Nm)"},
        { "fastener":"Alternator sprocket nut","slug":"alternator-sprocket-nut","value":"150-165 ft-lbs (203-224 Nm)"},
        { "fastener":"Battery terminal bolts","slug":"battery-terminal-bolts","value":"40 in-lbs (4.5 Nm)"},
        { "fastener":"Headlamp adjustment screws (FXSTS, FXSTSB, FLSTS)","slug":"headlamp-adjustment-screws-fxsts-fxstsb-flsts","value":"30 ft-lbs (41 Nm)"},
        { "fastener":"Passing lamp & bracket nuts (FLSTC)","slug":"passing-lamp-bracket-nuts-flstc","value":"18 ft-lbs (24 Nm)"},
        { "fastener":"Turn signal module bolt","slug":"turn-signal-module-bolt","value":"10 in-lbs (1.1 Nm)"},
        { "fastener":"Horn cover screws (FLSTS)","slug":"horn-cover-screws-flsts","value":"23-28 in-lbs (2.6-3.1 Nm)"},
        { "fastener":"Horn nut (all except FLSTS)","slug":"horn-nut-all-except-flsts","value":"110 in-lbs (12.4 Nm)"},
        { "fastener":"Speed sensor mounting screw","slug":"speed-sensor-mounting-screw","value":"7-9 ft-lbs (9.5-12 Nm)"},
        { "fastener":"Handlebar clamp — master cylinder Torx screws","slug":"handlebar-clamp-master-cylinder-torx-screws","value":"60-80 in-lbs (6.8-9.0 Nm)"},
        { "fastener":"Upper and lower switch housing Torx screws","slug":"upper-and-lower-switch-housing-torx-screws","value":"35-45 in-lbs (3.9-5.1 Nm)"},
        { "fastener":"Handlebar clamp — clutch lever bracket Torx screws","slug":"handlebar-clamp-clutch-lever-bracket-torx-screws","value":"60-80 in-lbs (6.8-9.0 Nm)"}
      ]
    },
    {
      id: "sportster-86-03",
      title: "Sportster (1986–2003)",
      ref: "Sportster 1986–2003 Service Manual (sportster-86-03). These are Sportster values, NOT corrections to the Softail tables above — same fastener, different bike. Use only on 1986–2003 Sportsters.",
      appliesTo: "1986–2003 Sportster",
      rows: [
        { "fastener":"Clutch inspection cover screws","slug":"clutch-inspection-cover-screws","value":"84–108 in-lbs (9.5–12.2 Nm) — conflicts with Softail FSM §6 50–70 in-lbs"},
        { "fastener":"Spark plug","slug":"spark-plug","value":"11–18 ft-lbs (15–24 Nm) — Softail FSM §3 says 18–22 ft-lbs"}
      ]
    }
    ],
    sequences: [
    {
      "id": "head-bolts",
      "title": "Cylinder head bolts",
      "ref": "FSM #99482-98 §3, pp. 3-21–3-22 (Figs. 3-16, 3-17)",
      "figure": "Front head: 1 top-left, 3 top-right, 2 bottom-left, 4 bottom-right. Rear head mirrored: 2 top-left, 4 top-right, 1 bottom-left, 3 bottom-right. The 1-2-3-4 order runs one side's pair first, then the other.",
      "caution": "Extremely critical — prevents gasket leaks, stud failure, and head and cylinder distortion.",
      "prep": [
        "New O-rings over the cylinder dowels before the head gasket.",
        "Clean and lubricate bolt threads with engine oil; screw the bolts onto the studs to check for friction — dirt makes torque readings lie.",
        "Dip the bottom face of bolts in oil, wipe off excess; install finger tight.",
        "Hardened fasteners only — never substitute unhardened parts; do not reuse fiber cover seals."
      ],
      "passes": [
        {
          "value": "7–9 ft-lbs (9–12 Nm)",
          "order": "1, 2, 3, 4"
        },
        {
          "value": "12–14 ft-lbs (16–19 Nm)",
          "order": "1, 2, 3, 4"
        },
        {
          "value": "One quarter-turn (90°) clockwise, one bolt at a time",
          "order": "1, 2, 3, 4",
          "note": "Mark a line on the head and a matching line on each bolt head first (Fig. 3-17); finished when all marks sit as in View B"
        }
      ],
      "repeat": "Repeat the whole procedure on the other head.",
      "note": "FSM step 2 reads 'on the other cylinder'; the 1984–1999 Repair Manual step 6B (same values) makes clear both passes are done per head, then repeated on the opposite head. Turn direction (clockwise) is from Repair Manual 6B.d, consistent with FSM Fig. 3-17."
    },
    {
      "id": "crankcase",
      "title": "Crankcase fasteners",
      "ref": "FSM #99482-98 §3, p. 3-66 (Fig. 3-88)",
      "figure": "8 positions, criss-cross: 1 bottom-right of the flywheel cavity, 2 top-center between the cylinders, 3 bottom-left of the cavity, 4 upper-right edge, 5 mid-left edge, 6 far-right edge, 7 upper-left edge, 8 lower-right edge. Never two adjacent positions in a row.",
      "caution": "Follow the procedure — crankcase longevity may be compromised otherwise.",
      "prep": [
        "Three alignment studs first — they align the case halves and go in before the remaining studs.",
        "Non-hardening sealer (HD-99650-81 or 3M #800) on the mating surfaces.",
        "Start nuts and tighten until snug, then torque in sequence."
      ],
      "passes": [
        {
          "value": "10 ft-lbs (14 Nm)",
          "order": "1 through 8, starting with #1",
          "note": "Cases empty"
        },
        {
          "value": "15–17 ft-lbs (20–23 Nm)",
          "order": "1 through 8, same sequence",
          "note": "After cylinders and heads are installed"
        }
      ],
      "note": "The FSM prints '(20–35 Nm)' for the second pass — a misprint in the book. 15–17 ft-lbs converts to 20–23 Nm. Never use 35 Nm."
    }
    ]
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function getPrice(key) {
    if (typeof key !== "string" || !PARTS.hasOwnProperty(key)) return null;
    var e = clone(PARTS[key]);
    e.key = key;
    return e;
  }

  function listParts() {
    return Object.keys(PARTS).sort().map(function (k) {
      var e = clone(PARTS[k]);
      e.key = k;
      return e;
    });
  }

  function getTorque(tableId, fastenerSlug) {
    var t = null;
    TORQUE.tables.forEach(function (tb) { if (tb.id === tableId) t = tb; });
    if (!t) return null;
    var row = null;
    t.rows.forEach(function (r) { if (r.slug === fastenerSlug) row = r; });
    if (!row) return null;
    var out = clone(row);
    out.tableId = t.id;
    out.tableTitle = t.title;
    out.ref = t.ref;
    out.appliesTo = t.appliesTo;
    return out;
  }

  function listTorqueTables() {
    return TORQUE.tables.map(function (t) {
      return { id: t.id, title: t.title, ref: t.ref, appliesTo: t.appliesTo };
    });
  }

  function getTorqueSequence(id) {
    var s = null;
    TORQUE.sequences.forEach(function (q) { if (q.id === id) s = q; });
    return s ? clone(s) : null;
  }

  /* validate() checks the embedded data by default. Pass explicit
     (parts, torque) to validate a candidate copy instead — the test
     suite uses that to prove a hand-broken copy throws. Throws on
     the first bad entry; returns true when the data is clean. */
  function validate(parts, torque) {
    parts = parts || PARTS;
    torque = torque || TORQUE;
    var keyRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    Object.keys(parts).forEach(function (k) {
      if (!keyRe.test(k)) throw new Error("Part key is not a slug: " + k);
      var e = parts[k];
      if (e.see) {
        if (e.price !== undefined || e.source !== undefined ||
            e.url !== undefined || e.date !== undefined)
          throw new Error("Part " + k + " has both see and a priced field.");
        if (!parts.hasOwnProperty(e.see))
          throw new Error("Part " + k + " points at missing key " + e.see + ".");
        return;
      }
      if (typeof e.price !== "number")
        throw new Error("Part " + k + " has no price.");
      if (!e.name || !e.source || !e.url || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || ""))
        throw new Error("Part " + k + " is missing name, merchant, URL, or check date.");
    });
    if (!torque.source || torque.source.indexOf("99482-98") < 0)
      throw new Error("Torque source line is missing or does not cite the FSM.");
    torque.tables.forEach(function (t) {
      if (!t.id || !t.title || !t.ref || !t.appliesTo)
        throw new Error("Torque table " + (t.id || "?") + " is missing id, title, ref, or scope.");
      var seen = {};
      t.rows.forEach(function (r) {
        if (!r.fastener || !r.slug || !r.value)
          throw new Error("Torque row in " + t.id + " is missing fastener, slug, or value.");
        if (!keyRe.test(r.slug))
          throw new Error("Torque slug is not kebab-case in " + t.id + ": " + r.slug);
        if (seen[r.slug])
          throw new Error("Duplicate torque slug in " + t.id + ": " + r.slug);
        seen[r.slug] = true;
      });
    });
    torque.sequences.forEach(function (s) {
      if (!s.id || !s.title || !s.ref || !Array.isArray(s.passes) || !s.passes.length)
        throw new Error("Torque sequence " + (s.id || "?") + " is incomplete.");
    });
    return true;
  }

  var api = {
    version: VERSION,
    dataAsOf: DATA_AS_OF,
    getPrice: getPrice,
    listParts: listParts,
    getTorque: getTorque,
    listTorqueTables: listTorqueTables,
    getTorqueSequence: getTorqueSequence,
    validate: validate
    /* Deliberately no shopCost, no labor rate, no mutation API. */
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PG_PartsCore = api;
})(typeof window !== "undefined" ? window : globalThis);
