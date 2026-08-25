/**
 * CJC-1295 with DAC vs no DAC — the protocol row was keyed to the wrong product.
 *
 * peptides.ts has three distinct products:
 *   cjc-1295             = "CJC-1295 (with DAC)"      ~week-long half-life, mg dosing
 *   cjc-1295-no-dac      = "CJC-1295 (No DAC)"
 *   cjc-1295-ipamorelin  = "CJC-1295 (No DAC) / Ipamorelin Blend"
 *
 * protocols.ts had ONE cjc-1295 row: the no-DAC Ipamorelin combo (100-300 mcg
 * nightly) keyed to `cjc-1295`. So a user who selected the WITH-DAC product was
 * shown no-DAC dosing, and doseSafety derived its ceiling (3x the protocol max)
 * from that row — 900 mcg. A correct 1 mg with-DAC dose was therefore flagged
 * unsafe, while the guard happily accepted a dose 10x too small for the product.
 *
 * A clinician flagged this in review ("1 mg – 2 mg … every 4-6 days due to DAC
 * extending the half life") and the app's own dosing table already agreed —
 * protocols.ts was the outlier.
 */
import { checkDoseSafety } from '../doseSafety';
import { getProtocolsByPeptide } from '../../data/protocols';

describe('CJC-1295 protocol keying', () => {
  it('gives the WITH-DAC product its own protocol, dosed in mg', () => {
    const protocols = getProtocolsByPeptide('cjc-1295');
    expect(protocols).toHaveLength(1);
    const [p] = protocols;
    expect(p.id).toBe('proto-cjc1295-dac');
    expect(p.typicalDose).toEqual({ min: 1, max: 2, unit: 'mg' });
    expect(p.frequencyLabel).toBe('Every 4-6 days');
  });

  it('keys the nightly combo to the blend, not to the with-DAC product', () => {
    const blend = getProtocolsByPeptide('cjc-1295-ipamorelin');
    expect(blend).toHaveLength(1);
    expect(blend[0].id).toBe('proto-cjc1295-ipa');
    expect(blend[0].typicalDose).toEqual({ min: 100, max: 300, unit: 'mcg' });
  });

  it('no longer flags a correct 1mg with-DAC dose as unsafe', () => {
    // This is THE regression. With the combo row keyed to `cjc-1295` the
    // ceiling was 3 x 300 mcg = 900 mcg, so 1 mg tripped the guard.
    expect(checkDoseSafety('cjc-1295', 1, 'mg').safe).toBe(true);
    expect(checkDoseSafety('cjc-1295', 2, 'mg').safe).toBe(true);
  });

  it('still catches a genuinely excessive with-DAC dose', () => {
    // The guard must not have been widened into uselessness: 3x the 2mg max
    // is 6mg, so 10mg is still caught.
    expect(checkDoseSafety('cjc-1295', 10, 'mg').safe).toBe(false);
  });

  it('still guards the nightly blend at microgram scale', () => {
    expect(checkDoseSafety('cjc-1295-ipamorelin', 200, 'mcg').safe).toBe(true);
    // 1mg is ~3.3x the 300mcg blend max — correct for with-DAC, wrong here.
    expect(checkDoseSafety('cjc-1295-ipamorelin', 1, 'mg').safe).toBe(false);
  });
});
