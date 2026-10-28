import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Sim from '../js/sim.js';
const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const life = load('life-events');
const data = { world: load('world'), economy: load('economy'), content: load('content'), events: [...load('events').events, ...life.events], narrative: { ...load('narrative'), beats: [...load('narrative').beats, ...life.beats] } };
assert.equal(new Set(data.events.map(x => x.id)).size, data.events.length);
assert.equal(new Set(data.narrative.beats.map(x => x.id)).size, data.narrative.beats.length);
function open(seed, mode = 'sandbox', history) {
  const run = Sim.createRun(data, { seed, mode, history, sandbox: { assets: 10 } });
  run.shape = { style: 'quit', venue: 'home', revenue: Sim.allowedRevenue(data,run)[0], fulfillment: Sim.allowedFulfillment(data,run)[0], ownership:'sole', positioning:Object.keys(data.economy.positioning)[0] };
  run.phase='shaping'; assert.ok(Sim.confirmShape(data,run).ok); Sim.confirmName(run,'測試公司');
  run.finance.cash=100; run.spine=[]; run.nextChapter=999; run.firstMajor={};
  return run;
}
const stages = [['spark',3],['early',6],['growth',22],['mature',62],['legacy',162],['century',302]];
for (const [stage, month] of stages) {
  for (let i=0; i<20; i++) {
    const r=open(`${stage}-${i}`); r.month=month-1; r.lastMajorMonth=-100;
    const isolated={...data, events:life.events.map(({spine,...e})=>e), narrative:{...data.narrative,beats:life.beats}};
    Sim.settle(isolated,r);
    assert.equal(Sim.stageOf(data,r.month).id,stage);
    assert.equal(r.phase,'event');
    assert.match(r.pendingEvent.grammar,new RegExp(`^LIFE_${stage.toUpperCase()}$`));
    assert.doesNotMatch(r.pendingEvent.body,/\{\w+\}/);
    assert.ok(r.lastBeats.length);
    const lifeBeats = r.lastBeats.filter(beat => life.beats.some(x => x.id === beat.id));
    assert.ok(lifeBeats.length);
    for (const beat of lifeBeats) {
      assert.ok(life.beats.find(x=>x.id===beat.id).stages.includes(stage));
      assert.doesNotMatch(beat.text,/\{\w+\}/);
    }
    const event=r.pendingEvent; Sim.chooseEvent(isolated,r,event.choices[0].id);
    assert.ok(r.timeline.some(t=>t.kind==='decision' && t.choice && t.text));
    assert.ok(r.timeline.some(t=>t.kind==='quarter' && Number.isFinite(t.cash)));
    assert.ok(r.timeline.some(t=>t.kind==='beat' && t.note));
    r.phase='play'; r.lastMajorMonth=-100; r.finance.cash=100;
    Sim.settle(isolated,r);
    assert.equal(r.phase,'event');
    assert.notEqual(r.pendingEvent.id,event.id, 'do not repeat when an unseen event is available');
  }
}
const history={cities:[],families:[],gaps:[],events:['life_first_repeat'],beats:['life_sample']};
assert.deepEqual(open('history','story',history).recentEvents, history.events);
assert.deepEqual(open('history','sandbox',history).recentEvents, []);
assert.deepEqual(open('history','daily',history).recentBeats, []);
// Preview must not consume a beat, write a journal entry, or mutate the RNG in the real run.
const r=open('preview'); const before=JSON.stringify(r); Sim.previewMonth(data,r); assert.equal(JSON.stringify(r),before);
console.log('Lifecycle tests passed: six stages, varied events and beats, journal, history and preview.');
