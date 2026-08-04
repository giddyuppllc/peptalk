/** Harness smoke test — proves jest-expo runs before the real suites. */
describe('jest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
