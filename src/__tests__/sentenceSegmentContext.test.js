import { describe, expect, it } from 'vitest';
import { deriveSentenceSegments } from '../../scripts/import-sentence-library.js';

describe('reviewed full-context furigana', () => {
  it('uses domestic-laundry and standalone-paper readings from real tokenizer output', async () => {
    const laundry = await deriveSentenceSegments('洗濯物が乾いていない。', '乾いていない');
    expect(laundry).toContainEqual({ t: '洗濯物', r: 'せんたくもの' });
    expect(laundry?.filter((segment) => 'w' in segment)).toEqual([{ w: true }]);
    const white = await deriveSentenceSegments('この白い紙について話した。', '白い');
    const thin = await deriveSentenceSegments('この薄い紙について話した。', '薄い');
    expect(white).toContainEqual({ t: '紙', r: 'かみ' });
    expect(thin).toContainEqual({ t: '紙', r: 'かみ' });
  }, 15000);

  it('keeps compound readings and the reviewed chef context separate from target readings', async () => {
    const letter = await deriveSentenceSegments('私は手紙を白く塗る。', '白く');
    expect(letter).toContainEqual({ t: '手紙', r: 'てがみ' });
    const chef = await deriveSentenceSegments(
      'この料理は有名な料理人によって作られる。',
      '作られる',
    );
    expect(chef).toContainEqual({ t: '料理人', r: 'りょうりにん' });
    expect(chef?.map((segment) => ('w' in segment ? '{w}' : segment.t)).join('')).toBe(
      'この料理は有名な料理人によって{w}。',
    );
  });
});
