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
check('manifold torque 15-17 ft-lbs', spec('Manifold mounting cap screws') === '15–17 ft-lbs');
check('backplate torque 10-12 ft-lbs', spec('Backplate-to-cylinder-head screws') === '10–12 ft-lbs');
check('idle 1000-1050 rpm', spec('Engine idle speed') === '1000–1050 rpm');
check('leak checklist has 6 steps', app.CHECKLISTS.leak.steps.length === 6);
check('bench checklist has 7 steps', app.CHECKLISTS.bench.steps.length === 7);
check('tuning guide covers pilot-first order',
  app.CV40_TUNING.some(function (x) { return x.title === 'Order matters'; }));
check('tuning guide covers enrichener-is-not-a-choke',
  app.CV40_TUNING.some(function (x) { return x.title.indexOf('enrichener') >= 0; }));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
