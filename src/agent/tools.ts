// Tools the agent can call over the bundled marketing dataset.
// Everything runs in-memory in the browser — no database, no network.
//
// NOTE TO CANDIDATE: at least one of these tools returns numbers that are
// subtly wrong. Trust nothing; verify the math.

import { perfRows, creatives, DATASET_SNAPSHOT_DATE, type PerfRow } from '../data/dataset';
import type { ToolSchema } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Raw data uses inconsistent channel casing/spelling (Meta / meta / Facebook).
// This canonicalizes them so grouping and filtering are consistent.
export function canonicalChannel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === 'meta' || s === 'facebook' || s === 'fb') return 'Meta';
  if (s === 'google' || s === 'adwords') return 'Google';
  if (s === 'tiktok') return 'TikTok';
  if (s === 'pinterest') return 'Pinterest';
  if (s === 'amazon') return 'Amazon';
  return raw.trim();
}

interface Filter {
  start_date?: string;
  end_date?: string;
  channel?: string;
  funnel_stage?: string;
  campaign_id?: string;
}

function filterRows(f: Filter): PerfRow[] {
  const wantChannel = f.channel ? canonicalChannel(f.channel) : undefined;
  return perfRows.filter((r) => {
    const d = r.date;
    // Date-range filter. Both start and end dates inclusive.
    const afterStart = !f.start_date || d >= f.start_date;
    const beforeEnd = !f.end_date || d <= f.end_date;
    if (!afterStart || !beforeEnd) return false;
    if (wantChannel && canonicalChannel(r.channel) !== wantChannel) return false;
    if (f.funnel_stage && r.funnel_stage !== f.funnel_stage) return false;
    if (f.campaign_id && r.campaign_id !== f.campaign_id) return false;
    return true;
  });
}

interface Metrics {
  rows: number;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  ctr: number; // click-through rate
  cvr: number; // conversion rate
  cpa: number; // cost per acquisition
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

function aggregate(rows: PerfRow[]): Metrics {
  const spend = sum(rows.map((r) => r.spend));
  const revenue = sum(rows.map((r) => r.revenue));
  const impressions = sum(rows.map((r) => r.impressions));
  const clicks = sum(rows.map((r) => r.clicks));
  const conversions = sum(rows.map((r) => r.conversions));
  // Blended ROAS across the selection: total revenue / total spend.
  const roas = spend ? revenue / spend : 0;
  return {
    rows: rows.length,
    spend: round(spend),
    revenue: round(revenue),
    impressions,
    clicks,
    conversions,
    roas: round(roas, 2),
    ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
    cvr: clicks ? round((conversions / clicks) * 100, 2) : 0,
    cpa: conversions ? round(spend / conversions, 2) : 0,
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export const tools: Record<string, (args: any) => unknown> = {
  get_data_range() {
    const dates = perfRows.map((r) => r.date).sort();
    return {
      snapshot_date: DATASET_SNAPSHOT_DATE,
      earliest: dates[0],
      latest: dates[dates.length - 1],
      note: '"today" for this exercise is the snapshot_date.',
    };
  },

  list_campaigns() {
    const seen = new Map<string, any>();
    for (const r of perfRows) {
      if (!seen.has(r.campaign_id)) {
        seen.set(r.campaign_id, {
          campaign_id: r.campaign_id,
          campaign: r.campaign,
          channel: canonicalChannel(r.channel),
          funnel_stage: r.funnel_stage,
        });
      }
    }
    return [...seen.values()];
  },

  // Filter + aggregate performance. Optionally group by a dimension.
  query_metrics(args: Filter & { group_by?: 'channel' | 'funnel_stage' | 'campaign' | 'date' | 'none' }) {
    const rows = filterRows(args);
    const groupBy = args.group_by ?? 'none';
    if (groupBy === 'none') {
      return { filter: args, overall: aggregate(rows) };
    }
    const keyOf = (r: PerfRow) =>
      groupBy === 'channel'
        ? canonicalChannel(r.channel)
        : groupBy === 'funnel_stage'
        ? r.funnel_stage
        : groupBy === 'date'
        ? r.date
        : r.campaign;
    const groups = new Map<string, PerfRow[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const result = [...groups.entries()]
      .map(([key, rs]) => ({ key, metrics: aggregate(rs) }))
      // Date groups form a time series, so keep them chronological.
      .sort((a, b) => (groupBy === 'date' ? a.key.localeCompare(b.key) : b.metrics.spend - a.metrics.spend));
    return { filter: args, group_by: groupBy, groups: result };
  },

  // Rank creatives by a metric, gated on a minimum spend so we don't crown a
  // creative that got $3 of spend and one lucky sale.
  top_creatives(args: { metric?: 'roas' | 'revenue' | 'conversions'; min_spend?: number; limit?: number }) {
    const metric = args.metric ?? 'roas';
    const minSpend = args.min_spend ?? 500;
    const limit = args.limit ?? 5;
    const scored = creatives
      .filter((c) => c.spend >= minSpend)
      .map((c) => ({
        creative_id: c.creative_id,
        campaign_id: c.campaign_id,
        channel: canonicalChannel(c.channel),
        format: c.format,
        angle: c.angle,
        creator: c.creator,
        spend: round(c.spend),
        revenue: round(c.revenue),
        conversions: c.conversions,
        roas: round(c.revenue / Math.max(c.spend, 1), 2),
      }))
      .sort((a, b) => (b as any)[metric] - (a as any)[metric])
      .slice(0, limit);
    return { metric, min_spend: minSpend, results: scored };
  },
};

// JSON-schema definitions handed to the model.
export const toolSchemas: ToolSchema[] = [
  {
    name: 'get_data_range',
    description: 'Get the date range covered by the dataset and the current snapshot date ("today").',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_campaigns',
    description: 'List every campaign with its channel and funnel stage.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_metrics',
    description:
      'Filter performance rows and return aggregated metrics (spend, revenue, ROAS, CTR, CVR, CPA). ' +
      'Optionally group by channel, funnel_stage, campaign, or date (daily series). Dates are YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Inclusive start date, YYYY-MM-DD' },
        end_date: { type: 'string', description: 'Inclusive end date, YYYY-MM-DD' },
        channel: { type: 'string', description: 'e.g. Meta, Google, TikTok, Pinterest, Amazon' },
        funnel_stage: { type: 'string', enum: ['Prospecting', 'Retargeting'] },
        campaign_id: { type: 'string' },
        group_by: { type: 'string', enum: ['channel', 'funnel_stage', 'campaign', 'date', 'none'] },
      },
      required: [],
    },
  },
  {
    name: 'top_creatives',
    description: 'Rank creatives by a metric, gated on a minimum spend for significance.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['roas', 'revenue', 'conversions'] },
        min_spend: { type: 'number', description: 'Minimum spend to be eligible (default 500)' },
        limit: { type: 'number', description: 'How many to return (default 5)' },
      },
      required: [],
    },
  },
];

export function runTool(name: string, args: unknown): unknown {
  const fn = tools[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return fn(args ?? {});
  } catch (err) {
    return { error: `Tool ${name} threw: ${(err as Error).message}` };
  }
}
