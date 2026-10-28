import {readFileSync} from 'node:fs';
import * as S from '../js/sim.js';
const load=n=>JSON.parse(readFileSync(new URL(`../data/${n}.json`,import.meta.url)));
const data={world:load('world'),economy:load('economy'),content:load('content'),events:[...load('events').events,...load('life-events').events],narrative:{...load('narrative'),beats:[...load('narrative').beats,...load('life-events').beats]}};
let results={};
for (const style of ['quit','keep']) {
  let early=0,four=0,profit=0;
  for (let i=0;i<200;i++) {
    const r=S.createRun(data,{seed:`balance-${i}`,mode:'story'});
    r.shape={style,venue:'street',revenue:S.allowedRevenue(data,r)[0],fulfillment:S.allowedFulfillment(data,r)[0],ownership:'sole',positioning:Object.keys(data.economy.positioning)[0]};
    r.phase='shaping'; S.confirmShape(data,r); S.confirmName(r,'測試');
    for(let step=0;step<50 && r.month<4 && !r.ending;step++) {
      if(r.phase==='play') S.settle(data,r);
      else if(r.phase==='event') S.chooseEvent(data,r,S.suggestEventChoice(r.pendingEvent,r));
      else if(r.phase==='laststand') { early++; break; }
      else if(r.phase==='chapter') S.continueChapter(r); else break;
    }
    if(r.month>=4 && r.phase!=='laststand') four++;
    if(r.finance.lastProfit>0) profit++;
  }
  results[style]={cash_crisis_before_or_at_four:early, reached_four_without_crisis:four, positive_last_operating_margin:profit};
}
console.log(results);
