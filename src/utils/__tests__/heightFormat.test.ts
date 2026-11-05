import { cmToFtIn, formatHeightBoth } from '../unitConversions';

describe('height ft/in', () => {
  it('never prints 12 inches', () => {
    for (let cm = 100; cm <= 230; cm += 0.1) {
      expect(cmToFtIn(cm).inRemainder).toBeLessThan(12);
    }
  });
  it('182.5 cm is 6\'0"', () => {
    expect(formatHeightBoth(182.5, 'cm')).toBe('183 cm (≈6\'0")');
  });
  it('170 cm is 5\'7"', () => {
    expect(cmToFtIn(170)).toEqual({ ft: 5, inRemainder: 7 });
  });
});
