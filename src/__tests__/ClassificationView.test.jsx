import { describe, expect, it } from 'vitest';
import { classificationTeachingMoment, classifyHint } from '../views/ClassificationView.jsx';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };

describe('classification teaching moments', () => {
  it('teaches 食べる as ichidan drop-る', () => {
    const moment = classificationTeachingMoment(TABERU);

    expect(moment.label).toBe('ichidan: drop る');
    expect(moment.clue).toContain('drops');
    expect(moment.example).toBe('食べる -> 食べない');
    expect(classifyHint(TABERU)).toContain('also called る-verb');
  });

  it('teaches 書く as godan row-shift', () => {
    const moment = classificationTeachingMoment(KAKU);

    expect(moment.label).toBe('godan: row-shift');
    expect(moment.clue).toContain('final kana く');
    expect(moment.example).toBe('書く -> 書かない');
  });

  it('calls out 帰る and 走る as godan る-ending exceptions', () => {
    expect(classificationTeachingMoment(KAERU).trap).toContain('帰る and 走る');
    expect(classificationTeachingMoment(HASHIRU).clue).toContain('still godan');
  });
});
