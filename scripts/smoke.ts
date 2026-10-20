// Smoke test — run with: npm run smoke
// Verifies the tools + agent loop work in mock mode (no key), and quantifies
// the planted data bug by comparing buggy tool output vs. an independent
// ground-truth calculation.

import { perfRows, type PerfRow } from '../src/data/dataset';
import { tools, canonicalChannel } from '../src/agent/tools';
import { runAgent } from '../src/agent/agent';
import { mockProvider } from '../src/agent/provider';
import type { AgentEvent } from '../src/agent/types';

function section(t: string) {
  console.log('\n' + '─'.repeat(64) + '\n' + t + '\n' + '─'.repeat(64));
}

// Independent, KNOWN-CORRECT June aggregation for a channel (or all).
function correctJune(channel?: string) {
  const rows = perfRows.filter((r) => {
    const inJune = r.date >= '2026-06-01' && r.date <= '2026-06-30'; // inclusive both ends
    const chOk = !channel || canonicalChannel(r.channel) === channel;
    return inJune && chOk;
  });
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  return {
    rows: rows.length,
    spend: Math.round(spend),
    revenue: Math.round(revenue),
    roas: +(revenue / spend).toFixed(2), // blended = total revenue / total spend
  };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

async function main() {
  section('1. Tool output vs. ground truth (June, all channels)');
  const buggy = tools.query_metrics({ start_date: '2026-06-01', end_date: '2026-06-30' }) as any;
  const truth = correctJune();
  console.log('buggy tool :', buggy.overall);
  console.log('ground truth:', truth);
  console.log('row count   buggy=%d truth=%d  (off-by-one drops the start date)', buggy.overall.rows, truth.rows);
  console.log('ROAS        buggy=%s truth=%s  (mean-of-ratios vs blended)', buggy.overall.roas, truth.roas);

  section('2. Single-tool query terminates with an answer (mock mode)');
  const single = await collect(runAgent(mockProvider, [{ role: 'user', content: 'What was our blended ROAS in June?' }]));
  const types1 = single.map((e) => e.type);
  const answer1 = single.find((e) => e.type === 'assistant_message') as any;
  console.log('event types:', types1.join(' → '));
  console.log('final answer:', answer1?.content?.slice(0, 120));
  console.assert(types1.includes('assistant_message'), 'FAIL: no final answer for single-tool query');
  console.assert(types1.filter((t) => t === 'tool_call').length === 1, 'expected exactly 1 tool_call');

  section('3. Compound query exposes the loop bug (should loop, then bail — bounded)');
  const compound = await collect(runAgent(mockProvider, [{ role: 'user', content: 'Compare Meta and Google for last month' }]));
  const toolCalls = compound.filter((e) => e.type === 'tool_call').length;
  const done = compound.filter((e) => e.type === 'done').length;
  const finalC = compound.find((e) => e.type === 'assistant_message') as any;
  console.log('tool_call events:', toolCalls, '(the agent only executes the FIRST of 2 requested calls each round → repeats)');
  console.log('terminated cleanly:', done === 1);
  console.log('final message:', finalC?.content?.slice(0, 160));
  console.assert(done === 1, 'FAIL: compound query did not terminate');
  console.assert(toolCalls > 1, 'expected the loop to repeat the tool call (bug present)');

  section('DONE');
  console.log('If you see this line, mock mode runs end-to-end with no key.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
