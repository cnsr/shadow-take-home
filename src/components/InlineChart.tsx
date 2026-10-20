import { Bar, BarChart, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { TraceStep } from './Message';

type Metric = 'spend' | 'revenue' | 'roas' | 'conversions' | 'cpa' | 'ctr' | 'cvr' | 'clicks' | 'impressions';
type Point = { label: string; value: number; rows: number };
type Source = { id: string; name: string; args: unknown; rows: number };
type Chart = { kind: 'bar' | 'line'; metric: Metric; points: Point[]; sources: Source[] };

// Pick the metric the question asks about. More specific phrases come first:
// "return on ad spend" contains "spend", "conversion rate" contains "conversion".
function pickMetric(question: string, fallback: Metric): Metric {
  const q = question.toLowerCase();
  if (/\broas\b|return on ad spend/.test(q)) return 'roas';
  if (/\bcpa\b|cost per (acquisition|conversion)/.test(q)) return 'cpa';
  if (/\bctr\b|click[- ]through/.test(q)) return 'ctr';
  if (/\bcvr\b|conversion rate/.test(q)) return 'cvr';
  if (/\bconversions?\b|\borders\b/.test(q)) return 'conversions';
  if (/\brevenue\b|\bsales\b/.test(q)) return 'revenue';
  if (/\bspen[dt]\b|\bcost\b|\bbudget\b/.test(q)) return 'spend';
  if (/\bclicks?\b/.test(q)) return 'clicks';
  if (/\bimpressions?\b/.test(q)) return 'impressions';
  return fallback;
}

// Derive a chart from tool results: daily series -> line; grouped or parallel
// single-segment queries -> bar. Returns null when nothing is chartable.
// Each chart carries the tool calls and row counts it was built from.
export function chartFromTrace(steps: TraceStep[], question: string): Chart | null {
  const done = steps.filter((s) => s.status === 'done').map((s) => ({ step: s, r: s.result as any }));
  const source = (step: TraceStep, rows: number): Source => ({ id: step.id, name: step.name, args: step.args, rows });
  const sumRows = (groups: any[]) => groups.reduce((a, g) => a + g.metrics.rows, 0);

  const series = done.find(({ r }) => r?.group_by === 'date' && r.groups?.length > 1);
  if (series) {
    const { step, r } = series;
    const metric = pickMetric(question, 'revenue');
    return {
      kind: 'line',
      metric,
      points: r.groups.map((g: any) => ({ label: g.key, value: g.metrics[metric], rows: g.metrics.rows })),
      sources: [source(step, sumRows(r.groups))],
    };
  }

  const metric = pickMetric(question, 'roas');

  const grouped = done.find(({ r }) => r?.groups?.length > 1);
  if (grouped) {
    const { step, r } = grouped;
    return {
      kind: 'bar',
      metric,
      points: r.groups.map((g: any) => ({ label: g.key, value: g.metrics[metric], rows: g.metrics.rows })),
      sources: [source(step, sumRows(r.groups))],
    };
  }

  const overalls = done.filter(({ r }) => r?.overall);
  if (overalls.length >= 2) {
    return {
      kind: 'bar',
      metric,
      points: overalls.map(({ r }) => ({
        label: r.filter?.channel ?? r.filter?.funnel_stage ?? 'segment',
        value: r.overall[metric],
        rows: r.overall.rows,
      })),
      sources: overalls.map(({ step, r }) => source(step, r.overall.rows)),
    };
  }

  return null;
}

const LABELS: Record<Metric, string> = {
  spend: 'Spend',
  revenue: 'Revenue',
  roas: 'ROAS',
  conversions: 'Conversions',
  cpa: 'CPA',
  ctr: 'CTR',
  cvr: 'CVR',
  clicks: 'Clicks',
  impressions: 'Impressions',
};

const MONEY = new Set<Metric>(['spend', 'revenue', 'cpa']);
const RATIOS = new Set<Metric>(['roas', 'ctr', 'cvr']);

const fmt = (metric: Metric, v: number) =>
  metric === 'roas' ? `${v}x`
  : metric === 'ctr' || metric === 'cvr' ? `${v}%`
  : MONEY.has(metric) ? (Math.abs(v) >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`)
  : v.toLocaleString();

export function InlineChart({ chart }: { chart: Chart }) {
  const config = { value: { label: LABELS[chart.metric], color: 'var(--chart-1)' } } satisfies ChartConfig;
  const totalRows = chart.sources.reduce((a, s) => a + s.rows, 0);

  // Y-axis bounds for line charts: min rounded down, max rounded up, to the
  // nearest thousand (or whole unit for ratios like ROAS and CTR).
  const step = RATIOS.has(chart.metric) ? 1 : 1000;
  const values = chart.points.map((p) => p.value);
  const yMin = Math.floor(Math.min(...values) / step) * step;
  const yMax = Math.max(Math.ceil(Math.max(...values) / step) * step, yMin + step);

  // Tooltip shows the value plus the number of rows behind it.
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          formatter={(value, _name, item) =>
            `${config.value.label}: ${fmt(chart.metric, Number(value))} (${(item.payload as Point).rows} rows)`
          }
        />
      }
    />
  );

  return (
    <figure>
      <ChartContainer config={config} className="h-25 w-full max-w-md">
        {chart.kind === 'bar' ? (
          <BarChart data={chart.points} layout="vertical" margin={{ right: 40 }}>
            <XAxis type="number" dataKey="value" hide />
            <YAxis type="category" dataKey="label" width={80} tickLine={false} axisLine={false} interval={0} />
            {tooltip}
            <Bar dataKey="value" fill="var(--color-value)" radius={4}>
              <LabelList dataKey="value" position="right" formatter={(v) => fmt(chart.metric, Number(v))} />
            </Bar>
          </BarChart>
        ) : (
          <LineChart data={chart.points} margin={{ left: 8, right: 8 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
            <YAxis
              domain={[yMin, yMax]}
              ticks={[yMin, yMax]}
              tickFormatter={(v: number) => fmt(chart.metric, v)}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            {tooltip}
            <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ChartContainer>
      <figcaption className="text-tiny text-muted-foreground">
        {LABELS[chart.metric]} · source: {totalRows} rows from {chart.sources.length} tool call{chart.sources.length === 1 ? '' : 's'}
        <ul>
          {chart.sources.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <code>{s.name}</code> ({s.id}) {JSON.stringify(s.args)} · {s.rows} rows
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
