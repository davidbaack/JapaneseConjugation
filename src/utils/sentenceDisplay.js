import { DEFAULT_PREFS } from '../data/defaults.js';
import { resolveDisplayScripts } from './display.js';
import { kanaToRomaji } from './romaji.js';

const KANJI_RE = /[\u3400-\u9fff]/u;

const SENTENCE_READING_ENTRIES = [
  ['天気がいい日', 'てんきがいいひ'],
  ['練習しましょう', 'れんしゅうしましょう'],
  ['練習すれば', 'れんしゅうすれば'],
  ['練習すると', 'れんしゅうすると'],
  ['休み時間', 'やすみじかん'],
  ['休みの日', 'やすみのひ'],
  ['雨の日', 'あめのひ'],
  ['日曜日', 'にちようび'],
  ['一時間', 'いちじかん'],
  ['朝ごはん', 'あさごはん'],
  ['疲れている', 'つかれている'],
  ['忙しくて', 'いそがしくて'],
  ['強かった', 'つよかった'],
  ['終わったら', 'おわったら'],
  ['分かりました', 'わかりました'],
  ['聞きながら', 'ききながら'],
  ['忘れないで', 'わすれないで'],
  ['出かける', 'でかける'],
  ['休みます', 'やすみます'],
  ['休んで', 'やすんで'],
  ['行きます', 'いきます'],
  ['曲がります', 'まがります'],
  ['見せます', 'みせます'],
  ['受けます', 'うけます'],
  ['話しました', 'はなしました'],
  ['片付ける', 'かたづける'],
  ['住みやすい', 'すみやすい'],
  ['使って', 'つかって'],
  ['合わせて', 'あわせて'],
  ['急いで', 'いそいで'],
  ['寝ました', 'ねました'],
  ['出ました', 'でました'],
  ['昼休み', 'ひるやすみ'],
  ['駅前', 'えきまえ'],
  ['週末', 'しゅうまつ'],
  ['家族', 'かぞく'],
  ['昨日', 'きのう'],
  ['朝早く', 'あさはやく'],
  ['午後', 'ごご'],
  ['友達', 'ともだち'],
  ['授業', 'じゅぎょう'],
  ['図書館', 'としょかん'],
  ['先生', 'せんせい'],
  ['電話', 'でんわ'],
  ['今日', 'きょう'],
  ['時間', 'じかん'],
  ['平日', 'へいじつ'],
  ['今夜', 'こんや'],
  ['疲れて', 'つかれて'],
  ['教科', 'きょうか'],
  ['忙しい', 'いそがしい'],
  ['長く', 'ながく'],
  ['先週', 'せんしゅう'],
  ['一度', 'いちど'],
  ['約束', 'やくそく'],
  ['お腹', 'おなか'],
  ['痛くて', 'いたくて'],
  ['毎朝', 'まいあさ'],
  ['毎日', 'まいにち'],
  ['学校', 'がっこう'],
  ['天気', 'てんき'],
  ['公園', 'こうえん'],
  ['毎晩', 'まいばん'],
  ['質問', 'しつもん'],
  ['一回', 'いっかい'],
  ['明日', 'あした'],
  ['音楽', 'おんがく'],
  ['少し', 'すこし'],
  ['予定', 'よてい'],
  ['練習', 'れんしゅう'],
  ['上手', 'じょうず'],
  ['一人', 'ひとり'],
  ['宿題', 'しゅくだい'],
  ['楽しい', 'たのしい'],
  ['新しい', 'あたらしい'],
  ['場所', 'ばしょ'],
  ['最近', 'さいきん'],
  ['文法', 'ぶんぽう'],
  ['旅行', 'りょこう'],
  ['思った', 'おもった'],
  ['映画', 'えいが'],
  ['電車', 'でんしゃ'],
  ['近く', 'ちかく'],
  ['本当に', 'ほんとうに'],
  ['問題', 'もんだい'],
  ['説明', 'せつめい'],
  ['十分', 'じゅうぶん'],
  ['答え', 'こたえ'],
  ['勉強', 'べんきょう'],
  ['料理', 'りょうり'],
  ['自然', 'しぜん'],
  ['流れ', 'ながれ'],
  ['会話', 'かいわ'],
  ['状態', 'じょうたい'],
  ['空欄', 'くうらん'],
  ['会議', 'かいぎ'],
  ['名前', 'なまえ'],
  ['知らない', 'しらない'],
  ['学生', 'がくせい'],
  ['先に', 'さきに'],
  ['子ども', 'こども'],
  ['先輩', 'せんぱい'],
  ['後輩', 'こうはい'],
  ['駅', 'えき'],
  ['店', 'みせ'],
  ['朝', 'あさ'],
  ['家', 'いえ'],
  ['夜', 'よる'],
  ['机', 'つくえ'],
  ['母', 'はは'],
  ['前', 'まえ'],
  ['部屋', 'へや'],
  ['雨', 'あめ'],
  ['外', 'そと'],
  ['何', 'なに'],
  ['次', 'つぎ'],
  ['右', 'みぎ'],
  ['今', 'いま'],
  ['道', 'みち'],
  ['町', 'まち'],
  ['字', 'じ'],
  ['空', 'そら'],
  ['春', 'はる'],
  ['中', 'なか'],
  ['形', 'かたち'],
  ['人', 'ひと'],
];

const SORTED_SENTENCE_READING_ENTRIES = [...SENTENCE_READING_ENTRIES].sort(
  ([left], [right]) => Array.from(right).length - Array.from(left).length,
);

export function sentenceReadingParts(sentence) {
  const text = String(sentence || '');
  const parts = [];
  let index = 0;

  while (index < text.length) {
    const match = SORTED_SENTENCE_READING_ENTRIES.find(([surface]) =>
      text.startsWith(surface, index),
    );

    if (match) {
      const [surface, ruby] = match;
      parts.push({ text: surface, ruby });
      index += surface.length;
      continue;
    }

    const [char] = Array.from(text.slice(index));
    parts.push({ text: char, ruby: '' });
    index += char.length;
  }

  return parts;
}

function sentenceKana(parts) {
  return parts.map((part) => part.ruby || part.text).join('');
}

export function sentenceDisplay(sentence, prefs = DEFAULT_PREFS) {
  const ds = resolveDisplayScripts(prefs);
  const parts = sentenceReadingParts(sentence);
  const kana = sentenceKana(parts);
  const rom = kanaToRomaji(kana);

  if (ds.romaji && !ds.kanji && !ds.kana) {
    return { main: rom, sub: '', lang: 'en' };
  }

  if (!ds.kanji && ds.kana) {
    return {
      main: kana,
      sub: ds.romaji && kana !== rom ? rom : '',
      lang: 'ja',
    };
  }

  const rubyParts =
    !!prefs.furigana && ds.kanji && ds.kana
      ? parts.map((part) =>
          part.ruby && KANJI_RE.test(part.text) && part.text !== part.ruby
            ? { text: part.text, ruby: part.ruby }
            : { text: part.text },
        )
      : null;
  const sub = [];
  if (ds.kana && !rubyParts && sentence !== kana) sub.push(kana);
  if (ds.romaji && sentence !== rom) sub.push(rom);

  return {
    main: String(sentence || ''),
    sub: sub.join(' / '),
    parts: rubyParts,
    lang: 'ja',
  };
}
