// 歷史資料、事件順序、分支效果、存檔和舊模式回歸。
// node --experimental-default-type=module tests/historical.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../js/sim.js';
import * as P from '../js/present.js';
import * as H from '../js/historical.js';
import { shareText } from '../js/share.js';

const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const life = load('life-events');
const data = {
  world: load('world'), economy: load('economy'), content: load('content'),
  historical: load('historical'),
  events: [...load('events').events, ...life.events],
  narrative: { ...load('narrative'), beats: [...load('narrative').beats, ...life.beats] },
};
const companies = data.historical.companies;
assert.equal(companies.length, 100);
assert.deepEqual(companies.map(c => c.rank), Array.from({ length: 100 }, (_, i) => i + 1));
assert.equal(new Set(companies.map(c => c.id)).size, 100);
assert.equal(data.historical.meta.asOf, '2026-03-31');
assert.match(data.historical.meta.rankingSource, /^https:\/\/www\.pwc\.co\.uk\//);
assert.equal(data.economy.modes.history.official, false);
assert.deepEqual(companies.slice(0, 5).map(c => c.id), ['nvidia', 'apple', 'alphabet', 'microsoft', 'amazon']);
assert.equal(companies.at(-1).id, 'intuitive');
const researched = readFileSync(new URL('../research/historical-companies.psv', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('|'));
assert.equal(researched.length, 100);
for (const [i, fields] of researched.entries()) {
  const c = companies[i];
  assert.equal(fields.length, 19);
  assert.equal(c.id, fields[1]); assert.equal(c.source, fields[8]);
  assert.equal(c.milestones[0].fact, fields[10]); assert.equal(c.milestones[1].fact, fields[15]);
  assert.equal(c.milestones[0].alternate, fields[12]); assert.equal(c.milestones[1].alternate, fields[17]);
}
assert.throws(() => S.createRun(data, { mode: 'history', historicalCompanyId: 'not-a-company' }), /歷史範本/);

function open(company, seed = 'history-test') {
  const r = S.createRun(data, { mode: 'history', seed, historicalCompanyId: company.id,
    history: { cities: ['taipei'], families: ['mfg'], gaps: [company.modelGap], events: ['x'], beats: ['y'] } });
  assert.equal(r.historical.companyId, company.id);
  assert.equal(r.gapId, company.modelGap);
  assert.equal(r.cityId, company.modelCity);
  assert.equal(r.official, false);
  assert.deepEqual(r.recentEvents, []);
  assert.deepEqual(r.recentBeats, []);
  assert.equal(S.ensureWork(data, r).name, company.name);
  assert.equal(P.business(data, r).sells, company.startingBusiness);
  assert.equal(P.worldLine(data, r).city.name, company.origin);
  assert.match(P.money(data, r, 1.2), /遊戲單位/);
  assert.match(S.calendarLabel(r), /^模擬/);
  assert.deepEqual(S.nameOptions(r, data), [company.name]);
  S.acknowledgeReveal(r); S.acceptOpportunity(r);
  r.shape = { style: 'keep', venue: 'home', revenue: S.allowedRevenue(data, r)[0],
    fulfillment: S.allowedFulfillment(data, r)[0], ownership: 'sole', positioning: 'pro' };
  assert.equal(S.confirmShape(data, r).ok, true);
  const startupCash = r.finance.cash;
  assert.ok(S.undoShape(r));
  assert.equal(r.historical.companyId, company.id);
  assert.equal(S.confirmShape(data, r).ok, true);
  assert.equal(r.finance.cash, startupCash);
  S.confirmName(r, company.name);
  assert.equal(r.venture.core, company.startingBusiness);
  assert.ok(r.peers.every(p => !p.name.includes('undefined')));
  r.finance.cash = 1000; // isolate scheduling and effects; not a balance assumption
  r.spine = []; r.nextChapter = 8; r.firstMajor = { skip: true };
  return r;
}
function advanceToFirstEvent(r, company) {
  let guard = 0;
  while (guard++ < 20 && !(r.phase === 'event' && r.pendingEvent.historicalCompany)) {
    if (r.phase === 'play') S.settle(data, r);
    else if (r.phase === 'event') assert.ok(S.chooseEvent(data, r, S.suggestEventChoice(r.pendingEvent, r, data)).ok);
    else if (r.phase === 'chapter') S.continueChapter(r);
    else throw Error(`${company.id}: unexpected ${r.phase}`);
  }
  assert.ok(guard < 20, company.id);
  assert.equal(r.pendingEvent.historicalCompany, company.id);
  assert.equal(r.pendingEvent.historicalIndex, 0);
  assert.equal(r.pendingEvent.historicalYear, company.milestones[0].year);
  assert.equal(r.pendingEvent.historicalFact, company.milestones[0].fact);
  assert.equal(r.pendingEvent.historicalSource, company.source);
}
for (const c of companies) {
  assert.ok(c.name && c.english && c.startingBusiness && c.origin && c.source);
  assert.match(c.source, /^https:\/\//);
  assert.ok(S.gapById(data, c.modelGap) && S.cityById(data, c.modelCity), c.id);
  assert.equal(c.milestones.length, 2, c.id);
  assert.ok(c.milestones[0].year >= c.startYear && c.milestones[1].year >= c.milestones[0].year, c.id);
  assert.deepEqual(c.milestones.map(m => m.due), [2, 8]);
  for (const m of c.milestones) assert.ok(m.fact && m.historical && m.alternate && m.historical !== m.alternate, c.id);
  let r = open(c, `history-${c.id}`);
  const beforePreview = JSON.stringify(r);
  S.previewMonth(data, r);
  assert.equal(JSON.stringify(r), beforePreview, `preview mutated ${c.id}`);
  advanceToFirstEvent(r, c);
  assert.equal(r.pendingEvent.choices.length, 3);
  assert.deepEqual(r.pendingEvent.choices.map(x => x.id), ['historical', 'alternate', 'hold']);
  // Serialising a pending event must neither lose it nor resolve it twice.
  r = JSON.parse(JSON.stringify(r));
  assert.equal(r.historical.nextMilestone, 0);
  const hist = structuredClone(r), alt = structuredClone(r);
  assert.equal(S.chooseEvent(data, hist, 'historical').ok, true);
  assert.equal(S.chooseEvent(data, alt, 'alternate').ok, true);
  assert.equal(hist.historical.decisions[0].route, 'historical');
  assert.equal(alt.historical.decisions[0].route, 'alternate');
  assert.notDeepEqual(hist.finance, alt.finance, `${c.id} choices must have real effects`);
  assert.equal(alt.historical.nextMilestone, 1);
  assert.equal(alt.historical.currentDirection, c.milestones[0].alternate);
  assert.equal(P.business(data, alt).direction, c.milestones[0].alternate);
  assert.equal(S.chooseEvent(data, alt, 'alternate').ok, false);
  // The second milestone is queued at the chapter, survives reload and describes divergence honestly.
  r = alt;
  let guard = 0;
  while (guard++ < 100 && !(r.phase === 'chapter' && r.queuedEvent?.historicalCompany)) {
    if (r.phase === 'play') S.settle(data, r);
    else if (r.phase === 'event') assert.ok(S.chooseEvent(data, r, S.suggestEventChoice(r.pendingEvent, r, data)).ok);
    else if (r.phase === 'chapter') S.continueChapter(r);
    else throw Error(`${c.id}: unexpected ${r.phase}`);
  }
  assert.ok(guard < 100, `${c.id}: chapter event missing`);
  assert.equal(r.month, 8);
  assert.equal(r.queuedEvent.historicalIndex, 1);
  assert.match(r.queuedEvent.body, /上次選了/);
  r = JSON.parse(JSON.stringify(r)); S.continueChapter(r);
  assert.equal(r.phase, 'event');
  assert.equal(r.pendingEvent.historicalYear, c.milestones[1].year);
  assert.ok(S.chooseEvent(data, r, 'historical').ok);
  assert.equal(r.historical.nextMilestone, 2);
  assert.equal(r.historical.decisions.length, 2);
  assert.equal(H.dueHistoricalEvent(data, r), null);
  assert.equal(r.timeline.filter(t => t.title.includes('的轉折')).length, 2);
}

// A decision produces a causal, explicitly fictional follow-up with its own real effects.
let follow = open(companies[1], 'followup');
follow.spine = []; follow.nextChapter = 999;
advanceToFirstEvent(follow, companies[1]);
assert.ok(S.chooseEvent(data, follow, 'alternate').ok);
assert.equal(follow.historical.followups.length, 1);
assert.equal(follow.historical.followups[0].due, follow.month + 2);
let followGuard = 0;
while (followGuard++ < 20 && !(follow.phase === 'event' && follow.pendingEvent.historyFollowup)) {
  if (follow.phase === 'play') S.settle(data, follow);
  else if (follow.phase === 'event') S.chooseEvent(data, follow, S.suggestEventChoice(follow.pendingEvent, follow, data));
  else throw Error(`unexpected follow-up phase ${follow.phase}`);
}
assert.ok(followGuard < 20);
assert.match(follow.pendingEvent.body, /虛構後續/);
assert.equal(follow.pendingEvent.chainCause.choice, companies[1].milestones[0].alternate);
follow = JSON.parse(JSON.stringify(follow));
const followCash = follow.finance.cash, followTrust = follow.venture.trust;
assert.ok(S.chooseEvent(data, follow, 'test').ok);
assert.ok(Math.abs(follow.finance.cash - (followCash - 0.1)) < 1e-8);
assert.ok(follow.venture.trust > followTrust);
assert.equal(follow.historical.followups[0].done, true);
assert.equal(follow.historical.nextMilestone, 1);
assert.equal(H.dueHistoricalEvent(data, follow), null);

// A crisis at a due quarter must defer, not consume, the historical event.
const delayed = open(companies[0], 'delayed');
delayed.spine = []; delayed.nextChapter = 999;
delayed.month = 1; delayed.finance.cash = -100;
S.settle(data, delayed);
assert.equal(delayed.phase, 'laststand');
assert.equal(delayed.historical.nextMilestone, 0);
delayed.finance.cash = 1000;
assert.ok(S.chooseRescue(data, delayed, 'turnaround_lean').ok);
assert.equal(delayed.phase, 'play');
S.settle(data, delayed);
assert.equal(delayed.pendingEvent.historicalIndex, 0);

// Same seed, company and choices replay; story modes never emit history cards.
const a = open(companies[1], 'same-seed'), b = open(companies[1], 'same-seed');
advanceToFirstEvent(a, companies[1]); advanceToFirstEvent(b, companies[1]);
S.chooseEvent(data, a, 'alternate'); S.chooseEvent(data, b, 'alternate');
assert.deepEqual(a, b);
const story = S.createRun(data, { seed: 'story-regression', mode: 'story' });
assert.equal(story.historical, undefined);
assert.equal(H.dueHistoricalEvent(data, story), null);
assert.doesNotMatch(P.money(data, story, 1), /遊戲單位/);
assert.doesNotMatch(S.calendarLabel(story), /模擬/);
// A proxy's Taiwan-only / regional cards must not become claimed foreign-company history.
const regionalOnly = { ...data, events: data.events.filter(e => e.layer === 'regional' || e.cities) };
const foreign = open(companies[1], 'foreign-proxy');
foreign.historical.nextMilestone = 2; foreign.historical.followups = [];
foreign.month = 20; foreign.spine = []; foreign.chains = []; foreign.nextChapter = 999; foreign.lastMajorMonth = -100;
S.settle(regionalOnly, foreign);
assert.equal(foreign.phase, 'play');
assert.ok(shareText(data, a, null, { name: '蘋果', years: '歷史模擬', title: '測試', cause: '測試', life: '一季', customers: 1, peakCrew: 0, epitaph: '測試' }).includes('不是企業的真實結果'));
console.log('historical: 100 sourced companies, 200 chronological events, branches, save/reload, chapters, crisis and deterministic replay OK');
