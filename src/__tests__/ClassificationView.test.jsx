import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_OPTIONS,
  classificationCategoryId,
  classificationTeachingMoment,
  classifyHint,
} from '../views/ClassificationView.jsx';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };
const SURU = { dict: 'する', reading: 'する', meaning: 'to do', group: 'suru' };
const KURU = { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' };
const II = {
  dict: 'いい',
  reading: 'いい',
  meaning: 'good',
  group: 'i-adjective',
  irregular: true,
};

describe('classification teaching moments', () => {
  it('teaches 食べる as ichidan drop-る', () => {
    const moment = classificationTeachingMoment(TABERU);

    expect(moment.label).toBe('ichidan: drop る');
    expect(moment.clue).toContain('drops');
    expect(moment.example).toBe('食べる -> 食べない');
    expect(moment.masuDiagnostic).toMatchObject({
      politeSurface: '食べます',
      kind: 'stem-kept',
    });
    expect(classifyHint(TABERU)).toContain('also called る-verb');
    expect(classifyHint(TABERU)).toContain('食べる -> 食べます');
  });

  it('teaches 書く as godan row-shift', () => {
    const moment = classificationTeachingMoment(KAKU);

    expect(moment.label).toBe('godan: row-shift');
    expect(moment.clue).toContain('final kana く');
    expect(moment.example).toBe('書く -> 書かない');
  });

  it('calls out common godan る-ending exceptions', () => {
    expect(classificationTeachingMoment(KAERU).trap).toContain('帰る, 入る, 走る, and 切る');
    expect(classificationTeachingMoment(HASHIRU).clue).toContain('still godan');
    expect(classificationTeachingMoment(KAERU).masuDiagnostic).toMatchObject({
      politeSurface: '帰ります',
      kind: 'ri-shift',
    });
    expect(classifyHint(HASHIRU)).toContain('走る -> 走ります');
  });

  it('uses one learner-facing irregular category', () => {
    expect(CLASSIFY_OPTIONS.map((option) => option.id)).toEqual([
      'ichidan',
      'godan',
      'irregular',
      'i-adjective',
      'na-adjective',
    ]);
    expect(classificationCategoryId(SURU)).toBe('irregular');
    expect(classificationCategoryId(KURU)).toBe('irregular');
    expect(classificationCategoryId(II)).toBe('irregular');

    expect(classificationTeachingMoment(SURU)).toMatchObject({
      label: 'irregular',
      aliasText: expect.stringContaining('する'),
    });
    expect(classificationTeachingMoment(KURU)).toMatchObject({
      label: 'irregular',
      aliasText: expect.stringContaining('来る'),
    });
    expect(classificationTeachingMoment(II)).toMatchObject({
      label: 'irregular',
      aliasText: expect.stringContaining('いい'),
    });
  });
});
