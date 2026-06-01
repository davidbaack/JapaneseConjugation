import { describe, expect, it } from 'vitest';
import { ruMasuDiagnostic } from '../utils/ruVerbDiagnostics.js';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const MIRU = { dict: '見る', reading: 'みる', meaning: 'to see', group: 'ichidan' };
const KIRU_WEAR = { dict: '着る', reading: 'きる', meaning: 'to wear', group: 'ichidan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };
const KIRU_CUT = { dict: '切る', reading: 'きる', meaning: 'to cut', group: 'godan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };

describe('ruMasuDiagnostic', () => {
  it('identifies true ichidan verbs by direct stem + ます', () => {
    expect(ruMasuDiagnostic(TABERU)).toMatchObject({
      kind: 'stem-kept',
      politeSurface: '食べます',
      contrast: 'That direct stem + ます pattern is ichidan.',
    });
    expect(ruMasuDiagnostic(MIRU)).toMatchObject({
      kind: 'stem-kept',
      politeSurface: '見ます',
    });
  });

  it('identifies godan る traps by the り + ます shift', () => {
    expect(ruMasuDiagnostic(KAERU)).toMatchObject({
      kind: 'ri-shift',
      politeSurface: '帰ります',
      contrast: 'That る -> り + ます pattern is godan.',
    });
    expect(ruMasuDiagnostic(HASHIRU)).toMatchObject({
      kind: 'ri-shift',
      politeSurface: '走ります',
    });
  });

  it('separates 切る from 着る despite the shared reading', () => {
    expect(ruMasuDiagnostic(KIRU_CUT)).toMatchObject({
      kind: 'ri-shift',
      politeSurface: '切ります',
    });
    expect(ruMasuDiagnostic(KIRU_WEAR)).toMatchObject({
      kind: 'stem-kept',
      politeSurface: '着ます',
    });
  });

  it('ignores verbs that do not end in る', () => {
    expect(ruMasuDiagnostic(KAKU)).toBeNull();
  });
});
