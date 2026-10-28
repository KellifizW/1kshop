import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../js/sim.js';
import { cashflowLedger } from '../js/cashflow.js';
const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const data = { world: load('world'), economy: load('economy'), content: load('content'), events: [...load('events').events, ...load('life-events').events], narrative: { ...load('narrative'), beats: [...load('narrative').beats, ...load('life-events').beats] } };
function prepared(seed, gap, venue = 'street') {
  const run = S.createRun(data, { seed, mode: 'sandbox', sandbox: { gap, assets: 0 } });
  run.shape = { style: 'quit', venue, revenue: S.allowedRevenue(data, run)[0], fulfillment: S.allowedFulfillment(data, run)[0], ownership: 'sole', positioning: Object.keys(data.economy.positioning)[0] };
  run.phase = 'shaping';
  return run;
}
function open(run) { assert.equal(S.confirmShape(data, run).ok, true); S.confirmName(run, '測試'); run._cf = true; }
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
for (const gap of data.content.gaps) {
  const run = prepared('industry-' + gap.id, gap.id);
  assert.ok(run.openingSupport.cash > 0);
  const preview = S.previewVenture(data, run);
  open(run);
  close(run.finance.cash, preview.cash);
  assert.ok(S.initiatives(data, run).some(x => x.id === 'turnaround_lean'));
  assert.ok(S.initiatives(data, run).some(x => x.id === 'turnaround_offer'));
  const fixed = run.venture.perm.fixed;
  S.actInitiative(data, run, 'turnaround_lean');
  close(run.venture.perm.fixed, fixed * .75);
  assert.equal(run.flags.turnaround_lean, true);
  assert.equal(S.actInitiative(data, run, 'turnaround_lean').ok, false);
}
const a = prepared('stable-seed', data.content.gaps[0].id);
const b = prepared('stable-seed', data.content.gaps[0].id);
assert.deepEqual(a.openingSupport, b.openingSupport);
const preview = S.previewVenture(data,a); const personal = structuredClone(a.personal);
S.confirmShape(data,a);
close(S.previewVenture(data,a).cash,preview.cash);
assert.ok(S.undoShape(a)); assert.deepEqual(a.personal, personal);
S.confirmShape(data,a); close(a.finance.cash,preview.cash); S.confirmName(a,'測試'); a._cf=true;
for (let q=1;q<=5;q++) {
  a.phase='play'; const forecast = S.forecast(data,a); const p = S.previewMonth(data,a);
  S.settle(data,a); close(a.last.parts.premises, p.parts.premises);
  close(a.last.parts.openingRelief, q <= 4 ? forecast.parts.openingRelief : 0);
  assert.equal(a.last.parts.openingRelief > 0, q <= 4);
  const ledger = cashflowLedger(a.last); close(ledger.net, ledger.totalIn-ledger.totalOut);
}
const c = prepared('collect',data.content.gaps[0].id,'home'); open(c);
c.finance.arQueue=[{amount:2,due:8}]; const cash=c.finance.cash;
assert.ok(S.actInitiative(data,c,'collect_early').ok); close(c.finance.cash,cash+1.9); assert.equal(c.finance.arQueue.length,0);
c.phase='laststand'; c.finance.cash=-10; c.rescueLeft=3;
S.chooseRescue(data,c,'turnaround_lean'); close(c.finance.cash,-10); assert.equal(c.phase,'laststand');
S.chooseRescue(data,c,'delay'); close(c.finance.cash,-9.15); close(c.finance.debt, .85);
assert.ok(!S.rescueOptions(data,c).some(x=>x.id==='delay'));
const d=prepared('presell', data.content.gaps[1].id,'home'); open(d); d.phase='laststand'; d.finance.cash=-4; d.venture.trust=.5; d.rescueLeft=3;
S.chooseRescue(data,d,'presell'); close(d.finance.cash,-2.85);
let total=0; for(let i=0;i<4;i++) { d.phase='play'; d.finance.cash=100; S.settle(data,d); total+=d.last.parts.advance; }
close(total,1.15);
// A sustained loss can turn into a surplus after restructuring; it is not guaranteed.
let turned = false;
for (let i=0; i<1000 && !turned; i++) {
  const r=prepared('turnaround-'+i, data.content.gaps[i % data.content.gaps.length].id, ['street','home','studio'][i % 3]);
  open(r); r.month=5; r.finance.debt=0; r.commitments=[]; r.founder.wantsDraw=0; r.venture.marketFit=0.65;
  const f=S.forecast(data,r); const before=f.revenue[0]/(1-data.economy.formula.forecast_band)-f.parts.operating;
  S.actInitiative(data,r,'turnaround_lean');
  const g=S.forecast(data,r); const after=g.revenue[0]/(1-data.economy.formula.forecast_band)-g.parts.operating;
  if(before < -0.01 && after > 0.01) turned=true;
}
assert.ok(turned, 'Expected at least one loss-to-surplus scenario');
const e=prepared('defer',data.content.gaps[0].id,'home'); open(e);
e.phase='laststand'; e.finance.cash=-3; e.rescueLeft=3;
S.chooseRescue(data,e,'delay');
let deferred=0; for(let i=0;i<4;i++) { e.phase='play'; e.finance.cash=100; S.settle(data,e); deferred+=e.last.parts.principal; }
close(deferred,.85); close(e.finance.debt,0);

console.log(`Gameplay tests passed for ${data.content.gaps.length} industries/gaps.`);
