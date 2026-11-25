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
/* Pocket Garage handoff (receiving side) — see HANDOFF-FORMAT.md.    */
/* This app accepts kind "diagnosis-to-carb" only, delivered as a     */
/* ?handoff=<base64url(JSON)> URL parameter (or pasted JSON on the    */
/* Data tab). The payload is validated, the bike is resolved by       */
/* roster key first / name match second, and NOTHING is written until */
/* the user confirms on the card. The wizard outcome is never         */
/* recorded by the handoff — the user taps it in the wizard.          */
/* ------------------------------------------------------------------ */
var HANDOFF_FORMAT = 'pocket-garage-handoff';
var HANDOFF_VERSION = 1;
var HANDOFF_KIND = 'diagnosis-to-carb';
var HANDOFF_MAX_CHARS = 8000;

function b64urlEncode(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(s)));
}
function encodePocketHandoff(obj) {
  return b64urlEncode(JSON.stringify(obj));
}
function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

/* Validate a decoded handoff object. Returns a normalized copy or
 * throws with a plain-words reason. */
function validatePocketHandoff(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('That link is not a Pocket Garage handoff.');
  if (obj.format !== HANDOFF_FORMAT) throw new Error('That link is not a Pocket Garage handoff (wrong format).');
  if (obj.version !== HANDOFF_VERSION) throw new Error('That handoff is version ' + obj.version + ' — this app only takes version ' + HANDOFF_VERSION + '.');
  if (obj.kind !== HANDOFF_KIND) throw new Error('This app takes diagnosis handoffs, not "' + obj.kind + '".');
  if (!isNonEmptyString(obj.sentAt) || isNaN(Date.parse(obj.sentAt))) throw new Error('That handoff has no usable sent date.');
  if (!isNonEmptyString(obj.from)) throw new Error('That handoff does not say which app sent it.');
  if (!obj.bike || !isNonEmptyString(obj.bike.rosterKey)) throw new Error('That handoff does not say which bike it is for.');
  if (!isNonEmptyString(obj.bike.name)) throw new Error('That handoff has no bike name.');
  var p = obj.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('That handoff has no diagnosis in it.');
  ['treeId', 'treeTitle', 'topCause', 'cause', 'test', 'fix', 'urgency', 'safeToRide'].forEach(function (k) {
    if (!isNonEmptyString(p[k])) throw new Error('That handoff is missing "' + k + '".');
  });
  if (['low', 'medium', 'high', 'critical'].indexOf(p.urgency) === -1) throw new Error('That handoff has an unknown urgency: ' + p.urgency + '.');
  var conf = p.confidencePct == null ? null : p.confidencePct;
  if (conf !== null && (typeof conf !== 'number' || conf < 0 || conf > 100)) throw new Error('That handoff has a bad confidence value.');
  return {
    format: obj.format, version: obj.version, kind: obj.kind,
    sentAt: obj.sentAt, from: obj.from,
    bike: { rosterKey: obj.bike.rosterKey.trim(), name: obj.bike.name.trim() },
    payload: {
      treeId: p.treeId, treeTitle: p.treeTitle, topCause: p.topCause,
      cause: p.cause, test: p.test, fix: p.fix, urgency: p.urgency,
      safeToRide: p.safeToRide, confidencePct: conf,
      wizardStepId: isNonEmptyString(p.wizardStepId) ? p.wizardStepId.trim() : null,
      wizardOutcome: isNonEmptyString(p.wizardOutcome) ? p.wizardOutcome.trim() : null,
      carbModelHint: isNonEmptyString(p.carbModelHint) ? p.carbModelHint.trim() : null
    }
  };
}

/* Parse handoff text: raw JSON (pasted) or base64url JSON (from the
 * ?handoff= parameter). Throws with a plain-words reason. */
function parsePocketHandoff(text) {
  if (text == null) throw new Error('Nothing to read — no handoff there.');
  var raw = String(text).trim();
  if (!raw) throw new Error('Nothing to read — no handoff there.');
  if (raw.length > HANDOFF_MAX_CHARS * 2) throw new Error('That handoff is too big — handoffs are one record at a time.');
  var json;
  try {
    json = raw.charAt(0) === '{' ? raw : b64urlDecode(raw);
  } catch (e) {
    throw new Error('That link is not a readable handoff — the code in it is garbled.');
  }
  if (json.length > HANDOFF_MAX_CHARS) throw new Error('That handoff is too big — handoffs are one record at a time.');
  var obj;
  try { obj = JSON.parse(json); } catch (e) { throw new Error('That link is not a Pocket Garage handoff (not JSON).'); }
  return validatePocketHandoff(obj);
}

/* Bike-name matching, same rule as build sheets' linked-app match:
 * lowercase, letters/digits only, one name contains the other, both
 * at least 4 characters. Short strings never match. */
function normalizeBikeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function namesMatch(a, b) {
  var na = normalizeBikeName(a), nb = normalizeBikeName(b);
  if (na.length < 4 || nb.length < 4) return false;
  return na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}

/* Resolve which local bike a handoff belongs to. Roster key first
 * (a bike the user already pinned to that key); name match second,
 * only when exactly one bike matches; otherwise unknown — the UI
 * asks the user to pick. Never guesses, never creates a bike. */
function resolvePocketHandoffBike(store, handoff) {
  var key = handoff.bike.rosterKey;
  var ids = Object.keys(store.bikes);
  var i, b;
  for (i = 0; i < ids.length; i++) {
    b = store.bikes[ids[i]];
    if (b.rosterKey && b.rosterKey === key) return { status: 'matched', via: 'roster', bike: b, bikeId: ids[i] };
  }
  var hits = ids.filter(function (id) { return namesMatch(store.bikes[id].name, handoff.bike.name); });
  if (hits.length === 1) return { status: 'matched', via: 'name', bike: store.bikes[hits[0]], bikeId: hits[0] };
  return { status: 'unknown', via: null, bike: null, candidates: hits.length };
}

/* Pin a roster key to a bike — only called after the user confirms a
 * handoff onto that bike. Refuses if the key already belongs to a
 * different bike. */
function pinPocketRosterKey(store, rosterKey, bikeId) {
  var bike = store.bikes[bikeId];
  if (!bike) throw new Error('Bike not found.');
  var clash = Object.keys(store.bikes).some(function (id) {
    return id !== bikeId && store.bikes[id].rosterKey === rosterKey;
  });
  if (clash) throw new Error('That roster key already belongs to another bike in this journal.');
  bike.rosterKey = rosterKey;
  return bike;
}

/* The carb a handoff lands on: the bike's on-bike carb, else its
 * first carb, else null (the card then says the bike has no carb). */
function carbForHandoff(store, bikeId) {
  var carbs = Object.keys(store.carbs).map(function (id) { return store.carbs[id]; })
    .filter(function (c) { return c.bike_id === bikeId; });
  if (!carbs.length) return null;
  var onBike = carbs.filter(function (c) { return c.status === 'on-bike'; })[0];
  return onBike || carbs[0];
}

/* Validate the suggested wizard step/outcome against the wizard for
 * this carb. An unknown step or outcome is ignored (warning), never
 * forced — the wizard still opens and the user picks. */
function wizardHandoffTarget(store, handoff, bikeId) {
  var carb = carbForHandoff(store, bikeId);
  if (!carb) return { carb: null, step: null, outcome: null, warnings: ['This bike has no carburetor yet.'] };
  var warnings = [];
  var step = null, outcome = null;
  var wantStep = handoff.payload.wizardStepId;
  if (wantStep) {
    var steps = wizardSteps(carb.model);
    steps.forEach(function (s) { if (s.id === wantStep) step = s; });
    if (!step) {
      warnings.push('The suggested wizard step "' + wantStep + '" does not exist for a ' + carb.model + ' — open the wizard and pick the step yourself.');
    } else if (handoff.payload.wizardOutcome) {
      if (step.outcomes) {
        var ok = step.outcomes.some(function (o) { return o.id === handoff.payload.wizardOutcome; });
        if (ok) outcome = handoff.payload.wizardOutcome;
        else warnings.push('The suggested answer "' + handoff.payload.wizardOutcome + '" is not one of this step\'s answers — pick it yourself in the wizard.');
      } else if (handoff.payload.wizardOutcome === 'done') {
        outcome = 'done';
      } else {
        warnings.push('That step only records done / not done — pick it yourself in the wizard.');
      }
    }
  }
  return { carb: carb, step: step, outcome: outcome, warnings: warnings };
}

/* The citation written into the journal-entry notes when the user
 * logs a change from a handoff. Verbatim from the diagnosis. */
function handoffCitation(handoff) {
  var p = handoff.payload;
  var date = '';
  try { date = new Date(handoff.sentAt).toISOString().slice(0, 10); } catch (e) { date = handoff.sentAt; }
  return 'From the Evo Diagnostic, ' + date + ': ' + p.treeTitle + ' — ' + p.topCause +
    '. Test: ' + p.test + '. Fix: ' + p.fix + '. Safe to ride: ' + p.safeToRide + '.';
}

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
  return { bikes: {}, carbs: {}, entries: [], nextNum: {}, checks: {}, wizard: {} };
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
    data.wizard = data.wizard || {};
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
  /* Validate elevation BEFORE creating the bike, so a bad number
   * does not leave a half-added bike behind. */
  var elev = null;
  if (fields.elevation_ft !== '' && fields.elevation_ft != null) {
    elev = parseInt(fields.elevation_ft, 10);
    if (isNaN(elev)) throw new Error('Elevation must be a number (feet above sea level).');
    if (elev < 0 || elev > 14000) throw new Error('Elevation looks wrong — enter feet above sea level (0–14,000).');
  }
  store.bikes[id] = {
    id: id, name: name,
    year: fields.year || '', make: fields.make || '', model: fields.model || '',
    odometer: fields.odometer === '' || fields.odometer == null
      ? null : parseInt(fields.odometer, 10),
    odo_date: null, notes: fields.notes || '',
    elevation_ft: elev,
    elevation_source: elev == null ? '' : ((fields.elevation_source || 'manual').trim() || 'manual'),
    /* Pocket Garage handoff pin: the shared roster key (b1/b2/b3)
     * this bike was confirmed as. Null until a confirmed handoff
     * pins it — never set by a name match alone. */
    rosterKey: fields.rosterKey || null
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
      odo_date: b.odo_date || null, notes: b.notes || '',
      elevation_ft: b.elevation_ft == null ? null : b.elevation_ft,
      elevation_source: b.elevation_source || '',
      rosterKey: b.rosterKey || null
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
  return { bikes: bikes, carbs: carbs, entries: entries, nextNum: nextNum, checks: data.checks || {}, wizard: data.wizard || {} };
}

function exportJSON(store) {
  return JSON.stringify(store, null, 2);
}

function sampleStore() {
  var s = emptyStore();
  var bike = addBike(s, { name: 'Example 1990 Softail', year: '1990', make: 'Harley-Davidson', model: 'Heritage Softail', odometer: '61200', notes: 'Example data only — delete it and add your own bike.', elevation_ft: '1152', elevation_source: 'zip:85302' });
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

/* ------------------------------------------------------------------ */
/* Altitude.                                                           */
/*                                                                     */
/* What S&S actually publishes (Instruction 510-0251, the 2014        */
/* revision of the 51-1012 instruction line, "Elevation changes"       */
/* note): a direction, not a table. S&S gives NO per-foot jet-step     */
/* numbers anywhere in 51-1012 / 510-0251 / 510-0245 — the Jetting     */
/* Chart (p.14) is displacement baselines only. So this table ships   */
/* the verified direction + the verified first action, and says        */
/* plainly that exact jet steps come from road-testing (the wizard),   */
/* not from a published table. Anything that looks like a per-foot     */
/* jet-size number here would be invented — there is none.             */
/*                                                                     */
/* The table is deliberately shaped for reuse: the diagnostics app's   */
/* carb flow can import ALTITUDE_CORRECTION, altitudeAdvice() and      */
/* AZ_ZIP_ELEVATIONS as-is.                                            */
/* ------------------------------------------------------------------ */
var ALTITUDE_CORRECTION = {
  source: 'S&S Cycle Instruction 510-0251 (2014 revision of the 51-1012 instruction line), "Elevation changes" note; Harley-Davidson Sportster Service Manual #99484-98, p.191; Softail 1984–1999 Repair Manual, p.303.',
  noNumericTable: true,
  noNumericTableNote: 'No published per-foot jet-step table exists in S&S 51-1012 / 510-0251 / 510-0245, in the factory Harley manuals in the garage library, or in the Easyriders magazine index (searched Nov 2026 — only Edelbrock ads mention altitude). S&S publishes the direction and the first action; the exact jet size comes from road-testing your bike at that elevation, one size at a time.',
  rules: [
    { title: 'Try the mixture screw first', body: 'A simple readjustment of the idle mixture screw will often compensate for changes in elevation of several thousand feet. S&S test riders have ridden through changes upwards of 7,000 feet without changing jets.' },
    { title: 'Higher elevation = richer', body: 'Higher elevation makes the engine run richer, meaning smaller jets may be required to correct the overly rich condition. Thinner air, same jets, more fuel per gulp of air.' },
    { title: 'Lower elevation = leaner', body: 'Lower elevation, nearer sea level, makes the engine leaner, so larger jets may be required. If smaller jets were installed for higher elevation, remember to install larger jets for operation at lower elevation.' },
    { title: 'Change the intermediate jet first', body: 'In most cases the intermediate jet should be changed to properly address an elevation/altitude-related problem — it provides the majority of fuel under average operating conditions, from just off idle to about 2,500–3,000 rpm.' },
    { title: 'Mixture screw after every jet change', body: 'Whenever an intermediate jet is changed, the idle mixture screw must be readjusted — same rule as at home elevation.' }
  ],
  cvNote: 'Keihin CV40 partial self-compensation (Sportster Service Manual #99484-98, p.191): as atmospheric pressure drops with altitude, the pressure difference between the vacuum-piston chambers falls, so less fuel is delivered — the CV partially holds the air/fuel ratio on its own. A CV bike still wants its pilot checked after a big elevation change, but it needs less correction than a butterfly carb. The Softail 1984–1999 Repair Manual (p.303) lists "in use at considerably higher or lower altitudes" as a reason rejetting may be necessary.'
};

/* ------------------------------------------------------------------ */
/* Weather: temperature and humidity.                                  */
/*                                                                     */
/* The rest of jetting correction, and the honest answer is the same   */
/* shape as altitude: direction, not a table. Temperature and          */
/* humidity move jetting through air density, exactly like altitude    */
/* does — but NO published per-degree or per-percent jet-step table    */
/* exists anywhere checked: not in S&S 51-1012 / 510-0251 / 510-0245  */
/* (no temperature or humidity content at all), not in the factory     */
/* Harley manuals (FSM §4 carburetor chapters), not in Clymer Evo     */
/* 84-98, and not in the Easyriders magazine index (searched Nov      */
/* 2026). What the sources DO publish: the factory manual names a     */
/* considerably hotter or colder climate as a reason rejetting *may*   */
/* be necessary — then refuses to give a size and sends you to a       */
/* dealer or performance tuner — and the magazine gives a working      */
/* rule (tune lean on a cool, dry day), not a table. So this table     */
/* ships the verified direction + the verified working rule, and      */
/* says plainly that exact jet steps come from road-testing, one size  */
/* at a time. Anything that looks like a per-degree or per-percent     */
/* jet-size number here would be invented — there is none.             */
/*                                                                     */
/* There is no weatherAdvice() to go with it: a computable function   */
/* would need a threshold ("hotter than X°F means one size...") and   */
/* no published threshold exists. The journal already logs Temp (F)   */
/* and Humidity (%) on every entry (CONDITION_FIELDS) — that is the    */
/* weather half's working tool: judge the tune against the logged      */
/* conditions, not against a made-up number.                           */
/* ------------------------------------------------------------------ */
var WEATHER_CORRECTION = {
  source: 'Harley-Davidson Softail 1984–1999 Repair Manual, p.303; Easyriders ER_166 §74; Easyriders ER_243 §33.',
  noNumericTable: true,
  noNumericTableNote: 'No published per-degree or per-percent jet-step table exists — not in S&S 51-1012 / 510-0251 / 510-0245, not in the factory Harley manuals in the garage library (FSM §4 carburetor chapters), not in Clymer Evo 84-98, and not in the Easyriders magazine index (searched Nov 2026). The factory manual lists a considerably hotter or colder climate as a reason rejetting may be necessary, then sends you to a dealer or performance tuner for the jet size — it publishes no number either. The magazine gives a working rule (tune lean on a cool, dry day), not a table. The exact jet size comes from road-testing your bike, one size at a time.',
  rules: [
    { title: 'Hotter or colder climate is a factory-listed reason to rejet', body: 'Softail 1984–1999 Repair Manual, p.303: rejetting the carburetor may be necessary if "the motorcycle is in use at considerably higher or lower altitudes or in a considerably hotter or colder climate than in the past." That is as far as the factory goes — the same page says to check with a dealer or motorcycle performance tuner for recommendations as to the size of jets to install for your specific situation.' },
    { title: 'Hot, humid air runs richer — cold, dry air runs leaner', body: 'Direction only, and it is the magazine\'s own implication: ER_166 §74 tells you to tune for the lean side on a cool, dry day, which only makes sense if a cool, dry day is the lean side and hot, humid air is the rich side. So a bike jetted right on a cool, dry morning reads richer on a hot, humid afternoon and leaner on a cold, dry one. No published number says by how much — one size at a time, road-tested.' },
    { title: 'Tune for the lean side on a cool, dry day', body: 'Easyriders ER_166 §74: "Keep in mind that altitude, temperature, and humidity all play a role in determining the correct jets. These factors won\'t be of much concern if you tune for the lean side on a cool, dry day at the altitude you plan to do most of your riding." Set the home baseline on a cool, dry day at home elevation, and judge every other day against it.' },
    { title: 'Log the weather with every entry', body: 'The journal already records Temp (F), Altitude (ft) and Humidity (%) on every log entry. Use them: a rich reading on a hot Phoenix afternoon, or a lean reading on a cold desert morning, may be the day, not the jets. Check the logged conditions before changing a jet.' },
    { title: 'Air density is the one thing changing', body: 'Easyriders ER_243 §33: "what happens if the air density (think elevation) changes?" Altitude, temperature and humidity all move air density, and the carb only sees density — thinner air can\'t draw fuel as well. That is why the same three rules (mixture screw first, one size at a time, road-test it) cover all three factors.' }
  ]
};

/* Arizona ZIP → town elevation (ft), town-centre figures from the
 * Arizona Office of Tourism city-elevation list. A small bundled
 * table on purpose: a full US ZIP table is far too big to ship, and
 * these are the towns a Phoenix rider actually rides to. Your exact
 * spot can sit a few hundred feet off the town figure — type your own
 * number if you know it. */
var AZ_ELEVATION_SOURCE = 'Arizona Office of Tourism city elevations (town-centre figures)';
var AZ_ZIP_ELEVATIONS = {
  '85004': { town: 'Phoenix', ft: 1086 },
  '85132': { town: 'Florence', ft: 1489 },
  '85251': { town: 'Scottsdale', ft: 1257 },
  '85281': { town: 'Tempe', ft: 1181 },
  '85302': { town: 'Glendale', ft: 1152 },
  '85337': { town: 'Gila Bend', ft: 735 },
  '85364': { town: 'Yuma', ft: 141 },
  '85621': { town: 'Nogales', ft: 3832 },
  '85635': { town: 'Sierra Vista', ft: 4632 },
  '85701': { town: 'Tucson', ft: 2490 },
  '85901': { town: 'Show Low', ft: 6322 },
  '86001': { town: 'Flagstaff', ft: 6903 },
  '86040': { town: 'Page', ft: 4350 },
  '86301': { town: 'Prescott', ft: 5374 },
  '86326': { town: 'Cottonwood', ft: 3327 },
  '86336': { town: 'Sedona', ft: 4350 },
  '86401': { town: 'Kingman', ft: 3350 },
  '86403': { town: 'Lake Havasu City', ft: 738 }
};

function lookupZipElevation(zip) {
  if (zip == null) return null;
  var z = String(zip).replace(/[^0-9]/g, '').slice(0, 5);
  if (z.length !== 5) return null;
  var row = AZ_ZIP_ELEVATIONS[z];
  return row ? { zip: z, town: row.town, ft: row.ft } : null;
}

/* Direction-only altitude advice. homeFt = elevation the bike is
 * jetted for (the bike's stored elevation); rideFt = where you are
 * riding. Returns the S&S direction — never a jet size, because S&S
 * publishes none. Deltas under 500 ft are "same": well inside the
 * range the mixture screw covers on its own (S&S: "several thousand
 * feet"). */
function altitudeAdvice(homeFt, rideFt) {
  var h = parseInt(homeFt, 10), r = parseInt(rideFt, 10);
  if (isNaN(h) || isNaN(r)) {
    return { status: 'unknown', deltaFt: null, direction: null,
      firstAction: 'Enter both elevations to get S&S altitude advice.',
      jetAction: null, note: ALTITUDE_CORRECTION.rules[0].body };
  }
  var delta = r - h;
  if (Math.abs(delta) < 500) {
    return { status: 'same', deltaFt: delta, direction: 'same',
      firstAction: 'Within 500 ft of home — no jet change expected. The idle mixture screw covers this on its own.',
      jetAction: null, note: ALTITUDE_CORRECTION.rules[0].body };
  }
  if (delta > 0) {
    return { status: 'richer', deltaFt: delta, direction: 'richer',
      firstAction: 'You are ' + delta.toLocaleString() + ' ft above home elevation. Re-adjust the idle mixture screw first — it often covers several thousand feet on its own.',
      jetAction: 'If the screw cannot clean it up, the bike is running rich: smaller jets may be required. Change the intermediate jet first (S&S: "in most cases"), one size at a time, and re-adjust the mixture screw after every change. Remember to put the larger jets back when you return to lower elevation.',
      note: ALTITUDE_CORRECTION.rules[0].body };
  }
  return { status: 'leaner', deltaFt: delta, direction: 'leaner',
    firstAction: 'You are ' + Math.abs(delta).toLocaleString() + ' ft below home elevation. Re-adjust the idle mixture screw first.',
    jetAction: 'If the screw cannot clean it up, the bike is running lean: larger jets may be required. Change the intermediate jet first, one size at a time, and re-adjust the mixture screw after every change.',
    note: ALTITUDE_CORRECTION.rules[0].body };
}

function setBikeElevation(store, bikeId, ft, source) {
  var bike = store.bikes[bikeId];
  if (!bike) throw new Error('Bike not found.');
  var n = parseInt(ft, 10);
  if (isNaN(n)) throw new Error('Elevation must be a number (feet above sea level).');
  if (n < 0 || n > 14000) throw new Error('Elevation looks wrong — enter feet above sea level (0–14,000).');
  bike.elevation_ft = n;
  bike.elevation_source = (source || 'manual').trim() || 'manual';
  return bike;
}

/* ------------------------------------------------------------------ */
/* Jetting wizard. Step definitions are pure data so the order and    */
/* the citations are testable. Every step carries its source and a     */
/* tag: FACTORY (S&S instruction sheet / factory manual), COMMUNITY    */
/* (rider practice, not a factory spec), or UNVERIFIED (could not be   */
/* confirmed against a published source — shown, never presented as    */
/* verified). The S&S path follows S&S's own tuning order: idle        */
/* mixture → idle speed → pump OFF → intermediate jet → main jet       */
/* (always last) → pump set last. The roll-off cross-check is the      */
/* one step S&S does NOT publish: it is in neither #510-0245 nor      */
/* 510-0251/51-1012, and is labelled UNVERIFIED, with S&S's roll-on   */
/* test as the deciding test.                                          */
/*                                                                     */
/* Mixture-screw thresholds: the wizard uses S&S's own numbers        */
/* (>1¾ turns out = intermediate too small; <1¼ = may need smaller).  */
/* The older magazine rule of thumb in the reference section           */
/* (<½ turn = too large; >1¼ = too small) disagrees with S&S — the    */
/* wizard says so on the idle step, and S&S wins.                      */
/* ------------------------------------------------------------------ */
var SS_WIZARD_STEPS = [
  { id: 'ss-baseline', title: '1. Verify stock settings', tag: 'FACTORY', source: 'S&S Quick Tuning Guide #510-0245, step 1; Jetting Chart p.14',
    body: 'Before touching anything, confirm the carb is at S&S stock: idle mixture screw 1¼ turns out from lightly seated, idle speed screw ½ turn clockwise from the engagement point, accelerator pump screw 2 turns counter-clockwise from seated. 74–88ci baselines: intermediate jet .0295, main jet .072. Jetting is a starting point only — S&S says so: re-jet for best performance on your bike.' },
  { id: 'ss-warm', title: '2. Warm the engine fully', tag: 'FACTORY', source: 'S&S #510-0245, step 2; Instruction 510-0251, "Adjusting Intermediate System"',
    body: 'Start the bike and ride several miles to bring the engine up to normal operating temperature. Tune only at full operating temp — idle adjustments made on a cold engine will read rich once it is hot. Below 60°F the engine may need 10–15 minutes of normal riding to get there.' },
  { id: 'ss-idle', title: '3. Idle mixture, then idle speed', tag: 'FACTORY', source: 'S&S #510-0245, steps 3–4; Instruction 510-0251, "Adjusting Idle Circuit"',
    body: 'Set idle speed to 950–1050 rpm. Then turn the mixture screw slowly: clockwise until the engine stumbles, counter-clockwise until it stumbles, and set it halfway between — or at the strongest idle. Correctly adjusted, the screw normally lands between 1¼ and ¾ turns out. S&S diagnostic: more than 1¾ turns out after correct adjustment means the intermediate jet is probably too small (go one size larger); less than 1¼ turns out means it may need one size smaller. NOTE: an older magazine rule of thumb in the reference section says <½ turn = too large / >1¼ turns = too small — that disagrees with S&S. S&S wins; the magazine rule is a pointer, not a measurement. Turning the screw out (counter-clockwise) makes the idle richer; in makes it leaner. Seat the screw gently — never force it.' },
  { id: 'ss-pump-off', title: '4. Shut the accelerator pump OFF', tag: 'FACTORY', source: 'S&S Instruction 510-0251, "Intermediate System Notes"',
    body: 'Turn the pump adjustment screw clockwise until it lightly seats — do not force it. Pump fuel masks jetting symptoms while you fine-tune the intermediate circuit, so it stays off until the jets are right. You set it last, in step 8.' },
  { id: 'ss-intermediate', title: '5. Intermediate jet first — never the main', tag: 'FACTORY', source: 'S&S #510-0245, steps 6–7; Instruction 510-0251, "Adjusting Intermediate System"',
    body: 'Ride at a steady 40–50 mph and slowly roll the throttle on from a steady speed at about 2,000, 2,500, and 3,000 rpm. The intermediate jet controls fuel from just off idle to about 2,500–3,000 rpm (55–60 mph) — it does most of the work in normal riding, so it gets tuned first. S&S rule, every time: whenever an intermediate jet is changed, the idle mixture screw must be re-adjusted, and the idle speed with it. Pick what the bike did below and the wizard tells you the next move.',
    outcomes: [
      { id: 'lean', label: 'Sneezing / popping through the air cleaner', result: 'Too lean. Go ONE size larger on the intermediate jet, then re-adjust the idle mixture and idle speed screws and road-test again. Smallest intermediate jet that clears the popping gives the best gas mileage.' },
      { id: 'rich', label: 'Rough low-speed running, fouled plugs, black smoke, bad mileage', result: 'Too rich. Go ONE size smaller on the intermediate jet, then re-adjust the idle mixture and idle speed screws and road-test again.' },
      { id: 'clean', label: 'Runs clean at 40–50 mph, no popping, no stumble', result: 'Intermediate jet is right. Move on to the main jet — and remember, the main jet is always last.' }
    ],
    logField: 'pilot_jet', logLabel: 'Log intermediate jet change' },
  { id: 'ss-main', title: '6. Main jet — always last', tag: 'FACTORY', source: 'S&S #510-0245, step 8; Instruction 510-0251, "High Speed (Main) Jetting Procedure — Street Procedure"',
    body: 'Roll-on from 50 to 70 mph in 3rd gear. Main-jet changes are .004 in. steps, and the main circuit only matters from about 2,500–3,000 rpm up to maximum speed. Pick what the bike did:',
    outcomes: [
      { id: 'lean', label: 'Backfires or breaks up in the carb', result: 'Too small. Increase the main jet by .004 in. and road-test again.' },
      { id: 'rich', label: 'Flat, will not accelerate, blubbers', result: 'Too large. Decrease the main jet by .004 in. and road-test again.' },
      { id: 'clean', label: 'Accelerates strongest / quickest through the gears', result: 'Main jet is right. S&S note: about .006 in. too lean makes the engine break up and quit; about .006 in. too rich makes it blubber and miss — so "just right" sits in a narrow window. Now set the pump (next step).' }
    ],
    logField: 'main_jet', logLabel: 'Log main jet change' },
  { id: 'ss-rolloff', title: '7. Roll-off cross-check', tag: 'UNVERIFIED', source: 'NOT in S&S #510-0245 or Instruction 510-0251 / 51-1012 — could not be verified against a published source',
    body: 'UNVERIFIED — community practice, shown for completeness, not as an S&S test. S&S\'s roll-on test in step 6 is the deciding test. If you run this one anyway: at 3,500–4,500 rpm, full throttle, roll off to about ¾ throttle and watch what the bike does.',
    outcomes: [
      { id: 'lean', label: 'Picks up speed as you roll off', result: 'Reads as too lean on this cross-check. Confirm with the S&S roll-on test (step 6) before changing a jet — the roll-on is the verified test.' },
      { id: 'rich', label: 'Hesitates as you roll off', result: 'Reads as too large on this cross-check. Confirm with the S&S roll-on test (step 6) before changing a jet.' },
      { id: 'clean', label: 'Just slows down, no pick-up, no hesitation', result: 'Reads as within one size on this cross-check. The S&S roll-on test (step 6) is still the deciding test.' }
    ] },
  { id: 'ss-pump', title: '8. Accelerator pump — set it last', tag: 'FACTORY', source: 'S&S #510-0245, step 5; Instruction 510-0251, "Adjusting Accelerator Pump"',
    body: 'With the engine warm and idling, turn the adjustment screw clockwise until it lightly seats, then snap the throttle open — the engine should stumble. Turn the screw counter-clockwise ¼ or ½ turn at a time until it responds with smooth, quick response. Usually about two turns out. Minimum pump travel that gives good response is the goal: it conserves fuel and keeps plugs from fouling.' },
  { id: 'ss-altitude', title: '9. Riding somewhere higher (or lower)?', tag: 'FACTORY', source: 'S&S Instruction 510-0251, "Elevation changes" note',
    body: 'S&S on elevation: a simple readjustment of the idle mixture screw will often compensate for changes of several thousand feet — their test riders rode through changes upwards of 7,000 feet without changing jets. Higher elevation runs richer (smaller jets may be required); lower runs leaner (larger jets may be required). If jets must change, change the intermediate jet first in most cases — and put the larger jets back when you return to lower elevation. Enter the elevation where you are riding below and the wizard works out the direction from your bike\'s stored elevation.' },
  { id: 'ss-weather', title: '10. Hot, humid, or cold day?', tag: 'COMMUNITY', source: 'Easyriders ER_166 §74 (magazine wisdom, not factory spec); Softail 1984–1999 Repair Manual, p.303',
    body: 'Temperature and humidity move jetting the same way altitude does — through air density — but nobody publishes a per-degree or per-percent jet-step table, so this step is direction only. The magazine\'s working rule (ER_166 §74): tune for the lean side on a cool, dry day at the altitude you ride most. That makes a cool, dry day the lean side — a bike jetted right on a cool, dry morning reads richer on a hot, humid afternoon and leaner on a cold, dry one. The factory manual lists a considerably hotter or colder climate as a reason rejetting may be necessary (p.303), then sends you to a dealer or performance tuner for the jet size. Log the Temp (F) and Humidity (%) with every journal entry, so a rich reading on a hot afternoon is not mistaken for a jet problem.' }
];
var CV40_WIZARD_STEPS = [
  { id: 'cv-baseline', title: '1. Verify stock settings', tag: 'FACTORY', source: 'Harley-Davidson Softail Service Manual #99482-98, Section 4',
    body: 'Stock CV40: main jet 170 (49-state) / 175 (California) / 180 (HDI), slow jet 42 all markets, float level 0.413–0.453 in. Confirm what is actually in the carb before tuning — clone jets are known to lie about their size.' },
  { id: 'cv-mixture', title: '2. Pilot / idle circuit first', tag: 'COMMUNITY', source: 'Keihin CV community guides (rider practice, not a factory spec)',
    body: 'Order matters: pilot first, then needle, then main — one change at a time. Gently seat the mixture screw, then back it out about 2.5 turns as a starting point. Tune only at full operating temp. If screwing it all the way in does not stumble the idle, the pilot jet is too big. If you need more than about 3 turns out, the pilot is too small. Decel popping is a lean idle circuit — back the screw out ¼ turn at a time until it stops.' },
  { id: 'cv-needle', title: '3. Needle (midrange) next', tag: 'COMMUNITY', source: 'Keihin CV community guides (rider practice, not a factory spec)',
    body: 'The needle covers roughly ¼ to ¾ throttle. Shim it with 0.025 in. brass washers under the needle, one at a time, max about two — each washer richens the midrange. Change one thing, ride it, then decide.' },
  { id: 'cv-main', title: '4. Main jet last', tag: 'COMMUNITY', source: 'Keihin CV community guides (rider practice, not a factory spec)',
    body: 'The main jet only matters from ¾ throttle to wide open. Change in steps of 5 (e.g. 170 → 175). Stage 1 ballpark with pipes + high-flow air cleaner is 45 pilot / 175–180 main — a landing zone, not a spec. Verify on your own bike.',
    logField: 'main_jet', logLabel: 'Log main jet change' },
  { id: 'cv-altitude', title: '5. Riding somewhere higher (or lower)?', tag: 'FACTORY', source: 'Sportster Service Manual #99484-98, p.191; Softail 1984–1999 Repair Manual, p.303',
    body: 'The CV carb partially compensates for altitude on its own: as atmospheric pressure drops, the pressure difference across the vacuum piston falls and less fuel is delivered, holding the air/fuel ratio closer than a butterfly carb would. It still wants its pilot checked after a big elevation change — and the Softail repair manual lists "considerably higher or lower altitudes" as a reason rejetting may be necessary. Thinner air means the same jets run rich, so jetting steps leaner with altitude. Enter the elevation where you are riding below and the wizard works out the direction from your bike\'s stored elevation.' },
  { id: 'cv-weather', title: '6. Hot, humid, or cold day?', tag: 'COMMUNITY', source: 'Easyriders ER_166 §74 (magazine wisdom, not factory spec); Softail 1984–1999 Repair Manual, p.303',
    body: 'Temperature and humidity move jetting the same way altitude does — through air density — but nobody publishes a per-degree or per-percent jet-step table, so this step is direction only. The magazine\'s working rule (ER_166 §74): tune for the lean side on a cool, dry day at the altitude you ride most. That makes a cool, dry day the lean side — a bike jetted right on a cool, dry morning reads richer on a hot, humid afternoon and leaner on a cold, dry one. The factory manual lists a considerably hotter or colder climate as a reason rejetting may be necessary (p.303), then sends you to a dealer or performance tuner for the jet size. Log the Temp (F) and Humidity (%) with every journal entry, so a rich reading on a hot afternoon is not mistaken for a jet problem.' }
];
var GENERIC_WIZARD_STEPS = [
  { id: 'gen-baseline', title: '1. Start from a cited baseline', tag: 'FACTORY', source: 'Your carb\'s own instruction sheet — recorded on the baseline, source required',
    body: 'This carb has no verified reference in the app yet, so the wizard cannot give you its numbers. Set the factory baseline first (Bikes & Carbs tab, source required), then come back. Never tune from a number you cannot cite.' },
  { id: 'gen-order', title: '2. Tuning order: idle circuit first, main jet last', tag: 'COMMUNITY', source: 'General carburetor practice, as in the CV40 tuning guide',
    body: 'Pilot / intermediate circuit first, then needle / midrange, then main jet last. One change at a time; get each right before moving on. Re-adjust the idle mixture screw after every jet change.' },
  { id: 'gen-altitude', title: '3. Riding somewhere higher (or lower)?', tag: 'FACTORY', source: 'S&S Instruction 510-0251, "Elevation changes" note (direction only — no published jet-step table)',
    body: 'Thinner air means the same jets run rich, so jetting steps leaner with altitude. Try the idle mixture screw first — S&S says it often covers several thousand feet, and their test riders rode 7,000+ ft changes without changing jets. If jets must change, change the intermediate / pilot jet first in most cases. Enter the elevation where you are riding below and the wizard works out the direction from your bike\'s stored elevation.' },
  { id: 'gen-weather', title: '4. Hot, humid, or cold day?', tag: 'COMMUNITY', source: 'Easyriders ER_166 §74 (magazine wisdom, not factory spec); Softail 1984–1999 Repair Manual, p.303',
    body: 'Temperature and humidity move jetting the same way altitude does — through air density — but nobody publishes a per-degree or per-percent jet-step table, so this step is direction only. The magazine\'s working rule (ER_166 §74): tune for the lean side on a cool, dry day at the altitude you ride most. That makes a cool, dry day the lean side — a bike jetted right on a cool, dry morning reads richer on a hot, humid afternoon and leaner on a cold, dry one. The factory manual lists a considerably hotter or colder climate as a reason rejetting may be necessary (p.303), then sends you to a dealer or performance tuner for the jet size. Log the Temp (F) and Humidity (%) with every journal entry, so a rich reading on a hot afternoon is not mistaken for a jet problem.' }
];

function wizardSteps(carbModel) {
  var m = String(carbModel || '').toLowerCase();
  if (m.indexOf('super e') >= 0 || m.indexOf('s&s') >= 0) return SS_WIZARD_STEPS;
  if (m.indexOf('cv40') >= 0 || m.indexOf('cv 40') >= 0) return CV40_WIZARD_STEPS;
  return GENERIC_WIZARD_STEPS;
}

function recordWizardOutcome(store, carbId, stepId, outcomeId, note) {
  if (!store.carbs[carbId]) throw new Error('Carb not found.');
  var steps = wizardSteps(store.carbs[carbId].model);
  var step = null;
  steps.forEach(function (s) { if (s.id === stepId) step = s; });
  if (!step) throw new Error('Wizard step not found for this carb.');
  if (step.outcomes) {
    var ok = step.outcomes.some(function (o) { return o.id === outcomeId; });
    if (!ok) throw new Error('That is not one of this step\'s outcomes.');
  } else if (outcomeId !== 'done') {
    throw new Error('This step only records done / not done.');
  }
  store.wizard = store.wizard || {};
  store.wizard[carbId] = store.wizard[carbId] || {};
  store.wizard[carbId][stepId] = {
    outcome: outcomeId, note: (note || '').trim(),
    date: new Date().toISOString().slice(0, 10)
  };
  return store.wizard[carbId][stepId];
}

function wizardProgress(store, carbId) {
  var steps = wizardSteps(store.carbs[carbId] ? store.carbs[carbId].model : '');
  var state = (store.wizard && store.wizard[carbId]) || {};
  var done = steps.filter(function (s) { return state[s.id]; }).length;
  return { done: done, total: steps.length };
}

var CHECKLISTS = {  leak: {
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
/* A validated handoff waiting on the user's confirm (or, after
 * confirm, the handoff whose wizard step is bannered). In memory
 * only — never persisted, never applied without a tap. */
var pendingHandoff = null;

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
  renderWizard();
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
    var elev = b.elevation_ft != null
      ? b.elevation_ft.toLocaleString() + ' ft' + (b.elevation_source ? ' <span class="muted">(' + esc(b.elevation_source) + ')</span>' : '')
      : '<span class="muted">not set</span>';
    return '<article class="card"><header><b>' + esc(b.name) + '</b> ' +
      (b.year ? esc(b.year) + ' ' : '') + esc([b.make, b.model].filter(Boolean).join(' ')) +
      ' <button class="mini danger" data-del-bike="' + esc(b.id) + '">Delete bike</button></header>' +
      '<div class="muted">' + (b.odometer != null ? 'Odometer: ' + b.odometer.toLocaleString() + ' mi' : 'Odometer: not set') +
      (b.notes ? ' · ' + esc(b.notes) : '') + '</div>' +
      '<div class="elevrow"><b>Home elevation:</b> ' + elev +
      ' <span class="muted">— the elevation the bike is jetted for. Saved on the bike, so it works offline.</span>' +
      '<div class="grid"><label>Elevation (ft)<input type="number" id="elev-' + esc(b.id) + '" value="' + (b.elevation_ft != null ? b.elevation_ft : '') + '" inputmode="numeric" placeholder="e.g. 1152"></label>' +
      '<label>ZIP lookup<input type="text" id="zip-' + esc(b.id) + '" inputmode="numeric" placeholder="e.g. 86001"></label></div>' +
      '<button class="secondary" data-elev-save="' + esc(b.id) + '">Save elevation</button>' +
      '<button class="secondary" data-elev-zip="' + esc(b.id) + '">Look up ZIP</button>' +
      '<button class="secondary" data-elev-gps="' + esc(b.id) + '">Use GPS</button></div>' +
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
  var altEl = $('ref-altitude');
  if (altEl) {
    altEl.innerHTML =
      '<p><span class="badge changed">DIRECTION ONLY</span> S&S publishes the direction of an altitude correction, not a per-foot jet-step table. There is no published number for "how many sizes per 1,000 ft" — the exact jet comes from road-testing (the wizard), one size at a time.</p>' +
      ALTITUDE_CORRECTION.rules.map(function (r) {
        return '<article class="tip"><h4>' + esc(r.title) + '</h4><p>' + esc(r.body) + '</p></article>';
      }).join('') +
      '<p class="source">Source: ' + esc(ALTITUDE_CORRECTION.source) + '</p>' +
      '<p><b>What is NOT here:</b> ' + esc(ALTITUDE_CORRECTION.noNumericTableNote) + '</p>' +
      '<article class="tip"><h4>Keihin CV40 — partial self-compensation</h4><p>' + esc(ALTITUDE_CORRECTION.cvNote) + '</p></article>';
  }
  var weatherEl = $('ref-weather');
  if (weatherEl) {
    weatherEl.innerHTML =
      '<p><span class="badge changed">DIRECTION ONLY</span> Temperature and humidity move jetting through air density, the same way altitude does — but no published source gives a per-degree or per-percent jet-step table. The factory manual names a hotter or colder climate as a reason rejetting may be necessary, then sends you to a tuner for the size; the magazine gives a working rule instead of a table. The exact jet comes from road-testing, one size at a time.</p>' +
      WEATHER_CORRECTION.rules.map(function (r) {
        return '<article class="tip"><h4>' + esc(r.title) + '</h4><p>' + esc(r.body) + '</p></article>';
      }).join('') +
      '<p class="source">Source: ' + esc(WEATHER_CORRECTION.source) + '</p>' +
      '<p><b>What is NOT here:</b> ' + esc(WEATHER_CORRECTION.noNumericTableNote) + '</p>';
  }
  var zipEl = $('ref-az-zips');
  if (zipEl) {
    var zips = Object.keys(AZ_ZIP_ELEVATIONS).sort(function (a, b) {
      return AZ_ZIP_ELEVATIONS[a].town.localeCompare(AZ_ZIP_ELEVATIONS[b].town);
    });
    zipEl.innerHTML = zips.map(function (z) {
      return '<tr><td>' + esc(AZ_ZIP_ELEVATIONS[z].town) + ' (' + esc(z) + ')</td><td>' +
        AZ_ZIP_ELEVATIONS[z].ft.toLocaleString() + ' ft</td></tr>';
    }).join('');
  }
}

/* ------------------------------------------------------------------ */
/* Jetting wizard UI                                                   */
/* ------------------------------------------------------------------ */
function wizardOutcomeResult(step, outcomeId) {
  if (!step.outcomes) return '';
  var found = null;
  step.outcomes.forEach(function (o) { if (o.id === outcomeId) found = o; });
  if (!found) return '';
  return '<p class="wiz-result"><b>Next move:</b> ' + esc(found.result) + '</p>';
}

function wizardAltitudeHtml(carb) {
  var bike = store.bikes[carb.bike_id];
  var home = bike && bike.elevation_ft != null ? bike.elevation_ft : null;
  var html = '<div class="wiz-alt"><p><b>Home elevation:</b> ' +
    (home != null ? esc(home.toLocaleString()) + ' ft' + (bike.elevation_source ? ' <span class="muted">(' + esc(bike.elevation_source) + ')</span>' : '')
      : '<span class="muted">not set — set it on the bike under Bikes &amp; Carbs first</span>') + '</p>' +
    '<label>Riding elevation (ft)<input type="number" id="wiz-ride-ft" inputmode="numeric" placeholder="e.g. 6903"></label>' +
    '<button class="secondary" data-wiz-alt>Check the direction</button>' +
    '<div id="wiz-alt-advice"></div></div>';
  return html;
}

function renderWizard() {
  var wrap = $('wizard-steps');
  if (!wrap) return;
  var sel = $('wizard-carb');
  if (sel) sel.innerHTML = carbOptions(selectedCarbId);
  var carb = selectedCarbId ? store.carbs[selectedCarbId] : null;
  if (!carb) {
    $('wizard-progress').textContent = '';
    wrap.innerHTML = '<p class="muted">No carburetors tracked yet. Add a bike and its carb under Bikes &amp; Carbs — the wizard follows the carb you pick (S&amp;S Super E, Keihin CV40, or a generic path for anything else).</p>';
    return;
  }
  var steps = wizardSteps(carb.model);
  var prog = wizardProgress(store, carb.id);
  $('wizard-progress').textContent = prog.done + '/' + prog.total + ' steps done — ' + carb.nickname + ' (' + carb.model + ')';
  wrap.innerHTML = steps.map(function (step) {
    var state = (store.wizard && store.wizard[carb.id] && store.wizard[carb.id][step.id]) || null;
    var badge = step.tag === 'FACTORY' ? '<span class="badge stock">FACTORY</span>'
      : step.tag === 'COMMUNITY' ? '<span class="badge changed">COMMUNITY</span>'
      : '<span class="badge unverified">UNVERIFIED</span>';
    var html = '<article class="card wiz' + (state ? ' done' : '') + '"><h3>' + esc(step.title) + ' ' + badge + '</h3>' +
      '<p>' + esc(step.body) + '</p>' +
      '<p class="source">Source: ' + esc(step.source) + '</p>';
    if (step.outcomes) {
      html += step.outcomes.map(function (o) {
        var picked = state && state.outcome === o.id;
        return '<button class="secondary' + (picked ? ' picked' : '') + '" data-wiz-outcome="' + esc(step.id) + ':' + esc(o.id) + '">' + esc(o.label) + '</button>';
      }).join('');
      if (state && state.outcome) html += wizardOutcomeResult(step, state.outcome);
      if (step.logField && state && state.outcome && state.outcome !== 'clean') {
        html += '<br><button class="primary" data-wiz-log="' + esc(step.id) + '">' + esc(step.logLabel) + '</button>';
      }
    } else {
      html += '<button class="secondary" data-wiz-done="' + esc(step.id) + '">' +
        (state ? '✓ Done — tap to clear' : 'Mark done') + '</button>';
    }
    if (step.id === 'ss-altitude' || step.id === 'cv-altitude' || step.id === 'gen-altitude') {
      html += wizardAltitudeHtml(carb);
    }
    if (pendingHandoff && pendingHandoff._carbId === carb.id &&
        pendingHandoff.handoff.payload.wizardStepId === step.id) {
      var hp = pendingHandoff.handoff.payload;
      html += '<p class="wiz-result"><b>From the Evo Diagnostic:</b> ' + esc(hp.topCause) +
        ' — test: ' + esc(hp.test) +
        (pendingHandoff._outcome
          ? ' Suggested answer: <b>' + esc(pendingHandoff._outcome) + '</b> — tap it below to record it.'
          : ' Tap the answer that matches what the bike did.') +
        ' <button class="mini secondary" data-handoff-dismiss>Clear this handoff</button></p>';
    }
    if (state && state.note) html += '<p class="muted">Saved: ' + esc(state.note) + (state.date ? ' (' + esc(state.date) + ')' : '') + '</p>';
    return html + '</article>';
  }).join('') +
  '<button class="secondary" data-wiz-reset>Reset this wizard</button>';
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

/* ------------------------------------------------------------------ */
/* Handoff UI — confirm card + URL / paste intake. Nothing is        */
/* written until the user taps confirm.                               */
/* ------------------------------------------------------------------ */
function handoffSentDate(handoff) {
  try { return fmtDate(new Date(handoff.sentAt).toISOString().slice(0, 10)); }
  catch (e) { return handoff.sentAt; }
}

function renderHandoffBox() {
  var box = $('handoff-box');
  if (!box) return;
  if (!pendingHandoff || pendingHandoff._confirmed) { box.innerHTML = ''; return; }
  if (pendingHandoff.error) {
    box.innerHTML = '<article class="card"><h3>Handoff could not be read</h3>' +
      '<p>' + esc(pendingHandoff.error) + '</p>' +
      '<p class="muted">Nothing was changed. Ask the sending app for a fresh link.</p>' +
      '<button class="secondary" data-handoff-dismiss>Dismiss</button></article>';
    return;
  }
  var handoff = pendingHandoff.handoff;
  var p = handoff.payload;
  var res = pendingHandoff.resolution;
  var html = '<article class="card"><h3>Diagnosis arrived — from the Evo Diagnostic</h3>' +
    '<p><b>' + esc(p.topCause) + '</b>' +
    (p.confidencePct != null ? ' <span class="muted">(' + esc(p.confidencePct) + '% of the answer weights — not a measurement)</span>' : '') + '</p>' +
    '<p>' + esc(p.treeTitle) + ' · sent ' + esc(handoffSentDate(handoff)) + ' · ' +
    '<span class="badge ' + (p.urgency === 'critical' ? 'unverified' : 'changed') + '">' + esc(p.urgency.toUpperCase()) + '</span></p>' +
    '<p><b>Test:</b> ' + esc(p.test) + '</p>' +
    '<p><b>Fix:</b> ' + esc(p.fix) + '</p>' +
    '<p><b>Safe to ride?</b> ' + esc(p.safeToRide) + '</p>';
  var bikeId = null, target = null;
  if (res.status === 'matched') {
    bikeId = res.bikeId;
    html += '<p><b>For:</b> ' + esc(res.bike.name) + ' <span class="muted">(matched by ' +
      (res.via === 'roster' ? 'roster key ' + esc(handoff.bike.rosterKey) : 'name') + ')</span></p>';
    target = wizardHandoffTarget(store, handoff, bikeId);
  } else {
    var bikes = Object.keys(store.bikes).map(function (id) { return store.bikes[id]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!bikes.length) {
      html += '<p class="source warn">No bikes in this journal yet — add the bike under Bikes &amp; Carbs first, then open the link again.</p>';
      box.innerHTML = html + '<button class="secondary" data-handoff-dismiss>Dismiss</button></article>';
      return;
    }
    html += '<p class="source warn">This diagnosis is for "' + esc(handoff.bike.name) + '" — no bike here matches it yet. Which bike is it for?</p>' +
      '<label>Bike<select id="handoff-bike">' +
      bikes.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>'; }).join('') +
      '</select></label>' +
      '<p class="muted">Picking a bike pins it to roster key ' + esc(handoff.bike.rosterKey) + ', so the next handoff for this bike lands without asking.</p>';
  }
  if (target) {
    if (!target.carb) {
      html += '<p class="source warn">That bike has no carburetor yet — add one under Bikes &amp; Carbs first.</p>';
    } else {
      html += '<p><b>Opens the wizard for:</b> ' + esc(target.carb.nickname) + ' (' + esc(target.carb.model) + ')</p>';
      if (target.step) {
        html += '<p><b>Suggested step:</b> ' + esc(target.step.title) +
          (target.outcome ? ' — suggested answer: <b>' + esc(target.outcome) + '</b>' : '') +
          ' <span class="muted">(you still tap the answer in the wizard — nothing is recorded by the handoff)</span></p>';
      } else {
        html += '<p class="muted">No single wizard step was suggested — the wizard opens and you pick the step.</p>';
      }
      target.warnings.forEach(function (w) { html += '<p class="source warn">' + esc(w) + '</p>'; });
    }
  }
  html += '<button class="primary" data-handoff-confirm>Open the wizard with this diagnosis</button> ' +
    '<button class="secondary" data-handoff-dismiss>Dismiss — do nothing</button></article>';
  box.innerHTML = html;
}

function receiveHandoff(text) {
  try {
    var handoff = parsePocketHandoff(text);
    pendingHandoff = { handoff: handoff, resolution: resolvePocketHandoffBike(store, handoff), error: null };
    renderHandoffBox();
  } catch (err) {
    pendingHandoff = { handoff: null, resolution: null, error: err.message };
    renderHandoffBox();
  }
}

function checkHandoffFromUrl() {
  var raw = null;
  try { raw = new URLSearchParams(window.location.search).get('handoff'); } catch (e) { return; }
  if (!raw) return;
  try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* address bar keeps the param; harmless */ }
  receiveHandoff(raw);
}

function confirmHandoff() {
  if (!pendingHandoff || !pendingHandoff.handoff) return;
  var handoff = pendingHandoff.handoff;
  var bikeId = null;
  if (pendingHandoff.resolution && pendingHandoff.resolution.status === 'matched') {
    bikeId = pendingHandoff.resolution.bikeId;
  } else {
    var sel = $('handoff-bike');
    bikeId = sel ? sel.value : null;
  }
  if (!bikeId || !store.bikes[bikeId]) { toast('Pick which bike this diagnosis is for.', true); return; }
  var target;
  try {
    target = wizardHandoffTarget(store, handoff, bikeId);
    if (!target.carb) { toast('That bike has no carburetor yet — add one under Bikes & Carbs first.', true); return; }
    pinPocketRosterKey(store, handoff.bike.rosterKey, bikeId);
  } catch (err) { toast(err.message, true); return; }
  pendingHandoff._bikeId = bikeId;
  pendingHandoff._carbId = target.carb.id;
  pendingHandoff._stepId = target.step ? target.step.id : null;
  pendingHandoff._outcome = target.outcome;
  pendingHandoff._confirmed = true;
  persist();
  selectedCarbId = target.carb.id;
  renderHandoffBox();
  showView('wizard');
  toast('Handoff ready — the wizard is open at the suggested step. Tap the answer that matches the bike.');
}

function init() {
  store = loadStore();
  /* Service-worker update button (sw-update.js): hidden until a new
   * version is waiting. Lives in the header — the bottom nav is fixed
   * and would cover a body-end button. Guarded so the journal keeps
   * working if the module ever fails to load. */
  var swUpdate = (typeof PG_SWUpdate !== 'undefined')
    ? PG_SWUpdate.init({ container: document.querySelector('header.top') }) : null;
  document.querySelectorAll('.navbtn').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });
  $('journal-carb').addEventListener('change', function (e) {
    selectedCarbId = e.target.value || null; render();
  });
  $('baseline-carb').addEventListener('change', function (e) {
    selectedCarbId = e.target.value || null; render();
  });
  $('wizard-carb').addEventListener('change', function (e) {
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
        odometer: $('bike-odometer').value, notes: $('bike-notes').value,
        elevation_ft: $('bike-elevation').value, elevation_source: 'manual'
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
    var elevSave = t.dataset.elevSave;
    var elevZip = t.dataset.elevZip;
    var elevGps = t.dataset.elevGps;
    var wizOutcome = t.dataset.wizOutcome;
    var wizDone = t.dataset.wizDone;
    var wizLog = t.dataset.wizLog;
    var wizAlt = t.dataset.wizAlt !== undefined && t.hasAttribute('data-wiz-alt');
    var wizReset = t.dataset.wizReset !== undefined && t.hasAttribute('data-wiz-reset');
    var hoConfirm = t.hasAttribute('data-handoff-confirm');
    var hoDismiss = t.hasAttribute('data-handoff-dismiss');
    if (hoConfirm) { confirmHandoff(); return; }
    if (hoDismiss) { pendingHandoff = null; renderHandoffBox(); render(); return; }
    if (elevSave) {
      try {
        var ft = $( 'elev-' + elevSave).value;
        setBikeElevation(store, elevSave, ft, 'manual');
        persist(); render();
        toast('Home elevation saved: ' + store.bikes[elevSave].elevation_ft.toLocaleString() + ' ft.');
      } catch (err) { toast(err.message, true); }
    } else if (elevZip) {
      var zipVal = $('zip-' + elevZip).value;
      var found = lookupZipElevation(zipVal);
      if (!found) { toast('ZIP not in the Arizona table — type the elevation instead.', true); return; }
      try {
        setBikeElevation(store, elevZip, found.ft, 'zip:' + found.zip);
        persist(); render();
        toast(found.town + ' (' + found.zip + '): ' + found.ft.toLocaleString() + ' ft — saved as home elevation.');
      } catch (err) { toast(err.message, true); }
    } else if (elevGps) {
      if (!navigator.geolocation) { toast('This device has no GPS to read.', true); return; }
      toast('Reading GPS…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var alt = pos.coords && pos.coords.altitude;
        if (alt == null) {
          toast('GPS gave a position but no altitude — this phone does not report it. Type the elevation or use the ZIP lookup.', true);
          return;
        }
        var gpsFt = Math.round(alt * 3.28084);
        try {
          setBikeElevation(store, elevGps, gpsFt, 'gps');
          persist(); render();
          toast('GPS elevation saved: ' + gpsFt.toLocaleString() + ' ft (cached on the bike — works offline from here).');
        } catch (err) { toast(err.message, true); }
      }, function () {
        toast('GPS read failed or was denied — type the elevation or use the ZIP lookup.', true);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    } else if (wizOutcome) {
      var parts = wizOutcome.split(':');
      try {
        recordWizardOutcome(store, selectedCarbId, parts[0], parts[1], '');
        persist(); render();
      } catch (err) { toast(err.message, true); }
    } else if (wizDone) {
      try {
        var existing = store.wizard && store.wizard[selectedCarbId] && store.wizard[selectedCarbId][wizDone];
        if (existing) {
          delete store.wizard[selectedCarbId][wizDone];
        } else {
          recordWizardOutcome(store, selectedCarbId, wizDone, 'done', '');
        }
        persist(); render();
      } catch (err) { toast(err.message, true); }
    } else if (wizLog) {
      var steps = wizardSteps(store.carbs[selectedCarbId].model);
      var step = null;
      steps.forEach(function (s) { if (s.id === wizLog) step = s; });
      if (!step || !step.logField) return;
      showView('journal');
      var input = $('log-' + step.logField);
      if (input) {
        input.focus();
        if (input.scrollIntoView) input.scrollIntoView({ block: 'center' });
      }
      if (pendingHandoff && pendingHandoff._confirmed) {
        var notesEl = $('log-notes');
        if (notesEl && !notesEl.value) notesEl.value = handoffCitation(pendingHandoff.handoff);
      }
      toast('Enter the new jet size in "' + fieldLabel(step.logField) + '", then Log this change.');
    } else if (wizAlt) {
      var rideInput = $('wiz-ride-ft');
      var rideFt = rideInput ? rideInput.value : '';
      var advBox = $('wiz-alt-advice');
      var carb = store.carbs[selectedCarbId];
      var bike = carb && store.bikes[carb.bike_id];
      var home = bike && bike.elevation_ft != null ? bike.elevation_ft : null;
      if (home == null) {
        if (advBox) advBox.innerHTML = '<p class="source warn">Set the bike\'s home elevation first (Bikes &amp; Carbs) — the advice is the difference from where the bike is jetted.</p>';
        return;
      }
      var adv = altitudeAdvice(home, rideFt);
      if (adv.status === 'unknown') {
        if (advBox) advBox.innerHTML = '<p class="source warn">Enter the riding elevation in feet (e.g. 6903 for Flagstaff).</p>';
        return;
      }
      var summary = adv.status === 'same'
        ? 'Riding at ' + parseInt(rideFt, 10).toLocaleString() + ' ft — ' + adv.firstAction
        : 'Riding at ' + parseInt(rideFt, 10).toLocaleString() + ' ft (' + Math.abs(adv.deltaFt).toLocaleString() + ' ft ' +
          (adv.deltaFt > 0 ? 'above' : 'below') + ' home): runs ' + adv.direction + '. ' + adv.firstAction + ' ' + (adv.jetAction || '');
      if (advBox) advBox.innerHTML = '<p class="wiz-result"><b>' + esc(summary) + '</b></p>';
      try {
        var altStep = null;
        wizardSteps(carb.model).forEach(function (s) { if (s.id.indexOf('altitude') >= 0) altStep = s; });
        if (altStep) {
          recordWizardOutcome(store, selectedCarbId, altStep.id, 'done', summary);
          persist(); /* no re-render: would wipe the advice box just shown */
        }
      } catch (err) { toast(err.message, true); }
    } else if (wizReset) {
      if (confirm('Clear the wizard progress for this carburetor?')) {
        if (store.wizard) delete store.wizard[selectedCarbId];
        persist(); render();
        toast('Wizard reset.');
      }
    } else if (delEntry) {
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
    ['journal-carb', 'baseline-carb', 'wizard-carb'].forEach(function (id) {
      var el = $(id); if (el && v) el.value = v;
    });
    if (logSel && v) logSel.value = v;
    /* Prefill the log-form altitude from the bike's stored home
     * elevation — only when the field is empty, so a typed value
     * is never overwritten. */
    var altInput = $('log-altitude_ft');
    if (altInput && !altInput.value && v) {
      var c = store.carbs[v];
      var bk = c && store.bikes[c.bike_id];
      if (bk && bk.elevation_ft != null) altInput.value = bk.elevation_ft;
    }
  };
  var origRender = render;
  render = function () { origRender(); sync(); if (logSel) logSel.innerHTML = carbOptions(selectedCarbId); };
  render();
  /* Paste fallback for a handoff link a messaging app mangled: the
   * same JSON, the same validator, the same confirm card. */
  var pasteBtn = $('handoff-paste-btn');
  if (pasteBtn) pasteBtn.addEventListener('click', function () {
    var text = $('handoff-paste-text').value;
    if (!text.trim()) { toast('Paste the handoff JSON first.', true); return; }
    receiveHandoff(text);
    showView('journal');
    var box = $('handoff-box');
    if (box && box.scrollIntoView) box.scrollIntoView();
  });
  checkHandoffFromUrl();
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
    SS_SUPER_E_FACTORY: SS_SUPER_E_FACTORY, SS_SUPER_E_TUNING: SS_SUPER_E_TUNING,
    AZ_ZIP_ELEVATIONS: AZ_ZIP_ELEVATIONS, AZ_ELEVATION_SOURCE: AZ_ELEVATION_SOURCE,
    ALTITUDE_CORRECTION: ALTITUDE_CORRECTION,
    WEATHER_CORRECTION: WEATHER_CORRECTION,
    lookupZipElevation: lookupZipElevation, altitudeAdvice: altitudeAdvice,
    setBikeElevation: setBikeElevation,
    wizardSteps: wizardSteps, recordWizardOutcome: recordWizardOutcome,
    wizardProgress: wizardProgress,
    SS_WIZARD_STEPS: SS_WIZARD_STEPS, CV40_WIZARD_STEPS: CV40_WIZARD_STEPS,
    GENERIC_WIZARD_STEPS: GENERIC_WIZARD_STEPS,
    HANDOFF_FORMAT: HANDOFF_FORMAT, HANDOFF_VERSION: HANDOFF_VERSION,
    HANDOFF_KIND: HANDOFF_KIND, HANDOFF_MAX_CHARS: HANDOFF_MAX_CHARS,
    encodePocketHandoff: encodePocketHandoff, parsePocketHandoff: parsePocketHandoff,
    validatePocketHandoff: validatePocketHandoff,
    normalizeBikeName: normalizeBikeName, namesMatch: namesMatch,
    resolvePocketHandoffBike: resolvePocketHandoffBike,
    pinPocketRosterKey: pinPocketRosterKey,
    carbForHandoff: carbForHandoff, wizardHandoffTarget: wizardHandoffTarget,
    handoffCitation: handoffCitation
  };
}
