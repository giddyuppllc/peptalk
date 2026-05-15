/**
 * Anthropic Claude wrapper for Aimee.
 *
 * We talk to the Messages API directly (rather than importing the SDK) so we
 * have full control over the streaming SSE wire format and so we don't add
 * an extra Deno→npm cold-start cost. Anthropic's HTTP API is small enough
 * to call directly.
 *
 * Model: Claude Sonnet 4.6 — current best price/perf for contextual chat.
 * Override with the ANTHROPIC_MODEL secret for A/B (e.g. test Opus on a
 * cohort) without redeploying.
 *
 * Costs are computed from the `usage` block on the final SSE event so we
 * never have to estimate. Stored in microcents (1 USD = 100,000,000 mc).
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_BASE_URL = Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

// Pricing as of 2026-05. Numbers in microcents per token to avoid floats.
// Sonnet 4.6: $3.00 / 1M input, $15.00 / 1M output.
// 1 USD = 100,000,000 mc. Per token: $3/1M = 300mc; $15/1M = 1500mc.
// If a different model is configured, the env-driven overrides below win.
const INPUT_MICROCENTS_PER_TOKEN = Number(
  Deno.env.get('ANTHROPIC_INPUT_MC_PER_TOKEN') ?? 300,
);
const OUTPUT_MICROCENTS_PER_TOKEN = Number(
  Deno.env.get('ANTHROPIC_OUTPUT_MC_PER_TOKEN') ?? 1500,
);

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface AnthropicStreamEvent {
  /** SSE event type, e.g. 'content_block_delta', 'message_stop'. */
  type: string;
  /** Original event payload. */
  data: Record<string, unknown>;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export function tokensToMicrocents(usage: AnthropicUsage): number {
  return (
    usage.input_tokens * INPUT_MICROCENTS_PER_TOKEN +
    usage.output_tokens * OUTPUT_MICROCENTS_PER_TOKEN
  );
}

/**
 * Stream a Claude Messages API response. Yields parsed SSE events. The caller
 * decides how to forward them to the client (we forward raw to the RN app).
 *
 * Throws on HTTP-level failure. The caller should map errors to 502.
 */
export async function* streamAnthropic(args: {
  system: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<AnthropicStreamEvent, void, unknown> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    temperature: args.temperature ?? 0.7,
    stream: true,
    system: args.system,
    messages: args.messages,
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
  }

  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  // Parse the SSE stream. Anthropic emits lines like:
  //   event: content_block_delta
  //   data: {"type":"content_block_delta","index":0,"delta":{...}}
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines.
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf('\n\n');

      let eventType = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLine += line.slice(6);
      }
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine);
        yield { type: eventType, data: parsed };
      } catch {
        // Skip unparseable events rather than crash the stream.
      }
    }
  }
}

/**
 * Non-streaming convenience for tool-call follow-up requests where we already
 * have the full text and just need a one-shot result.
 */
export async function completeAnthropic(args: {
  system: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{
  content: Array<{ type: string; text?: string; name?: string; input?: unknown; id?: string }>;
  usage: AnthropicUsage;
  stop_reason: string;
}> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    temperature: args.temperature ?? 0.7,
    system: args.system,
    messages: args.messages,
  };
  if (args.tools && args.tools.length > 0) body.tools = args.tools;

  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
  const json = await res.json();
  return {
    content: json.content ?? [],
    usage: json.usage ?? { input_tokens: 0, output_tokens: 0 },
    stop_reason: json.stop_reason ?? 'end_turn',
  };
}
