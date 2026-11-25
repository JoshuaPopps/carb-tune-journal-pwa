/* Core-logic tests for the Carb Tune Journal PWA. No DOM needed:
 * app.js exports its pure store/journal functions when required.
 * Run: node test.js  (exit 0 = all passed) */
'use strict';
var app = require('./app.js');
var passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ok - ' + name); }
  else { failed++; console.log('  FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function throws(name, fn) {
  try { fn(); check(name, false, 'no error thrown'); }
  catch (e) { check(name, true); }
}

console.log('sample journal (mirrors the README walkthrough)');
var s = app.sampleStore();
check('sample has 1 bike, 2 carbs, 2 entries',
  Object.keys(s.bikes).length === 1 && Object.keys(s.carbs).length === 2 && s.entries.length === 2);
var genuine = Object.keys(s.carbs).map(function (id) { return s.carbs[id]; })
  .filter(function (c) { return c.nickname === 'Genuine CV40'; })[0];
var setup = app.effectiveSetup(s, genuine.id);
check('current main jet folded to 190', setup.main_jet === '190', setup.main_jet);
check('pilot still stock 45', setup.pilot_jet === '45');
check('float still baseline range', setup.float_height === '0.413-0.453 in.');
var e2 = s.entries.filter(function (e) { return e.num === 2; })[0];
var d = app.entryDeltas(s, e2);
check('entry #2 delta is main 185 -> 190',
  d.length === 1 && d[0].key === 'main_jet' && d[0].from === '185' && d[0].to === '190',
  JSON.stringify(d));

console.log('validation');
throws('baseline without source rejected', function () {
  var t = app.emptyStore();
  var b = app.addBike(t, { name: 'Test Bike' });
  var c = app.addCarb(t, { bike_id: b.id, model: 'Keihin CV40' });
  app.setBaseline(t, c.id, { main_jet: '170' }, '');
});
throws('duplicate bike name rejected', function () {
  var t = app.emptyStore();
  app.addBike(t, { name: 'Same Bike' });
  app.addBike(t, { name: 'same bike' });
});
throws('log with no change and no notes rejected', function () {
  var t = app.emptyStore();
  var b = app.addBike(t, { name: 'Test Bike' });
  var c = app.addCarb(t, { bike_id: b.id, model: 'Keihin CV40' });
  app.logEntry(t, { carb_id: c.id, changes: {}, notes: '' });
});
throws('log for unknown carb rejected', function () {
  app.logEntry(app.emptyStore(), { carb_id: 'c99', changes: { main_jet: '175' } });
});
throws('import of garbage rejected', function () { app.validateImport('not json'); });
throws('import missing entries rejected', function () {
  app.validateImport(JSON.stringify({ bikes: {}, carbs: {} }));
});
throws('import pointing at missing bike rejected', function () {
  app.validateImport(JSON.stringify({ bikes: {}, carbs: { c1: { bike_id: 'b9', model: 'X' } }, entries: [] }));
});

console.log('entry numbers are never reused');
var t2 = app.sampleStore();
var g2 = Object.keys(t2.carbs).map(function (id) { return t2.carbs[id]; })
  .filter(function (c) { return c.nickname === 'Genuine CV40'; })[0];
var last = t2.entries.filter(function (e) { return e.carb_id === g2.id; }).pop();
app.deleteEntry(t2, last.id);
var res = app.logEntry(t2, { carb_id: g2.id, changes: { main_jet: '180' }, notes: '' });
check('after deleting #2, next entry is #3 (not #2 again)', res.entry.num === 3, 'got #' + res.entry.num);

console.log('mileage warnings + odometer advance');
var t3 = app.emptyStore();
var b3 = app.addBike(t3, { name: 'Odo Bike', odometer: '1000' });
var c3 = app.addCarb(t3, { bike_id: b3.id, model: 'Keihin CV40' });
var r3 = app.logEntry(t3, { carb_id: c3.id, mileage: '900', changes: { main_jet: '175' } });
check('backwards mileage warns but still logs', r3.warnings.length === 1 && r3.entry.num === 1);
check('odometer not rewound by backwards entry', t3.bikes[b3.id].odometer === 1000);
app.logEntry(t3, { carb_id: c3.id, mileage: '1200', changes: { main_jet: '170' } });
check('odometer advances on higher mileage', t3.bikes[b3.id].odometer === 1200);

console.log('export / import round-trip + CLI compatibility');
var exported = app.exportJSON(s);
var back = app.validateImport(exported);
var backGenuine = Object.keys(back.carbs).map(function (id) { return back.carbs[id]; })
  .filter(function (c) { return c.nickname === 'Genuine CV40'; })[0];
check('round-trip keeps effective setup', app.effectiveSetup(back, backGenuine.id).main_jet === '190');
/* A CLI data.json has no nextNum/checks keys — import must still work. */
var cliShaped = { bikes: s.bikes, carbs: s.carbs, entries: s.entries };
var cliBack = app.validateImport(JSON.stringify(cliShaped));
check('CLI-shaped JSON imports, next numbers computed',
  cliBack.nextNum[backGenuine.id] === 3, JSON.stringify(cliBack.nextNum));

console.log('CV40 reference content');
var f = app.CV40_FACTORY;
function spec(label) { var row = f.filter(function (r) { return r.label === label; })[0]; return row && row.value; }
check('49-state main 170', spec('Main jet — 49-state') === '170');
check('California main 175', spec('Main jet — California') === '175');
check('HDI main 180', spec('Main jet — HDI') === '180');
check('slow jet 42 all markets', spec('Slow (pilot) jet — all markets') === '42');
check('float 0.413-0.453 in', (spec('Float level') || '').indexOf('0.413') === 0);
check('manifold torque 15-17 ft-lbs (20-23 Nm)', (spec('Manifold mounting cap screws') || '').indexOf('15–17 ft-lbs') === 0);
check('backplate torque 10-12 ft-lbs (14-16 Nm)', (spec('Backplate-to-cylinder-head screws') || '').indexOf('10–12 ft-lbs') === 0);
check('idle 1000-1050 rpm', spec('Engine idle speed') === '1000–1050 rpm');
check('leak checklist has 6 steps', app.CHECKLISTS.leak.steps.length === 6);
check('bench checklist has 7 steps', app.CHECKLISTS.bench.steps.length === 7);
check('tuning guide covers pilot-first order',
  app.CV40_TUNING.some(function (x) { return x.title === 'Order matters'; }));
check('tuning guide covers enrichener-is-not-a-choke',
  app.CV40_TUNING.some(function (x) { return x.title.indexOf('enrichener') >= 0; }));

console.log('knowledge-base fixes (Nov 2026)');
check('sample plug reading is eggshell/off-white, not light tan',
  s.entries.filter(function (e) { return e.num === 2; })[0].ran.plug === 'eggshell/off-white');
check('inlet valve warning says may cause overflow',
  (spec('Inlet valve warning') || '').indexOf('may cause overflow') >= 0);
check('factory idle-mixture row has no drill-out method',
  (spec('Idle mixture screw') || '').indexOf('Drill') < 0 && (spec('Idle mixture screw') || '').indexOf('1/16') < 0);
check('tuning guide carries the drill-out method as community practice',
  app.CV40_TUNING.some(function (x) { return x.title.indexOf('plug removal') >= 0 && x.body.indexOf('Community practice') >= 0; }));
check('manifold torque carries 20-23 Nm', (spec('Manifold mounting cap screws') || '').indexOf('20–23 Nm') >= 0);
check('backplate-to-head torque carries 14-16 Nm', (spec('Backplate-to-cylinder-head screws') || '').indexOf('14–16 Nm') >= 0);
check('backplate-to-carb torque 3-5 ft-lbs', spec('Backplate-to-carburetor screws') === '3–5 ft-lbs (4–7 Nm)');
check('air-cleaner cover torque 3-5 ft-lbs', spec('Air-cleaner cover screws') === '3–5 ft-lbs (4–7 Nm)');
check('plug chop gives factory plug gap 0.038-0.043 in.',
  app.CV40_TUNING.some(function (x) { return x.title === 'Plug chop' && x.body.indexOf('0.038–0.043 in.') >= 0; }));
check('storage tip covers float-bowl drain screw',
  app.CV40_TUNING.some(function (x) { return x.title.indexOf('Storage') === 0 && x.body.indexOf('drain screw') >= 0; }));
check('leak checklist says valves may cause overflow',
  app.CHECKLISTS.leak.steps[0].body.indexOf('may cause overflow') >= 0);
check('bench checklist says valve may cause overflow',
  app.CHECKLISTS.bench.steps[2].body.indexOf('may cause overflow') >= 0);
console.log('S&S Super E reference');
function ssSpec(label) { var row = app.SS_SUPER_E_FACTORY.filter(function (r) { return r.label === label; })[0]; return row && row.value; }
check('74-88ci intermediate .0295', ssSpec('Intermediate jet — 74–88ci') === '.0295');
check('74-88ci main .072', ssSpec('Main jet — 74–88ci') === '.072');
check('idle mixture 1-1/4 turns out', (ssSpec('Idle mixture screw') || '').indexOf('1¼ turns out') === 0);
check('idle speed screw 1/2 turn from engagement', (ssSpec('Idle speed screw') || '').indexOf('½ turn clockwise from engagement') === 0);
check('pump screw 2 turns out from seated', (ssSpec('Accelerator pump screw') || '').indexOf('2 turns counter-clockwise') === 0);
check('air bleed .040 stock', (ssSpec('Main jet air bleed') || '').indexOf('.040 stock') === 0);
check('float even with shelf', (ssSpec('Float') || '').indexOf('even with the shelf') >= 0);
check('S&S tuning order, pump off while setting jets', app.SS_SUPER_E_TUNING.some(function (x) { return x.title === 'Tuning order' && x.body.indexOf('air bleed') >= 0 && x.body.indexOf('pump off') >= 0; }));
check('S&S main jet .004 in. steps', app.SS_SUPER_E_TUNING.some(function (x) { return x.title.indexOf('.004') >= 0; }));
check('S&S intermediate diagnostics at 40-50 mph', app.SS_SUPER_E_TUNING.some(function (x) { return x.title.indexOf('Intermediate jet') === 0 && x.body.indexOf('40–50 mph') >= 0; }));
check('S&S enrichener cold start, no throttle', app.SS_SUPER_E_TUNING.some(function (x) { return x.title.indexOf('Enrichener') === 0 && x.body.indexOf('without opening the throttle') >= 0; }));

console.log('jetting wizard — S&S Super E path');
var ssSteps = app.wizardSteps('S&S Super E');
check('S&S wizard has 10 steps', ssSteps.length === 10, String(ssSteps.length));
function stepIdx(steps, id) { for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return i; return -1; }
check('intermediate comes before main', stepIdx(ssSteps, 'ss-intermediate') < stepIdx(ssSteps, 'ss-main'));
check('main jet is before pump-set-last', stepIdx(ssSteps, 'ss-main') < stepIdx(ssSteps, 'ss-pump'));
check('pump is shut off before intermediate tuning', stepIdx(ssSteps, 'ss-pump-off') < stepIdx(ssSteps, 'ss-intermediate'));
check('weather step is last, altitude second-to-last',
  stepIdx(ssSteps, 'ss-weather') === ssSteps.length - 1 &&
  stepIdx(ssSteps, 'ss-altitude') === ssSteps.length - 2);
check('every S&S step cites its source', ssSteps.every(function (s) { return s.source && s.source.length > 5; }));
check('intermediate step says re-adjust mixture after every change',
  ssSteps.filter(function (s) { return s.id === 'ss-intermediate'; })[0].body.indexOf('re-adjust') >= 0);
check('intermediate test is steady 40-50 mph',
  ssSteps.filter(function (s) { return s.id === 'ss-intermediate'; })[0].body.indexOf('40–50 mph') >= 0);
check('main step is the S&S roll-on, .004 in. steps',
  ssSteps.filter(function (s) { return s.id === 'ss-main'; })[0].body.indexOf('50 to 70 mph') >= 0 &&
  ssSteps.filter(function (s) { return s.id === 'ss-main'; })[0].body.indexOf('.004') >= 0);
check('roll-off step is tagged UNVERIFIED, not S&S',
  (function () { var r = ssSteps.filter(function (s) { return s.id === 'ss-rolloff'; })[0];
    return r.tag === 'UNVERIFIED' && r.source.indexOf('NOT in S&S') === 0 &&
      r.body.indexOf('3,500–4,500 rpm') >= 0 && r.body.indexOf('deciding test') >= 0; })());
check('roll-off outcomes cover all three readings',
  (function () { var r = ssSteps.filter(function (s) { return s.id === 'ss-rolloff'; })[0];
    return r.outcomes.length === 3 &&
      r.outcomes.some(function (o) { return o.label.indexOf('Picks up speed') === 0; }) &&
      r.outcomes.some(function (o) { return o.label.indexOf('Hesitates') === 0; }) &&
      r.outcomes.some(function (o) { return o.label.indexOf('Just slows') === 0; }); })());
check('idle step uses S&S mixture-screw thresholds (1-3/4 / 1-1/4), not the magazine rule',
  (function () { var s = ssSteps.filter(function (x) { return x.id === 'ss-idle'; })[0];
    return s.body.indexOf('1¾ turns') >= 0 && s.body.indexOf('1¼ turns') >= 0 &&
      s.body.indexOf('S&S wins') >= 0; })());
check('S&S wizard baseline is .0295 / .072',
  ssSteps.filter(function (s) { return s.id === 'ss-baseline'; })[0].body.indexOf('.0295') >= 0 &&
  ssSteps.filter(function (s) { return s.id === 'ss-baseline'; })[0].body.indexOf('.072') >= 0);

console.log('jetting wizard — CV40 + generic paths');
var cvSteps = app.wizardSteps('Keihin CV40');
check('CV40 wizard has 6 steps', cvSteps.length === 6, String(cvSteps.length));
check('CV40 weather step is last, altitude second-to-last',
  stepIdx(cvSteps, 'cv-weather') === cvSteps.length - 1 &&
  stepIdx(cvSteps, 'cv-altitude') === cvSteps.length - 2);
check('CV40 order is pilot, needle, main',
  stepIdx(cvSteps, 'cv-mixture') < stepIdx(cvSteps, 'cv-needle') &&
  stepIdx(cvSteps, 'cv-needle') < stepIdx(cvSteps, 'cv-main'));
check('CV40 altitude step cites the factory self-compensation note',
  cvSteps.filter(function (s) { return s.id === 'cv-altitude'; })[0].source.indexOf('#99484-98') >= 0);
check('CV40 main step is steps of 5',
  cvSteps.filter(function (s) { return s.id === 'cv-main'; })[0].body.indexOf('steps of 5') >= 0);
var genSteps = app.wizardSteps('Mikuni TM40');
check('unknown carb gets the generic path', genSteps.length === 4 &&
  genSteps[0].title.indexOf('cited baseline') >= 0);
check('generic weather step is last, altitude second-to-last',
  stepIdx(genSteps, 'gen-weather') === genSteps.length - 1 &&
  stepIdx(genSteps, 'gen-altitude') === genSteps.length - 2);
check('every weather step is tagged COMMUNITY and cites ER_166 §74',
  [ssSteps, cvSteps, genSteps].every(function (steps) {
    var w = steps.filter(function (s) { return s.id.indexOf('weather') >= 0; })[0];
    return w && w.tag === 'COMMUNITY' && w.source.indexOf('ER_166 §74') >= 0 &&
      w.body.indexOf('cool, dry day') >= 0 && w.body.indexOf('per-degree') >= 0;
  }));
check('wizard is case-insensitive on model', app.wizardSteps('s&s super e').length === 10);

console.log('wizard progress recording');
var t4 = app.sampleStore();
var g4 = Object.keys(t4.carbs).map(function (id) { return t4.carbs[id]; })
  .filter(function (c) { return c.nickname === 'Genuine CV40'; })[0];
check('wizard starts 0/6 on the CV40', (function () { var p = app.wizardProgress(t4, g4.id); return p.done === 0 && p.total === 6; })());
app.recordWizardOutcome(t4, g4.id, 'cv-mixture', 'done', '');
check('recording one step reads 1/6', app.wizardProgress(t4, g4.id).done === 1);
throws('recording a bogus outcome is rejected', function () {
  app.recordWizardOutcome(t4, g4.id, 'cv-main', 'banana', '');
});
throws('recording for an unknown carb is rejected', function () {
  app.recordWizardOutcome(t4, 'c99', 'cv-main', 'done', '');
});

console.log('altitude correction table (direction only — no invented jet sizes)');
check('table is flagged as having no numeric jet-step table', app.ALTITUDE_CORRECTION.noNumericTable === true);
check('table says why: no published per-foot table exists',
  app.ALTITUDE_CORRECTION.noNumericTableNote.indexOf('No published per-foot jet-step table') === 0);
check('no rule prescribes a jet size (no .004 / .0295-style numbers anywhere)',
  app.ALTITUDE_CORRECTION.rules.every(function (r) { return !/\.\d{3}/.test(r.body); }));
check('rules carry the 7,000 ft S&S test-rider note',
  app.ALTITUDE_CORRECTION.rules.some(function (r) { return r.body.indexOf('7,000 feet') >= 0; }));
check('rules say higher = richer, smaller jets may be required',
  app.ALTITUDE_CORRECTION.rules.some(function (r) { return r.title.indexOf('Higher elevation = richer') === 0; }));
check('rules say change the intermediate jet first',
  app.ALTITUDE_CORRECTION.rules.some(function (r) { return r.body.indexOf('intermediate jet should be changed') >= 0; }));
check('CV self-compensation note cites #99484-98 p.191',
  app.ALTITUDE_CORRECTION.cvNote.indexOf('#99484-98, p.191') >= 0);

console.log('altitude advice (pure function)');
var aUp = app.altitudeAdvice(1152, 6903);
check('Glendale -> Flagstaff reads richer', aUp.status === 'richer' && aUp.deltaFt === 5751);
check('richer advice says smaller jets may be required, intermediate first',
  aUp.jetAction.indexOf('smaller jets') >= 0 && aUp.jetAction.indexOf('intermediate jet first') >= 0);
check('richer advice says mixture screw first', aUp.firstAction.indexOf('mixture screw first') >= 0);
var aDown = app.altitudeAdvice(6903, 1152);
check('Flagstaff -> Glendale reads leaner, larger jets', aDown.status === 'leaner' && aDown.jetAction.indexOf('larger jets') >= 0);
check('same elevation reads same', app.altitudeAdvice(1152, 1200).status === 'same');
check('missing elevation reads unknown', app.altitudeAdvice(null, 6903).status === 'unknown');

console.log('weather correction table (direction only — no invented jet sizes)');
check('weather table is flagged as having no numeric jet-step table', app.WEATHER_CORRECTION.noNumericTable === true);
check('weather table says why: no published per-degree or per-percent table exists',
  app.WEATHER_CORRECTION.noNumericTableNote.indexOf('No published per-degree or per-percent jet-step table') === 0);
check('weather table cites the factory climate line and the magazine rule',
  app.WEATHER_CORRECTION.source.indexOf('p.303') >= 0 &&
  app.WEATHER_CORRECTION.source.indexOf('ER_166 §74') >= 0);
check('no weather rule prescribes a jet size (no .0295-style decimals; p.303 is a page citation, not a jet)',
  app.WEATHER_CORRECTION.rules.every(function (r) { return !/\.\d{3}/.test(r.body.replace(/p\.303/g, '')); }));
check('rules name a hotter or colder climate as a factory-listed reason to rejet',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.body.indexOf('hotter or colder climate') >= 0; }));
check('rules carry the factory answer to "what size": ask a dealer or tuner',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.body.indexOf('dealer or motorcycle performance tuner') >= 0; }));
check('rules carry the cool, dry day working rule with its magazine citation',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.body.indexOf('cool, dry day') >= 0 && r.body.indexOf('ER_166 §74') >= 0; }));
check('rules say hot, humid air runs richer and cold, dry air runs leaner — direction only',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.title.indexOf('Hot, humid air runs richer') === 0; }));
check('rules point at the logged Temp / Humidity on every entry',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.body.indexOf('Temp (F)') >= 0 && r.body.indexOf('Humidity (%)') >= 0; }));
check('rules tie the three factors together through air density (ER_243 §33)',
  app.WEATHER_CORRECTION.rules.some(function (r) { return r.body.indexOf('air density') >= 0 && r.body.indexOf('ER_243 §33') >= 0; }));

console.log('Arizona ZIP elevations');
check('85302 Glendale 1,152 ft', (function () { var z = app.lookupZipElevation('85302'); return z && z.town === 'Glendale' && z.ft === 1152; })());
check('86001 Flagstaff 6,903 ft', (function () { var z = app.lookupZipElevation('86001'); return z && z.town === 'Flagstaff' && z.ft === 6903; })());
check('86336 Sedona 4,350 ft', (function () { var z = app.lookupZipElevation('86336'); return z && z.ft === 4350; })());
check('unknown ZIP returns null', app.lookupZipElevation('99999') === null);
check('ZIP lookup tolerates spaces/dashes', (function () { var z = app.lookupZipElevation(' 85302-1234 '); return z && z.ft === 1152; })());
check('ZIP table has 18 Arizona towns', Object.keys(app.AZ_ZIP_ELEVATIONS).length === 18);

console.log('per-bike elevation storage');
var t5 = app.emptyStore();
var b5 = app.addBike(t5, { name: 'Elev Bike', elevation_ft: '1152', elevation_source: 'zip:85302' });
check('bike stores elevation + source at add', b5.elevation_ft === 1152 && b5.elevation_source === 'zip:85302');
app.setBikeElevation(t5, b5.id, 6903, 'zip:86001');
check('setBikeElevation updates ft + source', t5.bikes[b5.id].elevation_ft === 6903 && t5.bikes[b5.id].elevation_source === 'zip:86001');
throws('elevation "high" rejected', function () { app.setBikeElevation(t5, b5.id, 'high', 'manual'); });
throws('elevation 20000 rejected', function () { app.setBikeElevation(t5, b5.id, 20000, 'manual'); });
throws('elevation for unknown bike rejected', function () { app.setBikeElevation(t5, 'b99', 1000, 'manual'); });
var _before = Object.keys(t5.bikes).length;
var _threw = false;
try { app.addBike(t5, { name: 'Bad Elev Bike', elevation_ft: 'nope' }); } catch (e) { _threw = true; }
check('bike with bad elevation is rejected and not half-added',
  _threw && Object.keys(t5.bikes).length === _before);
check('sample bike carries Glendale elevation 1152',
  (function () { var b = Object.keys(s.bikes).map(function (id) { return s.bikes[id]; })[0];
    return b.elevation_ft === 1152 && b.elevation_source === 'zip:85302'; })());
var exp5 = app.exportJSON(t5);
var back5 = app.validateImport(exp5);
check('elevation survives export/import', back5.bikes[b5.id].elevation_ft === 6903);
check('wizard state survives export/import',
  (function () { var e = app.exportJSON(t4); var bk = app.validateImport(e);
    return bk.wizard && bk.wizard[g4.id] && bk.wizard[g4.id]['cv-mixture'] &&
      bk.wizard[g4.id]['cv-mixture'].outcome === 'done'; })());
var cliShaped2 = { bikes: t5.bikes, carbs: t5.carbs, entries: t5.entries };
var cliBack2 = app.validateImport(JSON.stringify(cliShaped2));
check('CLI-shaped import without wizard/elevation still works',
  cliBack2.wizard && typeof cliBack2.wizard === 'object' &&
  cliBack2.bikes[b5.id].elevation_ft === 6903);

console.log('pocket handoff — diagnosis to carb (receiving side)');
function exampleHandoff(overrides) {
  var h = {
    format: 'pocket-garage-handoff', version: 1, kind: 'diagnosis-to-carb',
    sentAt: '2026-11-24T18:00:00.000Z', from: 'evo-diagnostic',
    bike: { rosterKey: 'b2', name: '1990 Softail' },
    payload: {
      treeId: 'carb-running', treeTitle: 'Running rich / poor idle',
      topCause: 'Pilot jet too large',
      cause: 'Pilot jet too large — idle mixture screw has no effect',
      test: 'Screw the mixture screw all the way in: if the idle does not stumble, the pilot is too big',
      fix: 'Fit one size smaller pilot jet, then re-adjust the mixture screw',
      urgency: 'medium', safeToRide: 'Likely rideable — running rich at idle. Fix soon.',
      confidencePct: 62, wizardStepId: 'cv-mixture', wizardOutcome: 'rich',
      carbModelHint: 'Keihin CV40'
    }
  };
  if (overrides) Object.keys(overrides).forEach(function (k) { h[k] = overrides[k]; });
  return h;
}
var _ho = exampleHandoff();
var _hoB64 = app.encodePocketHandoff(_ho);
check('handoff encodes to base64url (no + / or =)', /^[-A-Za-z0-9_]+$/.test(_hoB64), _hoB64.slice(0, 40));
check('handoff round-trips through base64url',
  JSON.stringify(app.parsePocketHandoff(_hoB64)) === JSON.stringify(_ho));
check('handoff parses from raw pasted JSON too',
  app.parsePocketHandoff(JSON.stringify(_ho)).payload.topCause === 'Pilot jet too large');
throws('wrong format rejected', function () {
  app.parsePocketHandoff(JSON.stringify(exampleHandoff({ format: 'something-else' })));
});
throws('version 2 rejected', function () {
  app.parsePocketHandoff(JSON.stringify(exampleHandoff({ version: 2 })));
});
throws('wrong kind rejected by the carb journal', function () {
  app.parsePocketHandoff(JSON.stringify(exampleHandoff({ kind: 'diagnosis-to-task' })));
});
throws('missing bike name rejected', function () {
  var h = exampleHandoff(); h.bike = { rosterKey: 'b2' };
  app.parsePocketHandoff(JSON.stringify(h));
});
throws('unparseable sent date rejected', function () {
  app.parsePocketHandoff(JSON.stringify(exampleHandoff({ sentAt: 'yesterday' })));
});
throws('garbled base64url rejected', function () { app.parsePocketHandoff('%%%not-base64%%%'); });
throws('oversize handoff rejected', function () {
  var h = exampleHandoff(); h.payload.cause = new Array(9000).join('x');
  app.parsePocketHandoff(JSON.stringify(h));
});
check('sample bike resolves by name match (no pin yet)',
  (function () { var r = app.resolvePocketHandoffBike(s, _ho); return r.status === 'matched' && r.via === 'name'; })());
var _sb = Object.keys(s.bikes)[0];
app.pinPocketRosterKey(s, 'b2', _sb);
check('after pinning, the same handoff resolves by roster key',
  app.resolvePocketHandoffBike(s, _ho).via === 'roster');
check('resolution carries the bike id to apply against',
  app.resolvePocketHandoffBike(s, _ho).bikeId === _sb);
throws('pinning the same key to a second bike is refused', function () {
  var t = app.emptyStore();
  var b1 = app.addBike(t, { name: 'Bike One' });
  var b2 = app.addBike(t, { name: 'Bike Two' });
  app.pinPocketRosterKey(t, 'b2', b1.id);
  app.pinPocketRosterKey(t, 'b2', b2.id);
});
check('unknown bike resolves to unknown, never a guess',
  (function () { var h = exampleHandoff(); h.bike = { rosterKey: 'b9', name: 'No Such Bike' };
    return app.resolvePocketHandoffBike(s, h).status === 'unknown'; })());
var _tgt = app.wizardHandoffTarget(s, _ho, _sb);
check('wizard target is the CV40 mixture step (which takes done/not-done, so a lean/rich outcome is ignored)',
  _tgt.carb && _tgt.step && _tgt.step.id === 'cv-mixture' && _tgt.outcome === null && _tgt.warnings.length === 1,
  JSON.stringify({ step: _tgt.step && _tgt.step.id, outcome: _tgt.outcome }));
var _tSS = app.emptyStore();
var _bSS = app.addBike(_tSS, { name: '1995 Fat Boy Bobber' });
var _cSS = app.addCarb(_tSS, { bike_id: _bSS.id, model: 'S&S Super E', nickname: 'Super E' });
var _hoSS = exampleHandoff();
_hoSS.bike = { rosterKey: 'b1', name: '1995 Fat Boy Bobber' };
_hoSS.payload.wizardStepId = 'ss-intermediate'; _hoSS.payload.wizardOutcome = 'lean';
var _tgtSS = app.wizardHandoffTarget(_tSS, _hoSS, _bSS.id);
check('S&S intermediate step accepts outcome lean',
  _tgtSS.step && _tgtSS.step.id === 'ss-intermediate' && _tgtSS.outcome === 'lean' && _tgtSS.warnings.length === 0,
  JSON.stringify({ step: _tgtSS.step && _tgtSS.step.id, outcome: _tgtSS.outcome }));
var _hoBadStep = exampleHandoff(); _hoBadStep.payload.wizardStepId = 'ss-main';
var _tgtBad = app.wizardHandoffTarget(s, _hoBadStep, _sb);
check('unknown wizard step for this carb is ignored with a warning, not forced',
  _tgtBad.step === null && _tgtBad.outcome === null && _tgtBad.warnings.length === 1);
var _hoBadOut = exampleHandoff(); _hoBadOut.payload.wizardOutcome = 'banana';
var _tgtBadOut = app.wizardHandoffTarget(s, _hoBadOut, _sb);
check('unknown wizard outcome is ignored with a warning',
  _tgtBadOut.step && _tgtBadOut.step.id === 'cv-mixture' && _tgtBadOut.outcome === null && _tgtBadOut.warnings.length === 1);
check('citation carries cause, test, fix and verdict verbatim',
  (function () { var c = app.handoffCitation(_ho);
    return c.indexOf('Pilot jet too large') >= 0 && c.indexOf('Screw the mixture screw') >= 0 &&
      c.indexOf('Fit one size smaller') >= 0 && c.indexOf('Likely rideable') >= 0; })());
check('no jet size is ever invented by the handoff path',
  app.handoffCitation(_ho).indexOf('45') < 0 && app.handoffCitation(_ho).indexOf('185') < 0);
var _tNoCarb = app.emptyStore();
var _bNoCarb = app.addBike(_tNoCarb, { name: '1990 Softail' });
check('bike with no carb reports no target carb',
  app.wizardHandoffTarget(_tNoCarb, _ho, _bNoCarb.id).carb === null);

/* --- service-worker update button wiring (sw-update.js) --- */
var fs = require('fs');
var path = require('path');
var _sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
var _html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var _appjs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
check('sw.js caches v10', _sw.indexOf('carb-tune-journal-v10') >= 0);
check('sw.js precaches sw-update.js', _sw.indexOf('sw-update.js') >= 0);
check('sw.js has the SKIP_WAITING message handler',
  _sw.indexOf("addEventListener('message'") >= 0 && _sw.indexOf('SKIP_WAITING') >= 0);
check('sw.js does not call skipWaiting on install',
  (_sw.split('self.skipWaiting()').length - 1) === 1, 'self.skipWaiting() count: ' + (_sw.split('self.skipWaiting()').length - 1));
check('index.html loads sw-update.js before app.js',
  _html.indexOf('src="sw-update.js"') >= 0 &&
  _html.indexOf('src="sw-update.js"') < _html.indexOf('src="app.js"'));
check('app.js calls PG_SWUpdate.init', _appjs.indexOf('PG_SWUpdate.init') >= 0);
check('sw-update.js vendored byte-identical to canonical',
  fs.readFileSync(path.join(__dirname, 'sw-update.js'), 'utf8') ===
  fs.readFileSync(path.join(__dirname, '..', '..', 'sw-update.js'), 'utf8'));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
