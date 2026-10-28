// Compile the researched, hand-authored source table. No network is used at runtime.
// Run: node scripts/build-historical-data.mjs
import { readFile, writeFile } from 'node:fs/promises';

const table = await readFile(new URL('../research/historical-companies.psv', import.meta.url), 'utf8');
const rows = table.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
const sectorModels = {
  chips: ['short_run', 'taipei'], electronics: ['short_run', 'taipei'],
  industrial: ['short_run', 'taipei'], auto: ['short_run', 'taipei'],
  software: ['inventory_tool', 'taipei'], network: ['legacy_data', 'taipei'],
  platform: ['group_buy', 'taipei'], telecom: ['legacy_data', 'taipei'],
  retail: ['same_day', 'taipei'], luxury: ['missing_sizes', 'taipei'],
  consumer: ['d2c_brand', 'taipei'], food: ['kitchen_prep', 'taipei'],
  energy: ['energy_audit', 'taipei'], bank: ['micro_float', 'taipei'],
  payments: ['merchant_payments', 'taipei'], insurance: ['micro_float', 'taipei'],
  pharma: ['telehealth_support', 'taipei'], agri: ['farm_sourcing', 'taipei'],
  media: ['creator_venue', 'taipei'],
};
const kinds = new Set(['product', 'technology', 'network', 'capital', 'acquisition', 'restructure', 'expansion']);
const companies = rows.map((line, index) => {
  const fields = line.split('|');
  if (fields.length !== 19) throw Error(`Row ${index + 1}: expected 19 fields, got ${fields.length}`);
  const [rank, id, name, english, start, origin, sector, business, source,
    y1, fact1, real1, alternate1, type1, y2, fact2, real2, alternate2, type2] = fields;
  if (!sectorModels[sector] || !kinds.has(type1) || !kinds.has(type2)) throw Error(`Unknown model: ${id}`);
  if (+rank !== index + 1 || !/^https:\/\//.test(source) || +y1 < +start || +y2 < +y1) throw Error(`Bad chronology, URL, or rank: ${id}`);
  return {
    id, rank: +rank, name, english, startYear: +start, origin, sector,
    startingBusiness: business, source,
    modelGap: sectorModels[sector][0], modelCity: sectorModels[sector][1],
    milestones: [
      { id: `${id}_1`, year: +y1, fact: fact1, historical: real1, alternate: alternate1, type: type1, due: 2 },
      { id: `${id}_2`, year: +y2, fact: fact2, historical: real2, alternate: alternate2, type: type2, due: 8 },
    ],
  };
});
if (companies.length !== 100 || new Set(companies.map(c => c.id)).size !== 100) throw Error('Expected 100 unique companies');
const data = {
  meta: {
    id: 'pwc-2026-03-31',
    title: 'PwC 全球上市公司市值百強',
    asOf: '2026-03-31',
    rankingSource: 'https://www.pwc.co.uk/audit/assets/pdf/global-100/companies/global-top-100-companies-2026.pdf',
    methodology: '普華永道以 S&P Global Market Intelligence 資料分析，按 2026 年 3 月 31 日上市公司美元市值排名；並非營收排名，亦非即時排名。',
    note: '每家公司選取兩個可追溯史料的里程碑；決策、假設分支、遊戲數值及觸發時間均為創作。模擬不是完整企業傳記。',
  },
  companies,
};
await writeFile(new URL('../data/historical.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Built ${companies.length} companies and ${companies.reduce((n,c) => n + c.milestones.length, 0)} researched milestones.`);
