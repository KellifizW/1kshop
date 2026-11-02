import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Sim from '../js/sim.js';
const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const life = load('life-events');
const data = { world: load('world'), economy: load('economy'), content: load('content'), events: [...load('events').events, ...life.events], narrative: { ...load('narrative'), beats: [...load('narrative').beats, ...life.beats] } };
function open(seed = 'company') {
  const r = Sim.createRun(data, { seed, mode:'sandbox', sandbox:{ assets:10 } });
  r.shape = { style:'quit', venue:'home', revenue:Sim.allowedRevenue(data,r)[0], fulfillment:Sim.allowedFulfillment(data,r)[0], ownership:'sole', positioning:Object.keys(data.economy.positioning)[0] };
  r.phase = 'shaping'; assert.ok(Sim.confirmShape(data,r).ok); Sim.confirmName(r,'測試公司');
  r.finance.cash = 100; r.spine = []; r.nextChapter = 999; r.firstMajor = {};
  return r;
}
const get = id => data.events.find(e => e.id === id);
function choose(r, id, option) {
  r.pendingEvent = structuredClone(get(id)); r.phase = 'event';
  assert.ok(Sim.chooseEvent(data,r,option).ok, `${id}:${option}`);
}
// Scheduled early opportunity is not random, and cash crisis and chapter handling remain intact.
for (let i=0;i<20;i++) {
  const r=open(`hire-${i}`); r.month=2; r.lastMajorMonth=0;
  Sim.settle(data,r); assert.equal(r.pendingEvent?.id,'company_first_hire');
  assert.ok(!r.pendingEvent.body.includes('{company}'));
}
const low = open(); low.finance.cash=.1;
assert.equal(Sim.eventChoiceDisabled(data,low,get('company_first_hire').choices[0]),true);
assert.equal(Sim.eventChoiceDisabled(data,low,get('company_first_hire').choices[2]),false);
low.pendingEvent=get('company_first_hire'); low.phase='event';
assert.equal(Sim.chooseEvent(data,low,'hire').ok,false); assert.equal(low.team.headcount,0);
const r=open(); choose(r,'company_first_hire','hire');
assert.equal(r.team.headcount,1); assert.equal(r.crew.filter(c=>!c.gone).length,1); assert.equal(r.kpis.hires,1);
const staffCost = Sim.previewMonth(data,r).parts.labor;
const solo=open(); assert.ok(staffCost > Sim.previewMonth(data,solo).parts.labor);
choose(r,'company_team_growth','hire'); assert.equal(r.team.headcount,2);
const beforeWage=r.team.wageMult; choose(r,'company_people_management','raise'); assert.ok(r.team.wageMult>beforeWage);
const preRevenue=r.venture.perm.revenue; choose(r,'company_diversify','launch');
assert.ok(r.venture.perm.revenue>preRevenue); assert.equal(r.flags.business_scope,'原業務及相鄰新服務');
assert.equal(r.chains.at(-1).event,'company_diversify_review');
// Save/load state keeps chains, company identity and the decision's consequences.
const reloaded=JSON.parse(JSON.stringify(r)); assert.deepEqual(reloaded.chains,r.chains);
reloaded.month+=2; reloaded.lastMajorMonth=-99; reloaded.finance.cash=100; Sim.settle(data,reloaded);
assert.equal(reloaded.pendingEvent?.id,'company_diversify_review'); assert.ok(reloaded.pendingEvent.chainCause);
assert.ok(Sim.chooseEvent(data,reloaded,'lean').ok);
const buy=open(); choose(buy,'company_acquire','buy');
assert.equal(buy.team.headcount,1); assert.equal(buy.flags.acquired_business,true); assert.ok(buy.venture.perm.capacity>1);
assert.equal(buy.chains.at(-1).event,'company_acquire_review');
const sell=open(); const before=sell.personal.cash; choose(sell,'company_buyer_offer','majority');
assert.equal(sell.founder.control,.35); assert.equal(sell.personal.cash,before+2); assert.equal(sell.phase,'play');
assert.equal(sell.flags.company_structure,'受收購方控制的公司');
const exit=open(); choose(exit,'company_buyer_offer','sell'); assert.equal(exit.phase,'ending'); assert.equal(exit.ending.id,'sale');
const shrink=open(); choose(shrink,'company_first_hire','hire'); const cash=shrink.finance.cash;
choose(shrink,'company_downsize','reduce'); assert.equal(shrink.team.headcount,0); assert.ok(shrink.finance.cash<cash); assert.equal(shrink.kpis.fired,1);
// A scheduled milestone queues across a chapter instead of being lost.
const chapter=open(); chapter.month=2; chapter.nextChapter=3; Sim.settle(data,chapter);
assert.equal(chapter.phase,'chapter'); assert.equal(chapter.queuedEvent.id,'company_first_hire');
Sim.continueChapter(chapter); assert.equal(chapter.pendingEvent.id,'company_first_hire');
// Eligibility really excludes solo-only and staff/majority-only events.
const only={...data,events:[get('company_first_hire')]};
const staffed=open(); choose(staffed,'company_first_hire','hire'); delete staffed.seen.company_first_hire;
staffed.month=5; staffed.lastMajorMonth=-100; Sim.settle(only,staffed); assert.notEqual(staffed.pendingEvent?.id,'company_first_hire');
console.log('Company lifecycle: scheduling, staffing, wages, affordability, diversification, acquisitions, sale, downsizing, chains, saving and chapters OK');
