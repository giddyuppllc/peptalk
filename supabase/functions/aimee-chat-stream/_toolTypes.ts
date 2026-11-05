/**
 * The tool-definition shape, on its own so _tools.ts imports no Deno code and
 * the app's tests can run the real executors (src/lib/__tests__/aimeeToolRoundTrip.test.ts).
 */
export interface GrokTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
