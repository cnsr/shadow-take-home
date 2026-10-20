// Deterministic generator for the bundled marketing dataset.
// Run: node scripts/gen-data.mjs  -> writes src/data/dataset.ts
// Uses a seeded PRNG so the dataset is stable across runs.
import { writeFileSync, mkdirSync } from 'node:fs';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260721);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const jitter = (base, pct) => base * (1 + (rand() * 2 - 1) * pct);
const r2 = (n) => Math.round(n * 100) / 100;

// 90 days ending 2026-06-30 (dataset is a fixed snapshot; "today" for the
// exercise is pinned to 2026-07-01 so "last month" = June is deterministic).
const DAYS = 90;
const END = new Date(Date.UTC(2026, 5, 30)); // 2026-06-30
function dateStr(offsetFromStart) {
  const d = new Date(END);
  d.setUTCDate(d.getUTCDate() - (DAYS - 1) + offsetFromStart);
  return d.toISOString().slice(0, 10);
}

// Channels intentionally use inconsistent casing/spelling to create real-world
// messiness the agent has to normalize.
const campaigns = [
  { id: 'cmp_meta_pros_evergreen', name: 'Meta | Prospecting | Evergreen',   channel: 'Meta',      stage: 'Prospecting', baseSpend: 1200, baseRoas: 1.8 },
  { id: 'cmp_meta_retarget_dpa',   name: 'Meta | Retargeting | DPA',         channel: 'meta',      stage: 'Retargeting', baseSpend: 480,  baseRoas: 4.6 },
  { id: 'cmp_meta_pros_ugc',       name: 'Meta | Prospecting | UGC Testing', channel: 'Facebook',  stage: 'Prospecting', baseSpend: 900,  baseRoas: 2.1 },
  { id: 'cmp_google_brand',        name: 'Google | Brand Search',            channel: 'Google',    stage: 'Retargeting', baseSpend: 350,  baseRoas: 8.2 },
  { id: 'cmp_google_nonbrand',     name: 'Google | Non-Brand Search',        channel: 'google',    stage: 'Prospecting', baseSpend: 1500, baseRoas: 1.4 },
  { id: 'cmp_google_pmax',         name: 'Google | PMax | Catch-All',        channel: 'Google',    stage: 'Prospecting', baseSpend: 1100, baseRoas: 2.6 },
  { id: 'cmp_tiktok_pros_spark',   name: 'TikTok | Prospecting | Spark Ads', channel: 'TikTok',    stage: 'Prospecting', baseSpend: 800,  baseRoas: 1.6 },
  { id: 'cmp_tiktok_retarget',     name: 'TikTok | Retargeting',             channel: 'tiktok',    stage: 'Retargeting', baseSpend: 260,  baseRoas: 3.4 },
  { id: 'cmp_pinterest_pros',      name: 'Pinterest | Prospecting',          channel: 'Pinterest', stage: 'Prospecting', baseSpend: 300,  baseRoas: 2.0 },
  { id: 'cmp_amazon_sp',           name: 'Amazon | Sponsored Products',      channel: 'Amazon',    stage: 'Retargeting', baseSpend: 640,  baseRoas: 5.1 },
];

const rows = [];
for (let day = 0; day < DAYS; day++) {
  const date = dateStr(day);
  // seasonality: gentle ramp + a promo spike around day 70-74 (late June)
  const season = 1 + 0.25 * Math.sin((day / DAYS) * Math.PI);
  const promo = day >= 70 && day <= 74 ? 1.8 : 1;
  for (const c of campaigns) {
    // Messiness: TikTok retargeting didn't start until ~day 30 (gap = null-free,
    // rows simply don't exist before launch).
    if (c.id === 'cmp_tiktok_retarget' && day < 30) continue;
    // Messiness: Pinterest paused for a week mid-flight (days 45-51 missing).
    if (c.id === 'cmp_pinterest_pros' && day >= 45 && day <= 51) continue;

    const spend = r2(jitter(c.baseSpend * season * promo, 0.18));
    const roas = Math.max(0.2, jitter(c.baseRoas * (promo > 1 ? 1.15 : 1), 0.22));
    const revenue = r2(spend * roas);
    const aov = jitter(64, 0.15);
    const conversions = Math.max(0, Math.round(revenue / aov));
    const cvr = jitter(0.022, 0.25);
    const clicks = Math.max(conversions, Math.round(conversions / cvr));
    const cpc = jitter(0.9, 0.2);
    const impressions = Math.round((spend / cpc) / jitter(0.012, 0.2));
    rows.push({
      date,
      campaign_id: c.id,
      campaign: c.name,
      channel: c.channel,
      funnel_stage: c.stage,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
    });
  }
}

// Creatives table (Meta + TikTok only), with format / angle / creator.
const formats = ['Static', 'Video', 'Carousel', 'UGC Video'];
const angles = ['Problem-Solution', 'Social Proof', 'Founder Story', 'Discount', 'Unboxing'];
const creators = ['in-house', '@maya.creates', '@thefitdad', 'agency-a', '@skincarejane'];
const creatives = [];
const creativeCampaigns = campaigns.filter((c) => /meta|facebook|tiktok/i.test(c.channel));
for (let i = 0; i < 24; i++) {
  const c = pick(creativeCampaigns);
  const spend = r2(jitter(2200, 0.6));
  const roas = Math.max(0.3, jitter(c.baseRoas, 0.5));
  const revenue = r2(spend * roas);
  const conversions = Math.max(0, Math.round(revenue / jitter(64, 0.15)));
  const clicks = Math.max(conversions, Math.round(conversions / jitter(0.02, 0.3)));
  const impressions = Math.round(clicks / jitter(0.011, 0.3));
  creatives.push({
    creative_id: `cr_${String(i + 1).padStart(3, '0')}`,
    campaign_id: c.id,
    channel: c.channel,
    format: pick(formats),
    angle: pick(angles),
    creator: pick(creators),
    launched: dateStr(Math.floor(rand() * (DAYS - 20))),
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
  });
}

const header = `// AUTO-GENERATED by scripts/gen-data.mjs — do not edit by hand.
// A fixed 90-day snapshot of marketing performance for a fictional DTC brand.
// The exercise pins "today" to 2026-07-01, so "last month" = June 2026.
`;

const ts = `${header}
export interface PerfRow {
  date: string;            // YYYY-MM-DD
  campaign_id: string;
  campaign: string;
  channel: string;         // NOTE: casing/spelling is intentionally inconsistent
  funnel_stage: 'Prospecting' | 'Retargeting';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface Creative {
  creative_id: string;
  campaign_id: string;
  channel: string;
  format: string;
  angle: string;
  creator: string;
  launched: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export const DATASET_SNAPSHOT_DATE = '2026-07-01';

export const perfRows: PerfRow[] = ${JSON.stringify(rows)};

export const creatives: Creative[] = ${JSON.stringify(creatives)};
`;

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/dataset.ts', import.meta.url), ts);
console.log(`Wrote ${rows.length} perf rows and ${creatives.length} creatives.`);
