// Curated build-time repairs for the exact imported teaching identities reviewed
// on 2026-10-17. This module is deliberately absent from the browser import graph.
// A homograph with a different reading or meaning does not inherit a repair.
const keyFor = (word) => [word.group, word.dict, word.reading, word.meaning || ''].join('\u0000');
const sourceKeyFor = (word) => [word.dict, word.reading, word.meaning || ''].join('\u0000');

const repairs = new Map();
const sourceRepairs = new Map();
function repair(group, dict, reading, meaning, target) {
  repairs.set(keyFor({ group, dict, reading, meaning }), target);
  sourceRepairs.set(sourceKeyFor({ dict, reading, meaning }), target ? { group, ...target } : null);
}

repair('godan', '弾く', 'はじく', 'to play (piano, guitar)', { reading: 'ひく' });
repair('godan', '打つ', 'ぶつ', 'to hit, to strike', { reading: 'うつ' });
repair('godan', '叩く', 'はたく', 'to strike, to clap, to dust, to beat', { reading: 'たたく' });
repair('ichidan', '止める', 'とどめる', 'to end, to stop, to cease, to resign', {
  reading: 'とめる',
});
repair('ichidan', '居る', 'いる', '(humble) to be (animate), to exist', {
  meaning: 'to be (animate), to exist',
});
repair('ichidan', '過ぎる', 'すぎる', 'too much ~', { meaning: 'to pass, to elapse' });
repair('i-adjective', '不味い', 'まずい', 'Unpleasent, Unappetising', {
  meaning: 'Unpleasant, Unappetising',
});
repair('na-adjective', '勝ち気', 'かちき', 'Competetive, Unyielding', {
  meaning: 'Competitive, Unyielding',
});
repair('godan', '助ける', 'たすける', 'To rescue', { group: 'ichidan' });
repair('godan', '留める', 'とめる', 'To pin', { group: 'ichidan' });
repair('godan', 'はねる', 'はねる', 'Hit (by car)', { group: 'ichidan' });
repair('suru', '為るする', 'する', 'to do, to attempt', { dict: 'する' });
repair('godan', 'あせる', 'あせる', 'to fade, to discolor', { group: 'ichidan' });
repair('godan', '卸す', 'おろす', 'to sell wholesale, grated (vegetables)', {
  meaning: 'to sell wholesale, to grate (vegetables)',
});
repair('ichidan', '済ませる', 'すませる', 'to be finished', {
  meaning: 'to finish, to get done',
});
repair('ichidan', '隔てる', 'へだてる', 'to be shut out', {
  meaning: 'to separate, to divide',
});
repair('ichidan', '交ぜる', 'まぜる', 'to be mixed, to be blended with', {
  meaning: 'to mix, to blend',
});
repair('godan', '湧く', 'わく', 'to boil, to grow hot', {
  meaning: 'to well up, to spring up, to arise',
});
repair('godan', '導く', 'みちびく', 'to be guided, to be shown', {
  meaning: 'to guide, to lead, to show',
});
repair('i-adjective', 'しょうがない', 'しょうがない', 'It is not worth ~', {
  meaning: 'cannot be helped, unavoidable',
});
repair('na-adjective', 'そっくり', 'そっくり', 'the splitting image of; entirely', {
  meaning: 'the spitting image of; entirely',
});
repair('i-adjective', '気持ちが悪い', 'きもちがわるいい', 'Unpleasent, Disgusting', {
  reading: 'きもちがわるい',
  meaning: 'Unpleasant, Disgusting',
});
repair('ichidan', '付ける', 'つける', 'to attach, to join, to add', {
  meaning: 'to attach, to join, to add; to turn on',
});
repair('suru', '失敗する', 'しっぱいする', 'Fail (an examination）', {
  meaning: 'to fail',
});
repair('godan', '庇う', 'かばう', 'to protect someone, to&nbsp;&nbsp;cover up for someone', {
  meaning: 'to protect someone, to cover up for someone',
});
repair('godan', 'くるむ', 'くるむ', 'to be enveloped by, to wrap up', {
  meaning: 'to wrap, to envelop',
});
repair('godan', 'やる', 'やる', 'to do; to give (to pets, parents, siblings, etc.)', {
  meaning: 'to do; to give (casually, to someone of equal or lower status)',
});
repair('godan', '現す', 'あらわす', 'to show, to appear, to reveal', {
  meaning: 'to show, to reveal, to express',
});
repair('godan', '越す', 'こす', 'to go over (e.g., with audience)', {
  meaning: 'to cross over, to go across, to exceed',
});
repair(
  'ichidan',
  '暖める',
  'あたためる',
  'to warm (up to someone/something), to heat (up to someone/something)',
  {
    meaning: 'to warm, to heat',
  },
);
for (const [group, dict, reading, meaning, targetMeaning] of [
  ['na-adjective', '幸い', 'さいわい', 'fortunately; luckily', 'fortunate; fortunately, luckily'],
  ['na-adjective', '案外', 'あんがい', 'unexpectedly', 'unexpected; unexpectedly'],
  ['i-adjective', 'だらしない', 'だらしない', 'slovenly, loose, a slut', 'slovenly, sloppy, loose'],
  [
    'na-adjective',
    '必死',
    'ひっし',
    'desperation, frantic, inevitable result',
    'desperate, frantic; desperation, certain death',
  ],
  [
    'na-adjective',
    '陽気',
    'ようき',
    'season, weather, cheerfulness',
    'cheerful; cheerfulness, season, weather',
  ],
  [
    'na-adjective',
    '幼稚',
    'ようち',
    'infancy, childish, infantile',
    'childish, infantile; infancy',
  ],
  [
    'na-adjective',
    '勝手',
    'かって',
    "kitchen; one's way, selfishness",
    "selfish, arbitrary; kitchen, one's way, selfishness",
  ],
  [
    'na-adjective',
    '一筋',
    'ひとすじ',
    'a line, earnestly, blindly, straightforwardly',
    'devoted, single-minded; a line; earnestly, blindly, straightforwardly',
  ],
  ['na-adjective', 'ぺこぺこ', 'ぺこぺこ', 'fawn, be very hungry', 'very hungry; fawn'],
]) {
  repair(group, dict, reading, meaning, { meaning: targetMeaning });
}

for (const [group, dict, reading, meaning, targetDict] of [
  ['godan', '楽む', 'たのしむ', 'to enjoy', '楽しむ'],
  ['godan', '終る', 'おわる', 'to finish, to close', '終わる'],
  ['godan', '曲る', 'まがる', 'to turn, to bend', '曲がる'],
  ['godan', '落す', 'おとす', 'to drop, to lose', '落とす'],
  ['ichidan', '落る', 'おちる', 'to fall, to drop', '落ちる'],
  ['i-adjective', '堅', 'かたい', 'solid, hard, firm', '堅い'],
  ['godan', '浮ぶ', 'うかぶ', 'to float, to rise to surface, to come to mind', '浮かぶ'],
  ['ichidan', '押える', 'おさえる', 'to stop, to restrain, to press down', '押さえる'],
  ['godan', '落着く', 'おちつく', 'to calm down, to settle down', '落ち着く'],
  ['godan', '下す', 'おろす', 'to lower, to let go down', '下ろす'],
  ['godan', '代る', 'かわる', 'to take the place of, to relieve, to be substituted for', '代わる'],
  [
    'godan',
    '付合う',
    'つきあう',
    'to associate with, to keep company with, to get on with',
    '付き合う',
  ],
  ['godan', '吊す', 'つるす', 'to hang', '吊るす'],
  ['godan', '剥す', 'はがす', 'to tear off, to peel off, to rip off', '剥がす'],
  ['ichidan', '引受る', 'ひきうける', 'to undertake, to take up, to take over', '引き受ける'],
  ['godan', '振舞う', 'ふるまう', 'to behave, to conduct', '振る舞う'],
  ['godan', '交す', 'かわす', 'to exchange', '交わす'],
  ['godan', '損う', 'そこなう', 'to harm, to hurt', '損なう'],
  ['godan', '摩する', 'さする', 'to rub, to stroke', 'さする'],
  [
    'ichidan',
    '引下げる',
    'ひきさげる',
    'to pull down, to lower, to reduce, to withdraw',
    '引き下げる',
  ],
  ['godan', '引取る', 'ひきとる', 'to take back; to adopt; to leave', '引き取る'],
  ['godan', '割込む', 'わりこむ', 'to cut in, to disturb', '割り込む'],
  ['i-adjective', '情無い', 'なさけない', 'miserable, pitiable, shameful', '情けない'],
  ['i-adjective', '情深い', 'なさけぶかい', 'tender-hearted, compassionate', '情け深い'],
  ['i-adjective', '馴々しい', 'なれなれしい', 'familiar, make free with', '馴れ馴れしい'],
  ['i-adjective', '目覚しい', 'めざましい', 'brilliant, remarkable', '目覚ましい'],
]) {
  repair(group, dict, reading, meaning, { dict: targetDict });
}

for (const [group, dict, reading, meaning, targetReading] of [
  ['suru', 'あいさつする', '挨拶する', 'greet(ing)', 'あいさつする'],
  [
    'godan',
    'いただく',
    '頂く',
    '-- extra-modest expression for たべる and のむ; humble expression for もらう --',
    'いただく',
  ],
  ['godan', '学校に入る', '学校に入る', 'Enter school', 'がっこうにはいる'],
  ['i-adjective', 'うれしい', '嬉しい', 'to be happy; to be glad', 'うれしい'],
  ['na-adjective', 'いっぱい', '一杯', 'full, to the utmost', 'いっぱい'],
]) {
  repair(group, dict, reading, meaning, { reading: targetReading });
}

for (const [group, dict, reading, meaning, target] of [
  [
    'godan',
    'おっしゃう',
    'おっしゃう',
    'Say (respectful)',
    { dict: 'おっしゃる', reading: 'おっしゃる' },
  ],
  [
    'godan',
    '片つく',
    'かたつく',
    '[boxes] be put in order',
    { dict: '片付く', reading: 'かたづく' },
  ],
  [
    'godan',
    'くださう',
    'くださう',
    'Give (respectful equivalent of くれます）',
    { dict: 'くださる', reading: 'くださる' },
  ],
  ['godan', 'ござう', 'ござう', 'Be (polite of あります)', { dict: 'ござる', reading: 'ござる' }],
  [
    'godan',
    'ご覧にある',
    'ごらんにある',
    'See, Look at (respectful)',
    { dict: 'ご覧になる', reading: 'ごらんになる' },
  ],
  ['ichidan', 'し事をやめる', 'しごとをやめる', 'Retire', { dict: '仕事をやめる' }],
  [
    'suru',
    '失礼いたする',
    'しつれいいたする',
    'Good bye (humble of しつれいします）',
    { dict: '失礼いたす', reading: 'しつれいいたす', group: 'godan' },
  ],
  [
    'godan',
    'でござう',
    'でござう',
    'Be (polite of です)',
    { dict: 'でござる', reading: 'でござる' },
  ],
  ['godan', 'なさう', 'なさう', 'Do (respectful)', { dict: 'なさる', reading: 'なさる' }],
  [
    'godan',
    '荷物が落つ',
    'にもつがおつ',
    '[baggage] fall down',
    { dict: '荷物が落ちる', reading: 'にもつがおちる', group: 'ichidan' },
  ],
  [
    'ichidan',
    '迷惑掛ける',
    'まいわくかける',
    'Trouble, Annoy, Inconvenience',
    { dict: '迷惑を掛ける', reading: 'めいわくをかける' },
  ],
]) {
  repair(group, dict, reading, meaning, target);
}

// These exact source senses are auxiliary endings, adverbs, or nouns rather
// than independent words suitable for the app's full conjugation matrix.
// Excluding an imported sense does not declare every usage of the spelling invalid.
for (const [group, dict, reading, meaning] of [
  ['godan', 'がる', 'がる', 'feel'],
  ['godan', 'きる', 'きる', 'nevertheless, to carry through'],
  ['godan', 'だす', 'だす', 'to start doing ~'],
  ['godan', 'かく', 'かく', 'to humiliate oneself'],
  ['godan', 'しまう', 'しまう', 'to end up ~'],
  ['godan', '得る', 'うる', 'to get, to gain, to win'],
  ['godan', 'おめでとうござう', 'おめでとうござう', 'Congradulations'],
  ['godan', '知ってう', 'しってう', 'Know'],
  ['godan', '住んでう', 'すんでう', 'Live in a place'],
  ['godan', '楽しみにしてう', 'たのしみにしてう', 'Be looking forward to, be expecting'],
  ['godan', '似てう', 'にてう', 'Resemble'],
  [
    'godan',
    'していらっしゃう',
    'していらっしゃう',
    'Be doing (respectful equivalent of しています）',
  ],
  ['godan', '持ってく', 'もってく', 'Bring (Something)'],
  ['i-adjective', '辛い', 'づらい', 'hard to do ~'],
  ['i-adjective', 'くらい', 'くらい', 'approximate (quantity)'],
  ['i-adjective', 'にくい', 'にくい', 'difficult to do ~'],
  ['i-adjective', 'やすい', 'やすい', 'easy to do ~'],
  ['i-adjective', 'ぽい', 'ぽい', '~ish'],
  ['i-adjective', '営', 'えい', '~ run'],
  ['i-adjective', 'おおい', 'おおい', 'hey'],
  ['na-adjective', '余り', 'あまり', 'not very; surplus'],
  ['na-adjective', 'いかが', 'いかが', 'how, in what way'],
  ['na-adjective', '大人', 'おと', 'adult'],
  ['na-adjective', 'そう', 'そう', 'really, (is that) so; yes, right'],
  ['na-adjective', '多分', 'たぶん', 'perhaps, probably, maybe'],
  ['na-adjective', 'まだ', 'まだ', 'yet, still, besides'],
  ['na-adjective', '味', 'あじ', 'flavor, taste'],
  ['na-adjective', 'ずいぶん', 'ずいぶん', 'Pretty, very'],
  ['na-adjective', '随分', 'ずいぶん', 'extremely'],
  ['na-adjective', 'かっこう', '格好', 'appearance, manner, shape, form, posture'],
  ['na-adjective', '増し', '増し', '~increase'],
  ['na-adjective', '神', 'かみ', 'god'],
  ['na-adjective', '骨', 'ほね', 'bone'],
  ['na-adjective', '電波', 'でんぱ', 'electro-magnetic wave'],
  ['na-adjective', 'かび', 'かび', 'mold, mildew'],
  ['na-adjective', 'センチ', 'センチ', 'centimeter'],
  ['na-adjective', '通', 'つう', 'counter for letters'],
  ['na-adjective', 'もともと', 'もともと', 'Originally'],
  ['na-adjective', '元々', 'もともと', 'originally, by nature, from the start'],
  ['na-adjective', '未だ', 'いまだ', 'yet, still'],
  ['na-adjective', 'すぐ', 'すぐ', 'Immediately'],
  ['na-adjective', '現金', 'げんきん', 'cash'],
  ['na-adjective', 'あちこち', 'あちこち', 'here and there'],
  ['na-adjective', 'あちらこちら', 'あちらこちら', 'here and there'],
  ['na-adjective', 'あんまり', 'あんまり', 'not very, not much'],
  ['na-adjective', '機嫌', 'きげん', 'humor, temper, mood'],
  ['na-adjective', 'ご苦労様', 'ごくろうさま', 'Thank you for your had work'],
  ['na-adjective', '茶', 'ちゃ', 'tea'],
  ['na-adjective', '発明', 'はつめい', 'invention'],
  ['na-adjective', 'みたい', 'みたい', 'looks like ~'],
  ['na-adjective', '乙', 'おつ', '2nd in rank'],
  ['na-adjective', '始末', 'しまつ', 'disposal; cleaning up afterwards'],
  ['na-adjective', '粋', 'すい', 'essence'],
  ['na-adjective', 'ずるずる', 'ずるずる', 'dragging on, sound of sniffling'],
  ['na-adjective', 'ネガ', 'ネガ', '(photographic) negative'],
  ['na-adjective', '乾燥', 'かんそう', 'dry, arid, dehydrated'],
  ['na-adjective', '愚痴', 'ぐち', 'idle complaint, grumble'],
  ['na-adjective', '値打ち', 'ねうち', 'value, worth, price'],
  ['na-adjective', '感心', 'かんしん', 'admiration'],
  ['na-adjective', '順', 'じゅん', 'order, turn'],
  ['na-adjective', '罪', 'つみ', 'crime, fault, indiscretion'],
  ['na-adjective', '閉口', 'へいこう', 'shut mouth'],
  // The dictionary supports 大, but this beginner matrix does not teach its
  // marked/limited paradigm. 大きい remains the ordinary "big" practice word.
  ['na-adjective', '大', 'だい', 'big, great'],
]) {
  repair(group, dict, reading, meaning, null);
}

export function repairLexicalTeachingWord(word) {
  if (!word || !repairs.has(keyFor(word))) return word;
  const target = repairs.get(keyFor(word));
  if (!target) return null;
  const result = { ...word, ...target };
  if (result.reading !== word.reading) delete result.pitchAccent;
  return result;
}

// CSV inputs have no group yet. Apply the same exact curated source decisions
// before dictionary matching, including malformed kana-field repairs.
export function repairLexicalTeachingSource(source) {
  const key = sourceKeyFor(source);
  if (!sourceRepairs.has(key)) return source;
  const target = sourceRepairs.get(key);
  return target ? { ...source, ...target } : null;
}

export function repairLexicalTeachingRow(row) {
  const [dict, reading, meaning, group] = row;
  const word = repairLexicalTeachingWord({ dict, reading, meaning, group });
  if (!word) return null;
  if (
    word.dict === dict &&
    word.reading === reading &&
    word.meaning === meaning &&
    word.group === group
  )
    return row;
  const result = [word.dict, word.reading, word.meaning, word.group, ...row.slice(4)];
  if (word.reading !== reading && result.length > 9) result.length = 9;
  return result;
}
