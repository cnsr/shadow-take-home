# Changes

src/components/Chat.tsx

- token handler: replaced in-place mutation of message state with an immutable update. The old code returned the same array reference, so React skipped re-renders and the answer only appeared once assistant_message arrived. Text now streams token by token.
- tool_call handler: clears message content when a tool call starts, so text streamed before a tool call doesn't stay in the bubble and get replaced abruptly by the final answer.

src/agent/agent.ts

- tool execution: runs every tool call in a turn instead of only toolCalls[0]. Previously parallel calls (e.g. "Compare Meta and Google") lost all but the first result, so the model re-requested the missing call until the step limit.

src/agent/tools.ts

- filterRows: fixed non-inclusive start date lookup.
- aggregate: ROAS is now total revenue / total spend. It was the unweighted mean of per-row ROAS, which overweighted small high-ROAS rows (June, all channels: 3.32x reported vs 2.76x actual).
- query_metrics: added group_by 'date' (daily series, sorted chronologically); added to the tool schema.

src/agent/provider.ts

- mock planTools: trend questions ("trend", "over time", "daily", "by day", "time series") request a daily series.

Inline charts

- src/components/InlineChart.tsx (new): derives a chart from tool results in the message trace. Daily series -> line (revenue); grouped results or 2+ parallel single-segment queries -> bar (ROAS). Caption lists source tool calls (name, id, args, row count); tooltip shows value and row count per point.
- src/components/Message.tsx: renders the chart in the assistant bubble once the message is done.
- Built with shadcn charts (Recharts). Setup: Tailwind 4 via @tailwindcss/vite, @/ path alias (vite.config.ts, tsconfig.json), shadcn init (components.json, src/lib/utils.ts, src/components/ui/chart.tsx, src/shadcn.css imported before styles.css).
- src/styles.css: renamed --accent, --radius, --radius-sm to --app-* to avoid clashing with shadcn variables.
- Dependencies, pinned exact: tailwindcss, @tailwindcss/vite, shadcn, cn, recharts, tw-animate-css, @fontsource-variable/geist. Unused init scaffolding (button.tsx, radix-ui, lucide-react, class-variance-authority) removed.
