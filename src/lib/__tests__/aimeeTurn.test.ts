import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAimeeTurn, type TurnDeps } from '../aimeeTurn';

function deps(over: Partial<TurnDeps<string>> = {}) {
  const calls = { local: 0, legacy: 0, shown: [] as string[] };
  let output = false;
  const d: TurnDeps<string> = {
    aiAllowed: true,
    online: true,
    stream: async () => true,
    aiProducedOutput: () => output,
    abortStream: () => {},
    legacy: async () => {
      calls.legacy++;
      return 'backup reply';
    },
    showAiReply: (m) => calls.shown.push(m),
    local: () => {
      calls.local++;
    },
    streamCapMs: 200,
    legacyCapMs: 200,
    ...over,
  };
  return { d, calls, setOutput: (v: boolean) => (output = v) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the on-device bot never interferes with the AI', () => {
  // The turn never sees the message text, so chip, orb, dosing and navigation
  // prompts all take exactly this path. The screen test below pins that every
  // send path uses it.
  it('(a) AI reachable: the bot is never called, whatever the prompt', async () => {
    for (const prompt of ['What should I focus on tomorrow?', 'Last logged: retatrutide · 2.5 mg.', 'BPC-157 dose', 'open my calculator']) {
      const { d, calls } = deps({ stream: async () => prompt.length > 0 });
      expect(await runAimeeTurn(d)).toBe('stream');
      expect(calls).toMatchObject({ local: 0, legacy: 0 });
    }
  });

  it('(b) a slow but alive stream: no fallback while it is within its time', async () => {
    const { d, calls } = deps({
      stream: async () => {
        await wait(120);
        return true;
      },
    });
    expect(await runAimeeTurn(d)).toBe('stream');
    expect(calls.local).toBe(0);
    expect(calls.legacy).toBe(0);
  });

  it('(c) a partial reply then an error: the AI text is kept, nothing is added', async () => {
    const t = deps();
    t.d.stream = async () => {
      t.setOutput(true);
      throw new Error('connection dropped');
    };
    expect(await runAimeeTurn(t.d)).toBe('kept-partial');
    expect(t.calls).toMatchObject({ local: 0, legacy: 0, shown: [] });
  });

  it('(c) a partial reply then the stream cap: still kept, no backup, no bot', async () => {
    const t = deps({ streamCapMs: 50 });
    t.d.stream = async () => {
      t.setOutput(true);
      await wait(200);
      return true;
    };
    expect(await runAimeeTurn(t.d)).toBe('kept-partial');
    expect(t.calls).toMatchObject({ local: 0, legacy: 0 });
  });

  it('(d) a real outage: stream and backup both fail → the bot answers', async () => {
    const { d, calls } = deps({ stream: async () => false, legacy: async () => null });
    expect(await runAimeeTurn(d)).toBe('local');
    expect(calls.local).toBe(1);
  });

  it('(d) backup endpoint times out → the bot answers', async () => {
    const { d, calls } = deps({ stream: async () => false, legacy: () => wait(500).then(() => 'late'), legacyCapMs: 50 });
    expect(await runAimeeTurn(d)).toBe('local');
    expect(calls.local).toBe(1);
  });

  it('stream empty but backup answers → the backup reply, no bot', async () => {
    const { d, calls } = deps({ stream: async () => false });
    expect(await runAimeeTurn(d)).toBe('legacy');
    expect(calls).toMatchObject({ local: 0, shown: ['backup reply'] });
  });

  it('offline or no AI consent → the bot, without waiting on the network', async () => {
    for (const over of [{ online: false }, { aiAllowed: false }]) {
      let streamed = false;
      const { d, calls } = deps({ ...over, stream: async () => ((streamed = true), true) });
      expect(await runAimeeTurn(d)).toBe('local');
      expect(streamed).toBe(false);
      expect(calls.local).toBe(1);
    }
  });
});

describe('every send path on the chat screen goes through runAimeeTurn', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'app', '(tabs)', 'peptalk.tsx'), 'utf8');

  it('the local bot is only reachable from runAimeeTurn', () => {
    const calls = src.match(/generateLocalBotResponse\(/g) ?? [];
    const turns = src.match(/runAimeeTurn\(\{/g) ?? [];
    expect(turns.length).toBe(3); // typed message, chip/orb prefill, quick reply
    expect(calls.length).toBe(3);
    // Each local-bot call sits inside a `local:` callback.
    for (const m of src.matchAll(/generateLocalBotResponse\(/g)) {
      const before = src.slice(Math.max(0, m.index! - 400), m.index);
      expect(before).toMatch(/local:\s*\(\)\s*=>/);
    }
  });

  it('no keyword or intent check decides between the AI and the bot', () => {
    expect(src).not.toMatch(/matchAppPrompt|respondAppPrompt|INTENT_PROMPTS/);
  });
});
