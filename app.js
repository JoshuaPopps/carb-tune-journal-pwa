/* Carb Tune Journal PWA — phone face for the carb-tune-journal CLI.
 *
 * No build step, no dependencies, no account, no server. Data lives in
 * this device's localStorage and moves as one plain JSON file.
 *
 * The data model is deliberately identical to the CLI's data.json:
 *   { bikes: {...}, carbs: {...}, entries: [...] }
 * so a journal exported here imports straight into the CLI (and back).
 * Field keys (main_jet, pilot_jet, ...) match the CLI exactly.
 *
 * Spec rule, same as the CLI: only published, verifiable numbers ship
 * in the reference section. Anything else is labelled COMMUNITY and
 * never presented as factory spec.
 */
'use strict';

/* ------------------------------------------------------------------ */
/* Field definitions — keys match the CLI exactly.                     */
/* ------------------------------------------------------------------ */
var SETUP_FIELDS = [
  ['main_jet', 'Main jet'],
  ['pilot_jet', 'Slow / pilot jet'],
  ['needle', 'Needle'],
  ['needle_clip', 'Needle clip position'],
  ['mixture_screw', 'Mixture screw'],
  ['float_height', 'Float height'],
  ['accel_pump', 'Accelerator pump'],
  ['slide_spring', 'Slide spring'],
  ['air_jet', 'Air jet / bleed'],
  ['other', 'Other']
];
var RAN_FIELDS = [
  ['idle', 'Idle'],
  ['off_idle', 'Off idle'],
  ['cruise', 'Cruise / midrange'],
  ['wot', 'Wide open'],
  ['plug', 'Plug reading']
];
var CONDITION_FIELDS = [
  ['temp_f', 'Temp (F)'],
  ['altitude_ft', 'Altitude (ft)'],
  ['humidity', 'Humidity (%)']
];
var CARB_STATUSES = ['on-bike', 'spare', 'parts-donor', 'retired'];
var STORAGE_KEY = 'carb-tune-journal-v1';

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */
var _memFallback = null;

function _storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (e) { /* private mode / non-browser: fall through */ }
  if (!_memFallback) {
    _memFallback = {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; }
    };
  }
  return _memFallback;
}

function emptyStore() {
  return { bikes: {}, carbs: {}, entries: [], nextNum: {}, checks: {} };
}

function loadStore() {
  var raw = _storage().getItem(STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    var data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyStore();
    data.bikes = data.bikes || {};
    data.carbs = data.carbs || {};
    data.entries = Array.isArray(data.entries) ? data.entries : [];
    data.nextNum = data.nextNum || {};
    data.checks = data.checks || {};
    return data;
  } catch (e) {
    return emptyStore();
  }
}

function saveStore(store) {
  _storage().setItem(STORAGE_KEY, JSON.stringify(store));
}

function uid(prefix, existing) {
  var n = 1, id;
  do { id = prefix + n; n++; } while (existing && existing[id]);
  return id;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ */
/* Core journal logic (pure over the store — this is what gets tested) */
/* ------------------------------------------------------------------ */
function addBike(store, fields) {
  if (!fields.name || !fields.name.trim()) throw new Error('Bike name is required.');
  var name = fields.name.trim();
  var clash = Object.keys(store.bikes).some(function (id) {
    return store.bikes[id].name.toLowerCase() === name.toLowerCase();
  });
  if (clash) throw new Error('A bike named "' + name + '" already exists.');
  var id = uid('b', store.bikes);
  store.bikes[id] = {
    id: id, name: name,
    year: fields.year || '', make: fields.make || '', model: fields.model || '',
    odometer: fields.odometer === '' || fields.odometer == null
      ? null : parseInt(fields.odometer, 10),
    odo_date: null, notes: fields.notes || ''
  };
  if (isNaN(store.bikes[id].odometer)) store.bikes[id].odometer = null;
  return store.bikes[id];
}

function addCarb(store, fields) {
  if (!fields.bike_id || !store.bikes[fields.bike_id]) throw new Error('Pick a bike first.');
  if (!fields.model || !fields.model.trim()) throw new Error('Carb model is required.');
  var nickname = (fields.nickname || '').trim();
  if (!nickname) nickname = fields.model.trim();
  var status = CARB_STATUSES.indexOf(fields.status) >= 0 ? fields.status : 'on-bike';
  var id = uid('c', store.carbs);
  store.carbs[id] = {
    id: id, bike_id: fields.bike_id, model: fields.model.trim(),
    nickname: nickname, status: status, notes: fields.notes || '',
    baseline: { specs: {}, source: '' }
  };
  return store.carbs[id];
}

function setBaseline(store, carbId, specs, source) {
  var carb = store.carbs[carbId];
  if (!carb) throw new Error('Carb not found.');
  if (!source || !source.trim()) throw new Error('Baseline source is required — cite the manual or instruction sheet.');
  var clean = {};
  SETUP_FIELDS.forEach(function (pair) {
    var v = specs[pair[0]];
    if (v != null && String(v).trim() !== '') clean[pair[0]] = String(v).trim();
  });
  if (Object.keys(clean).length === 0) throw new Error('Enter at least one baseline spec.');
  carb.baseline = { specs: clean, source: source.trim() };
  return carb;
}

/* Fold baseline + entries (in number order) into the effective setup. */
function effectiveSetup(store, carbId) {
  var carb = store.carbs[carbId];
  if (!carb) return {};
  var setup = {};
  var base = (carb.baseline && carb.baseline.specs) || {};
  SETUP_FIELDS.forEach(function (pair) { if (base[pair[0]] != null) setup[pair[0]] = base[pair[0]]; });
  entriesFor(store, carbId).forEach(function (e) {
    Object.keys(e.changes || {}).forEach(function (k) { setup[k] = e.changes[k]; });
  });
  return setup;
}

function entriesFor(store, carbId) {
  return store.entries
    .filter(function (e) { return e.carb_id === carbId; })
    .sort(function (a, b) { return a.num - b.num; });
}

/* Deltas of one entry against the setup that preceded it. */
function entryDeltas(store, entry) {
  var carb = store.carbs[entry.carb_id];
  var before = {};
  var base = (carb && carb.baseline && carb.baseline.specs) || {};
  SETUP_FIELDS.forEach(function (pair) { if (base[pair[0]] != null) before[pair[0]] = base[pair[0]]; });
  entriesFor(store, entry.carb_id).forEach(function (e) {
    if (e.num >= entry.num) return;
    Object.keys(e.changes || {}).forEach(function (k) { before[k] = e.changes[k]; });
  });
  var deltas = [];
  Object.keys(entry.changes || {}).forEach(function (k) {
    deltas.push({ key: k, from: before[k] != null ? before[k] : null, to: entry.changes[k] });
  });
  return deltas;
}

function logEntry(store, fields) {
  var carb = store.carbs[fields.carb_id];
  if (!carb) throw new Error('Pick a carburetor first.');
  var changes = {};
  SETUP_FIELDS.forEach(function (pair) {
    var v = fields.changes && fields.changes[pair[0]];
    if (v != null && String(v).trim() !== '') changes[pair[0]] = String(v).trim();
  });
  var ran = {};
  RAN_FIELDS.forEach(function (pair) {
    var v = fields.ran && fields.ran[pair[0]];
    if (v != null && String(v).trim() !== '') ran[pair[0]] = String(v).trim();
  });
  var conditions = {};
  CONDITION_FIELDS.forEach(function (pair) {
    var v = fields.conditions && fields.conditions[pair[0]];
    if (v !== '' && v != null && !isNaN(parseInt(v, 10))) conditions[pair[0]] = parseInt(v, 10);
  });
  var notes = (fields.notes || '').trim();
  if (Object.keys(changes).length === 0 && !notes) {
    throw new Error('Nothing to log — change at least one setup field or add a note.');
  }
  var date = (fields.date || '').trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must look like YYYY-MM-DD.');
  var mileage = null;
  if (fields.mileage !== '' && fields.mileage != null) {
    mileage = parseInt(fields.mileage, 10);
    if (isNaN(mileage)) throw new Error('Mileage must be a number.');
  }
  var warnings = [];
  var bike = store.bikes[carb.bike_id];
  if (bike && mileage != null) {
    if (bike.odometer != null && mileage < bike.odometer) {
      warnings.push('Mileage went backwards (' + bike.odometer.toLocaleString() +
        ' -> ' + mileage.toLocaleString() + ' mi) — logged anyway.');
    }
    if (bike.odometer == null || mileage > bike.odometer) {
      bike.odometer = mileage; bike.odo_date = date;
    }
  }
  var today = new Date().toISOString().slice(0, 10);
  if (date > today) warnings.push('Date is in the future — logged anyway.');
  /* Entry numbers are append-only: never reused, even after deletion. */
  var next = store.nextNum[carb.id] || 1;
  var existing = entriesFor(store, carb.id).map(function (e) { return e.num; });
  if (existing.length && Math.max.apply(null, existing) >= next) next = Math.max.apply(null, existing) + 1;
  var id = uid('e', {});
  while (store.entries.some(function (e) { return e.id === id; })) id = uid('e', {}) + '-' + next;
  var entry = {
    id: id, carb_id: carb.id, num: next, date: date, mileage: mileage,
    changes: changes, conditions: conditions, ran: ran, notes: notes
  };
  store.entries.push(entry);
  store.nextNum[carb.id] = next + 1;
  return { entry: entry, warnings: warnings };
}

function deleteEntry(store, entryId) {
  var i = store.entries.findIndex(function (e) { return e.id === entryId; });
  if (i < 0) throw new Error('Entry not found.');
  store.entries.splice(i, 1); /* nextNum is deliberately NOT rewound */
}

function deleteCarb(store, carbId) {
  if (!store.carbs[carbId]) throw new Error('Carb not found.');
  store.entries = store.entries.filter(function (e) { return e.carb_id !== carbId; });
  delete store.carbs[carbId];
  delete store.nextNum[carbId];
}

function deleteBike(store, bikeId) {
  if (!store.bikes[bikeId]) throw new Error('Bike not found.');
  Object.keys(store.carbs).forEach(function (cid) {
    if (store.carbs[cid].bike_id === bikeId) deleteCarb(store, cid);
  });
  delete store.bikes[bikeId];
}

/* Validate an imported JSON blob. Returns a normalized store or throws. */
function validateImport(raw) {
  var data;
  try { data = JSON.parse(raw); } catch (e) { throw new Error('Not valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON must be an object with bikes, carbs, and entries.');
  if (!data.bikes || typeof data.bikes !== 'object') throw new Error('Missing "bikes".');
  if (!data.carbs || typeof data.carbs !== 'object') throw new Error('Missing "carbs".');
  if (!Array.isArray(data.entries)) throw new Error('Missing "entries" (must be a list).');
  var bikes = {}, carbs = {};
  Object.keys(data.bikes).forEach(function (id) {
    var b = data.bikes[id];
    if (!b || !b.name) throw new Error('Bike "' + id + '" has no name.');
    bikes[id] = {
      id: id, name: String(b.name), year: b.year || '', make: b.make || '',
      model: b.model || '', odometer: b.odometer == null ? null : b.odometer,
      odo_date: b.odo_date || null, notes: b.notes || ''
    };
  });
  Object.keys(data.carbs).forEach(function (id) {
    var c = data.carbs[id];
    if (!c || !c.bike_id || !bikes[c.bike_id]) throw new Error('Carb "' + id + '" points at a missing bike.');
    if (!c.model && !c.nickname) throw new Error('Carb "' + id + '" has no model or nickname.');
    carbs[id] = {
      id: id, bike_id: c.bike_id, model: c.model || c.nickname,
      nickname: c.nickname || c.model || id,
      status: CARB_STATUSES.indexOf(c.status) >= 0 ? c.status : 'on-bike',
      notes: c.notes || '',
      baseline: {
        specs: (c.baseline && c.baseline.specs) || {},
        source: (c.baseline && c.baseline.source) || ''
      }
    };
  });
  var entries = data.entries.map(function (e, i) {
    if (!e || !e.carb_id || !carbs[e.carb_id]) throw new Error('Entry #' + (i + 1) + ' points at a missing carb.');
    return {
      id: e.id || ('e' + (i + 1)), carb_id: e.carb_id,
      num: e.num != null ? e.num : (i + 1), date: e.date || '',
      mileage: e.mileage == null ? null : e.mileage,
      changes: e.changes || {}, conditions: e.conditions || {},
      ran: e.ran || {}, notes: e.notes || ''
    };
  });
  var nextNum = {};
  Object.keys(carbs).forEach(function (cid) {
    var nums = entries.filter(function (e) { return e.carb_id === cid; }).map(function (e) { return e.num; });
    nextNum[cid] = nums.length ? Math.max.apply(null, nums) + 1 : 1;
  });
  return { bikes: bikes, carbs: carbs, entries: entries, nextNum: nextNum, checks: data.checks || {} };
}

function exportJSON(store) {
  return JSON.stringify(store, null, 2);
}

function sampleStore() {
  var s = emptyStore();
  var bike = addBike(s, { name: 'Example 1990 Softail', year: '1990', make: 'Harley-Davidson', model: 'Heritage Softail', odometer: '61200', notes: 'Example data only — delete it and add your own bike.' });
  var genuine = addCarb(s, { bike_id: bike.id, model: 'Keihin CV40', nickname: 'Genuine CV40', status: 'on-bike' });
  addCarb(s, { bike_id: bike.id, model: 'Keihin CV40 (clone)', nickname: 'Clone CV40', status: 'parts-donor' });
  setBaseline(s, genuine.id, { main_jet: '185', pilot_jet: '45', float_height: '0.413-0.453 in.' }, '1984-1999 Softail Repair Manual (secondary - 1990 factory manual not in library)');
  logEntry(s, { carb_id: genuine.id, date: '2026-10-20', mileage: '61230', changes: { accel_pump: 'rebuilt: new diaphragm and spring' }, ran: { idle: 'steady, no stumble off idle' }, conditions: { temp_f: '88' }, notes: 'pump was leaking at the diaphragm' });
  logEntry(s, { carb_id: genuine.id, date: '2026-10-21', mileage: '61245', changes: { main_jet: '190' }, ran: { cruise: 'slight surge at 55 mph, trying one size up', wot: 'pulls clean', plug: 'eggshell/off-white' }, conditions: {}, notes: '' });
  return s;
}

/* ------------------------------------------------------------------ */
/* CV40 reference content. Every item is tagged FACTORY (from manual  */
/* #99482-98, Section 4) or COMMUNITY (rider practice, not a spec).   */
/* Nothing here is invented; unconfirmed values are flagged, not      */
/* filled in.                                                          */
/* ------------------------------------------------------------------ */
var CV40_FACTORY = [
  { label: 'Main jet — 49-state', value: '170' },
  { label: 'Main jet — California', value: '175' },
  { label: 'Main jet — HDI', value: '180' },
  { label: 'Slow (pilot) jet — all markets', value: '42' },
  { label: 'Float level', value: '0.413–0.453 in. (10.49–11.51 mm)' },
  { label: 'Float measuring tilt', value: 'Carb on its manifold side, tilted 15–20° off base — outside that range the reading is wrong. Do not push on the float while measuring. Bend the float tab to adjust.' },
  { label: 'Float measuring point', value: 'Vernier/dial caliper depth gauge, from the carburetor O-ring flange face to the perimeter of the float.' },
  { label: 'Inlet valve warning', value: 'Four-sided inlet valves are fine in any Keihin. Three-sided inlet valves must NOT be used in CV carburetors — they may cause overflow.' },
  { label: 'Idle mixture screw', value: 'Recessed under an aluminum EPA plug from the factory, sealed with a plug — intended non-adjustable (#99482-98 p.4-2). The drill-out method is community practice, see the tuning guide.' },
  { label: 'Manifold mounting cap screws', value: '15–17 ft-lbs (20–23 Nm)' },
  { label: 'Backplate-to-cylinder-head screws', value: '10–12 ft-lbs (14–16 Nm)' },
  { label: 'Backplate-to-carburetor screws', value: '3–5 ft-lbs (4–7 Nm)' },
  { label: 'Air-cleaner cover screws', value: '3–5 ft-lbs (4–7 Nm)' },
  { label: 'Vacuum piston check', value: 'Air cleaner off, engine running: blip the throttle — the slide should rise smoothly. Engine off: lift it and release — it should drop smoothly to its stop.' },
  { label: 'Engine idle speed', value: '1000–1050 rpm' }
];
var CV40_TUNING = [
  { title: 'Order matters', body: 'Pilot (idle) circuit first, then needle (midrange), then main (top end). One change at a time; get each right before moving on.' },
  { title: 'Mixture-screw baseline', body: 'Gently seat, then back out ~2.5 turns. Tune only at full operating temp. If screwing it all the way in does not stumble the idle, the pilot jet is too big. If you need more than ~3 turns out, the pilot is too small.' },
  { title: 'Decel popping', body: 'Lean idle circuit. Back the screw out 1/4 turn at a time until it stops.' },
  { title: 'Needle shimming', body: '0.025 in. brass washers under the needle, one at a time, max ~two — richens the 1/4–3/4 throttle range.' },
  { title: 'Main jet', body: 'Only matters from 3/4 throttle to wide open. Change in steps of 5.' },
  { title: 'Stage 1 ballpark', body: 'Pipes + high-flow air cleaner: 45 pilot / 175–180 main is the common landing zone. Verify on your bike — do not assume.' },
  { title: 'Plug chop', body: 'Fresh plugs, ride ~1 mile at part throttle under half, pull the clutch and kill the engine, read the insulator — eggshell/off-white is the target. (Tan coloring was a leaded-fuel artifact; ignore old "tan = perfect" advice.) Spark plug gap (factory): 0.038–0.043 in.' },
  { title: 'The enrichener is not a choke', body: 'It is a separate fuel circuit. Push it back in as soon as the engine sustains itself; riding with it out fouls plugs fast.' },
  { title: 'Slide mod (debated)', body: 'Drilling the slide vacuum port to 1/8 in. quickens throttle response. Plenty of riders swear by it; it is irreversible, so it is your call.' },
  { title: 'Idle-mixture-screw plug removal (community method)', body: 'The factory plug can be drilled with a ~1/16 in. bit and pulled with a sheet-metal screw to expose the mixture screw. Community practice, not a factory procedure — the manual only says the screw is recessed, sealed with a plug, and intended non-adjustable.' },
  { title: 'Storage — drain the float bowl', body: 'Before putting the bike away, open the float-bowl drain screw and drain the bowl. Fuel left sitting in the bowl varnishes the jets and idle passages.' },
  { title: 'EZ-Just style thumb screw', body: 'Replaces the slotted mixture screw — worth it, saves knuckles.' }
];
/* ------------------------------------------------------------------ */
/* S&S Super E reference. Factory numbers from S&S's own instruction */
/* sheets — Quick Tuning Guide #510-0245, Installation & Jetting      */
/* #51-1012, Fuel Line Conversion Kit #510-0279. Jetting is S&S's     */
/* starting point only: "Re-jet carb for best performance." The       */
/* mixture-screw diagnostic is magazine-sourced and labelled as such. */
/* ------------------------------------------------------------------ */
var SS_SUPER_E_FACTORY = [
  { label: 'Intermediate jet — 74–88ci', value: '.0295' },
  { label: 'Main jet — 74–88ci', value: '.072' },
  { label: 'Intermediate jet — 883cc', value: '.0265–.028' },
  { label: 'Main jet — 883cc', value: '.066' },
  { label: 'Intermediate jet — 96–107ci', value: '.031' },
  { label: 'Main jet — 96–107ci', value: '.076' },
  { label: 'Intermediate jet — 111–124ci', value: '.031' },
  { label: 'Main jet — 111–124ci', value: '.078' },
  { label: 'Idle mixture screw', value: '1¼ turns out from lightly seated — seat gently, never force it (you will damage the seat)' },
  { label: 'Idle speed screw', value: '½ turn clockwise from engagement point' },
  { label: 'Accelerator pump screw', value: '2 turns counter-clockwise from seated' },
  { label: 'Warm idle speed', value: '950–1050 rpm' },
  { label: 'Main jet air bleed', value: '.040 stock (2004+ adjustable-bleed carbs only — earlier carbs are fixed at .040)' },
  { label: 'Float', value: 'Top of float even with the shelf in the bowl below the gasket surface, needle spring-loaded ball depressed' },
  { label: 'Throat / venturi', value: '1-7/8 in. throat (47.6 mm), 1-9/16 in. venturi (39.6 mm)' }
];
var SS_SUPER_E_TUNING = [
  { title: 'Tuning order', body: 'Idle mixture → idle speed → accelerator pump → intermediate jet → main jet → air bleed. Main jet is always last. Shut the pump off (screw seated) while setting jets, then open it only enough to kill the bog.' },
  { title: 'Intermediate jet — lean or rich?', body: 'Ride at a steady 40–50 mph. Sneezing or popping through the air cleaner below ~3000 rpm = too lean, go one size larger. Rough low-speed running, fouled plugs, black smoke, bad mileage = too rich, go one size smaller. Always re-adjust the idle mixture and idle speed screws after any jet change.' },
  { title: 'Main jet — .004 in. steps', body: 'Roll-on from 50 to 70 mph in 3rd gear. Backfires or breaks up in the carb = too small, increase by .004 in. Flat or will not accelerate = too large, decrease by .004 in.' },
  { title: 'Accelerator pump — set it last', body: 'With the engine idling, turn the adjustment screw clockwise until it lightly seats, then snap the throttle open — the engine should stumble. Turn the screw counter-clockwise ¼ or ½ turn at a time until it responds with smooth, quick response.' },
  { title: 'Enrichener cold start', body: 'There is no choke plate — the enrichener is a separate fuel circuit. Lift the rod and set it to stay up, start without opening the throttle (cracking the throttle lets air bypass the enrichener passage), let it warm, then push the rod down in steps as the engine will take it.' },
  { title: 'Mixture-screw diagnostic (community rule of thumb)', body: 'If it takes less than ½ turn out to idle well, the intermediate jet is too large; if it takes more than 1¼ turns, the jet is too small. Magazine-sourced (Easyriders), not an S&S spec — a pointer, not a measurement.' }
];
var CHECKLISTS = {
  leak: {
    title: 'Fuel-leak diagnosis',
    note: 'Work in this order. Tick each step off as you check it; add what you found.',
    steps: [
      { title: 'Inlet needle valve', body: 'Pull it and look at the tip under light. Any groove = replace. Confirm it is the four-sided type (three-sided valves may cause overflow in CV carbs).' },
      { title: 'Float tab', body: 'Set to the factory spec: 0.413–0.453 in. Too high = fuel level too high = overflow.' },
      { title: 'The float itself', body: 'Shake it; fuel sloshing inside means it is leaking and riding low (which holds the valve open). Also check the two halves are aligned.' },
      { title: 'Bowl O-ring', body: 'Any distortion or flat spots — replace it.' },
      { title: 'Bowl screws', body: 'Loose screws weep; snug them evenly.' },
      { title: 'Confirm the source', body: 'Make sure fuel is actually coming from the overflow hose, not a bowl gasket or loose fitting — they fool people.' }
    ]
  },
  bench: {
    title: 'Clone carb bench check',
    note: 'Check a replacement/clone carb against the factory spec before it ever goes on the bike. Clone jets are known to lie about their size.',
    steps: [
      { title: 'Read the jets', body: 'Bowl off, pull the main and slow jets, read the stamps under good light. They must read 170 / 42 (49-state). If you do not trust them, genuine Keihin jets thread straight into the clone — the first and cheapest fix.' },
      { title: 'Float level', body: 'Carb on its manifold side, tilted 15–20° off base. Caliper depth gauge from the O-ring flange face to the float perimeter: 0.413–0.453 in. Do not push on the float. Bend the tab to adjust.' },
      { title: 'Inlet valve type', body: 'Four-sided only. A three-sided inlet valve must NOT be used in a CV carb — it may cause overflow.' },
      { title: 'Shake the float', body: 'Fuel sloshing inside = leaking and riding low, which holds the inlet valve open.' },
      { title: 'Rubber inspection', body: 'Pump diaphragm and bowl O-ring are the clone weak points (cheap stock, ethanol eats it). Pinholes in the diaphragm = weak or no pump shot. Genuine-kit rubber is the swap.' },
      { title: 'Vacuum piston drop test', body: 'Engine off: lift the slide, release — it should drop smoothly to its stop. A sticky slide on a new clone = burr or casting flash in the bore.' },
      { title: 'Mixture-screw baseline', body: 'Community practice, not factory spec: if the screw is exposed, gently seat it, back out ~2.5 turns as a starting point, tune only at full operating temp.' }
    ]
  }
};

/* ------------------------------------------------------------------ */
/* UI — only runs in a browser.                                       */
/* ------------------------------------------------------------------ */
var store = null;
var selectedCarbId = null;
var currentView = 'journal';

function $(id) { return document.getElementById(id); }
function fieldLabel(key) {
  var all = SETUP_FIELDS.concat(RAN_FIELDS, CONDITION_FIELDS);
  for (var i = 0; i < all.length; i++) if (all[i][0] === key) return all[i][1];
  return key;
}
function fmtDate(iso) {
  if (!iso) return '';
  var parts = iso.split('-');
  if (parts.length !== 3) return iso;
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
}
function carbLabel(c) {
  var bike = store.bikes[c.bike_id];
  return c.nickname + (bike ? ' — ' + bike.name : '');
}
function toast(msg, isError) {
  var el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'toast'; }, 4000);
}
function persist() { saveStore(store); }

function showView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  var el = $('view-' + view);
  if (el) el.classList.add('active');
  document.querySelectorAll('.navbtn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view);
  });
  render();
}

function render() {
  renderJournal();
  renderBikes();
  renderReference();
  renderChecks();
  renderData();
}

function carbOptions(selected) {
  var carbs = Object.keys(store.carbs).map(function (id) { return store.carbs[id]; });
  carbs.sort(function (a, b) { return carbLabel(a).localeCompare(carbLabel(b)); });
  if (!carbs.length) return '<option value="">No carburetors yet — add one under Bikes &amp; Carbs</option>';
  return carbs.map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(carbLabel(c)) + ' (' + esc(c.status) + ')</option>';
  }).join('');
}

function renderJournal() {
  var sel = $('journal-carb');
  if (!sel) return;
  sel.innerHTML = carbOptions(selectedCarbId);
  if (!selectedCarbId || !store.carbs[selectedCarbId]) {
    var ids = Object.keys(store.carbs);
    selectedCarbId = ids.length ? ids[0] : null;
    sel.innerHTML = carbOptions(selectedCarbId);
  }
  var carb = selectedCarbId ? store.carbs[selectedCarbId] : null;
  var cur = $('journal-current');
  var hist = $('journal-history');
  if (!carb) {
    cur.innerHTML = '<p class="muted">No carburetors tracked yet. Go to <b>Bikes &amp; Carbs</b>, add a bike, add its carb, and set the factory baseline (source required).</p>';
    hist.innerHTML = '';
    return;
  }
  var setup = effectiveSetup(store, carb.id);
  var base = (carb.baseline && carb.baseline.specs) || {};
  var rows = SETUP_FIELDS.map(function (pair) {
    if (setup[pair[0]] == null) return '';
    var badge = '';
    if (base[pair[0]] != null) {
      badge = setup[pair[0]] === base[pair[0]]
        ? '<span class="badge stock">STOCK</span>'
        : '<span class="badge changed">≠ stock</span>';
    } else {
      badge = '<span class="badge nobase">no baseline</span>';
    }
    return '<tr><td>' + esc(pair[1]) + '</td><td>' + esc(setup[pair[0]]) + '</td><td>' + badge + '</td></tr>';
  }).join('');
  cur.innerHTML = '<h3>Current setup — ' + esc(carb.nickname) + '</h3>' +
    (rows ? '<table class="setup"><tbody>' + rows + '</tbody></table>'
          : '<p class="muted">Nothing recorded yet. Set a baseline or log a change.</p>') +
    (carb.baseline && carb.baseline.source
      ? '<p class="source">Baseline source: ' + esc(carb.baseline.source) + '</p>'
      : '<p class="source warn">No baseline yet — set one below so STOCK / ≠ stock means something.</p>');
  var entries = entriesFor(store, carb.id).slice().reverse();
  if (!entries.length) {
    hist.innerHTML = '<p class="muted">No entries yet. Log the first change below.</p>';
    return;
  }
  hist.innerHTML = entries.map(function (e) {
    var deltas = entryDeltas(store, e).map(function (d) {
      return '<div class="delta"><b>' + esc(fieldLabel(d.key)) + '</b> ' +
        (d.from == null ? '<i>(not set)</i>' : esc(d.from)) + ' → <b>' + esc(d.to) + '</b></div>';
    }).join('');
    var ran = RAN_FIELDS.filter(function (p) { return e.ran[p[0]]; }).map(function (p) {
      return '<div><b>' + esc(p[1]) + ':</b> ' + esc(e.ran[p[0]]) + '</div>';
    }).join('');
    var cond = CONDITION_FIELDS.filter(function (p) { return e.conditions[p[0]] != null; }).map(function (p) {
      return esc(p[1]) + ': ' + esc(e.conditions[p[0]]);
    }).join(' · ');
    return '<article class="entry"><header><b>#' + e.num + '</b> — ' + esc(fmtDate(e.date)) +
      (e.mileage != null ? ' @ ' + e.mileage.toLocaleString() + ' mi' : '') +
      ' <button class="mini danger" data-del-entry="' + esc(e.id) + '">Delete</button></header>' +
      deltas + (cond ? '<div class="cond">' + cond + '</div>' : '') + ran +
      (e.notes ? '<div><b>Notes:</b> ' + esc(e.notes) + '</div>' : '') + '</article>';
  }).join('');
}

function renderBikes() {
  var bikes = Object.keys(store.bikes).map(function (id) { return store.bikes[id]; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  $('bikes-list').innerHTML = bikes.length ? bikes.map(function (b) {
    var carbs = Object.keys(store.carbs).filter(function (id) { return store.carbs[id].bike_id === b.id; });
    return '<article class="card"><header><b>' + esc(b.name) + '</b> ' +
      (b.year ? esc(b.year) + ' ' : '') + esc([b.make, b.model].filter(Boolean).join(' ')) +
      ' <button class="mini danger" data-del-bike="' + esc(b.id) + '">Delete bike</button></header>' +
      '<div class="muted">' + (b.odometer != null ? 'Odometer: ' + b.odometer.toLocaleString() + ' mi' : 'Odometer: not set') +
      (b.notes ? ' · ' + esc(b.notes) : '') + '</div>' +
      (carbs.length ? carbs.map(function (cid) {
        var c = store.carbs[cid];
        var n = entriesFor(store, cid).length;
        return '<div class="carbrow"><b>' + esc(c.nickname) + '</b> — ' + esc(c.model) +
          ' <span class="muted">(' + esc(c.status) + ', ' + n + ' ' + (n === 1 ? 'entry' : 'entries') + ')</span>' +
          ' <button class="mini danger" data-del-carb="' + esc(c.id) + '">Delete</button></div>';
      }).join('') : '<div class="muted">No carbs yet for this bike.</div>') + '</article>';
  }).join('') : '<p class="muted">No bikes yet. Add your first bike below.</p>';
  var bikeSel = $('carb-bike');
  bikeSel.innerHTML = bikes.length ? bikes.map(function (b) {
    return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';
  }).join('') : '<option value="">Add a bike first</option>';
  var baseSel = $('baseline-carb');
  baseSel.innerHTML = carbOptions(selectedCarbId);
}

function renderReference() {
  $('ref-factory').innerHTML = CV40_FACTORY.map(function (s) {
    return '<tr><td>' + esc(s.label) + '</td><td>' + esc(s.value) + '</td></tr>';
  }).join('');
  $('ref-tuning').innerHTML = CV40_TUNING.map(function (t) {
    return '<article class="tip"><h4>' + esc(t.title) + '</h4><p>' + esc(t.body) + '</p></article>';
  }).join('');
  $('ref-super-e').innerHTML = SS_SUPER_E_FACTORY.map(function (s) {
    return '<tr><td>' + esc(s.label) + '</td><td>' + esc(s.value) + '</td></tr>';
  }).join('');
  $('ref-super-e-tuning').innerHTML = SS_SUPER_E_TUNING.map(function (t) {
    return '<article class="tip"><h4>' + esc(t.title) + '</h4><p>' + esc(t.body) + '</p></article>';
  }).join('');
}

function checklistProgress(listId) {
  var state = (store.checks[listId] || {});
  var done = Object.keys(state).filter(function (k) { return state[k].done; }).length;
  return { done: done, total: CHECKLISTS[listId].steps.length };
}

function renderChecks() {
  ['leak', 'bench'].forEach(function (listId) {
    var list = CHECKLISTS[listId];
    var state = store.checks[listId] || {};
    var prog = checklistProgress(listId);
    var el = $('checks-' + listId);
    el.innerHTML = '<h3>' + esc(list.title) + ' <span class="muted">(' + prog.done + '/' + prog.total + ' done)</span></h3>' +
      '<p class="muted">' + esc(list.note) + '</p>' +
      list.steps.map(function (step, i) {
        var s = state[i] || {};
        return '<article class="check' + (s.done ? ' done' : '') + '"><label>' +
          '<input type="checkbox" data-check="' + listId + ':' + i + '"' + (s.done ? ' checked' : '') + '> ' +
          '<b>' + (i + 1) + '. ' + esc(step.title) + '</b></label><p>' + esc(step.body) + '</p>' +
          '<input type="text" placeholder="What you found (optional)" data-checknote="' + listId + ':' + i + '" value="' + esc(s.note || '') + '">' +
          '</article>';
      }).join('') +
      '<button class="secondary" data-reset-checks="' + listId + '">Reset this checklist</button>';
  });
}

function renderData() {
  $('data-counts').textContent =
    Object.keys(store.bikes).length + ' bikes · ' +
    Object.keys(store.carbs).length + ' carbs · ' +
    store.entries.length + ' entries';
}

function setupFieldInputs(prefix, values) {
  return SETUP_FIELDS.map(function (pair) {
    return '<label>' + esc(pair[1]) + '<input type="text" id="' + prefix + '-' + pair[0] + '" value="' + esc(values[pair[0]] || '') + '"></label>';
  }).join('');
}

function init() {
  store = loadStore();
  document.querySelectorAll('.navbtn').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });
  $('journal-carb').addEventListener('change', function (e) {
    selectedCarbId = e.target.value || null; render();
  });
  $('baseline-carb').addEventListener('change', function (e) {
    selectedCarbId = e.target.value || null; render();
  });
  $('log-form').innerHTML =
    '<label>Carburetor<select id="log-carb-select"></select></label>' +
    '<div class="grid">' +
    '<label>Date<input type="date" id="log-date"></label>' +
    '<label>Mileage<input type="number" id="log-mileage" inputmode="numeric" placeholder="e.g. 61245"></label>' +
    '<label>Temp (F)<input type="number" id="log-temp_f" inputmode="numeric"></label>' +
    '<label>Altitude (ft)<input type="number" id="log-altitude_ft" inputmode="numeric"></label>' +
    '<label>Humidity (%)<input type="number" id="log-humidity" inputmode="numeric"></label></div>' +
    '<fieldset><legend>What changed (only fill in what you touched)</legend><div class="grid">' +
    SETUP_FIELDS.map(function (p) {
      return '<label>' + esc(p[1]) + '<input type="text" id="log-' + p[0] + '"></label>';
    }).join('') + '</div></fieldset>' +
    '<fieldset><legend>How it ran</legend><div class="grid">' +
    RAN_FIELDS.map(function (p) {
      return '<label>' + esc(p[1]) + '<input type="text" id="log-' + p[0] + '"></label>';
    }).join('') + '</div></fieldset>' +
    '<label>Notes<textarea id="log-notes" rows="3"></textarea></label>' +
    '<button type="submit" class="primary">Log this change</button>';
  /* The select lives inside the form; keep it in sync with the header one. */
  var logSel = $('log-carb-select');
  $('log-form').addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var changes = {}, ran = {}, conditions = {};
      SETUP_FIELDS.forEach(function (p) { changes[p[0]] = $('log-' + p[0]).value; });
      RAN_FIELDS.forEach(function (p) { ran[p[0]] = $('log-' + p[0]).value; });
      CONDITION_FIELDS.forEach(function (p) { conditions[p[0]] = $('log-' + p[0]).value; });
      var res = logEntry(store, {
        carb_id: logSel.value, date: $('log-date').value, mileage: $('log-mileage').value,
        changes: changes, ran: ran, conditions: conditions, notes: $('log-notes').value
      });
      persist();
      selectedCarbId = logSel.value;
      $('log-form').reset();
      render();
      toast('Logged entry #' + res.entry.num + (res.warnings.length ? ' — ' + res.warnings.join(' ') : ''));
    } catch (err) { toast(err.message, true); }
  });
  $('bike-form').addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var b = addBike(store, {
        name: $('bike-name').value, year: $('bike-year').value,
        make: $('bike-make').value, model: $('bike-model').value,
        odometer: $('bike-odometer').value, notes: $('bike-notes').value
      });
      persist(); $('bike-form').reset(); render();
      toast('Bike added: ' + b.name);
    } catch (err) { toast(err.message, true); }
  });
  $('carb-form').addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var c = addCarb(store, {
        bike_id: $('carb-bike').value, model: $('carb-model').value,
        nickname: $('carb-nickname').value, status: $('carb-status').value,
        notes: $('carb-notes').value
      });
      persist(); selectedCarbId = c.id; $('carb-form').reset(); render();
      toast('Carb added: ' + c.nickname);
    } catch (err) { toast(err.message, true); }
  });
  $('baseline-form').addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var specs = {};
      SETUP_FIELDS.forEach(function (p) { specs[p[0]] = $('base-' + p[0]).value; });
      setBaseline(store, $('baseline-carb').value, specs, $('baseline-source').value);
      persist(); $('baseline-form').reset(); render();
      toast('Baseline saved (source required — and cited).');
    } catch (err) { toast(err.message, true); }
  });
  $('baseline-fields').innerHTML = setupFieldInputs('base', {});
  document.body.addEventListener('click', function (e) {
    var t = e.target;
    var delEntry = t.dataset.delEntry;
    var delCarb = t.dataset.delCarb;
    var delBike = t.dataset.delBike;
    var reset = t.dataset.resetChecks;
    if (delEntry) {
      if (confirm('Delete this entry? Entry numbers are never reused.')) {
        try { deleteEntry(store, delEntry); persist(); render(); toast('Entry deleted.'); }
        catch (err) { toast(err.message, true); }
      }
    } else if (delCarb) {
      if (confirm('Delete this carburetor and its whole journal?')) {
        try { deleteCarb(store, delCarb); persist(); render(); toast('Carb deleted.'); }
        catch (err) { toast(err.message, true); }
      }
    } else if (delBike) {
      if (confirm('Delete this bike, its carbs, and all their journals?')) {
        try { deleteBike(store, delBike); persist(); render(); toast('Bike deleted.'); }
        catch (err) { toast(err.message, true); }
      }
    } else if (reset) {
      store.checks[reset] = {}; persist(); render();
    }
  });
  document.body.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.check) {
      var parts = t.dataset.check.split(':');
      store.checks[parts[0]] = store.checks[parts[0]] || {};
      store.checks[parts[0]][parts[1]] = store.checks[parts[0]][parts[1]] || {};
      store.checks[parts[0]][parts[1]].done = t.checked;
      persist(); renderChecks();
    }
  });
  document.body.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.checknote) {
      var parts = t.dataset.checknote.split(':');
      store.checks[parts[0]] = store.checks[parts[0]] || {};
      store.checks[parts[0]][parts[1]] = store.checks[parts[0]][parts[1]] || {};
      store.checks[parts[0]][parts[1]].note = t.value;
      persist(); /* no re-render: would steal focus mid-typing */
    }
  });
  $('export-btn').addEventListener('click', function () {
    var blob = new Blob([exportJSON(store)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'carb-tune-journal.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported carb-tune-journal.json');
  });
  $('copy-export-btn').addEventListener('click', function () {
    navigator.clipboard.writeText(exportJSON(store)).then(
      function () { toast('Journal JSON copied to clipboard.'); },
      function () { toast('Clipboard blocked — use Download instead.', true); });
  });
  $('import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { doImport(reader.result); };
    reader.readAsText(file);
  });
  $('import-btn').addEventListener('click', function () { doImport($('import-text').value); });
  $('sample-btn').addEventListener('click', function () {
    if (Object.keys(store.bikes).length && !confirm('Load example data? This replaces your current journal — export first if you want to keep it.')) return;
    store = sampleStore();
    selectedCarbId = null;
    persist(); render();
    toast('Example journal loaded. Delete it any time from Bikes & Carbs.');
  });
  $('clear-btn').addEventListener('click', function () {
    if (confirm('Delete EVERYTHING in this journal? Export first if you want a backup.')) {
      store = emptyStore(); selectedCarbId = null;
      persist(); render(); toast('Journal cleared.');
    }
  });
  function doImport(text) {
    try {
      var imported = validateImport(text);
      if (Object.keys(store.bikes).length && !confirm('Import replaces your current journal. Continue? (Export first if you want a backup.)')) return;
      store = imported; selectedCarbId = null;
      persist(); render();
      toast('Imported: ' + Object.keys(store.bikes).length + ' bikes, ' +
        Object.keys(store.carbs).length + ' carbs, ' + store.entries.length + ' entries.');
    } catch (err) { toast('Import failed: ' + err.message, true); }
  }
  render();
  /* Keep the three carb selectors in sync after every render. */
  var sync = function () {
    var v = selectedCarbId;
    ['journal-carb', 'baseline-carb'].forEach(function (id) {
      var el = $(id); if (el && v) el.value = v;
    });
    if (logSel && v) logSel.value = v;
  };
  var origRender = render;
  render = function () { origRender(); sync(); if (logSel) logSel.innerHTML = carbOptions(selectedCarbId); };
  render();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SETUP_FIELDS: SETUP_FIELDS, RAN_FIELDS: RAN_FIELDS, CONDITION_FIELDS: CONDITION_FIELDS,
    emptyStore: emptyStore, loadStore: loadStore, saveStore: saveStore,
    addBike: addBike, addCarb: addCarb, setBaseline: setBaseline,
    effectiveSetup: effectiveSetup, entriesFor: entriesFor, entryDeltas: entryDeltas,
    logEntry: logEntry, deleteEntry: deleteEntry, deleteCarb: deleteCarb, deleteBike: deleteBike,
    validateImport: validateImport, exportJSON: exportJSON, sampleStore: sampleStore,
    CV40_FACTORY: CV40_FACTORY, CV40_TUNING: CV40_TUNING, CHECKLISTS: CHECKLISTS,
    SS_SUPER_E_FACTORY: SS_SUPER_E_FACTORY, SS_SUPER_E_TUNING: SS_SUPER_E_TUNING
  };
}
