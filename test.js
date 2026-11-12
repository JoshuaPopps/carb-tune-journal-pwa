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
check('current main jet folded to 175', setup.main_jet === '175', setup.main_jet);
check('pilot still stock 42', setup.pilot_jet === '42');
check('float still baseline range', setup.float_height === '0.413-0.453 in.');
var e2 = s.entries.filter(function (e) { return e.num === 2; })[0];
var d = app.entryDeltas(s, e2);
check('entry #2 delta is main 170 -> 175',
  d.length === 1 && d[0].key === 'main_jet' && d[0].from === '170' && d[0].to === '175',
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
check('round-trip keeps effective setup', app.effectiveSetup(back, backGenuine.id).main_jet === '175');
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
