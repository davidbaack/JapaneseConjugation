import { getTypeInfo } from '../data/conjugationTypes.js';
import { conjugateItem, isAdjective, surfaceFormFor, wordKey } from './conjugator.js';
import {
  cleanEnglishAction,
  gerund,
  normalizeSentenceBlankForTarget,
  pastParticiple,
  simplePast,
} from './display.js';

const BLANK = '[______]';

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickDeterministic(options, seed) {
  if (!options.length) return null;
  return options[hashString(seed) % options.length];
}

function meaningText(word) {
  return `${word?.meaning || ''} ${word?.dict || ''} ${word?.reading || ''}`.toLowerCase();
}

export function clozeContextBucket(word) {
  if (isAdjective(word)) return 'adjective-quality';
  const text = meaningText(word);
  if (/(eat|drink|cook|meal|food|buy|shopping|買|食|飲|料理)/.test(text)) return 'food';
  if (
    /(go|come|leave|exit|return|walk|run|swim|ride|arrive|enter|travel|行|来|帰|歩|走|泳|入|出)/.test(
      text,
    )
  )
    return 'movement';
  if (
    /(study|learn|teach|read|write|remember|practice|school|class|勉強|習|教|読|書|覚)/.test(text)
  )
    return 'study';
  if (/(speak|say|talk|listen|ask|hear|call|answer|phone|話|言|聞|答|呼|電話)/.test(text))
    return 'communication';
  if (
    /(wear|sleep|wake|open|close|wait|hold|use|make|play|clean|wash|work|着|寝|起|開|閉|待|持|使|作|遊|洗|働)/.test(
      text,
    )
  )
    return 'daily-action';
  return 'general';
}

function actionOf(word) {
  return cleanEnglishAction(String(word?.meaning || '').split('/')[0]);
}

// Motion/existence/change-of-state verbs that read as intransitive. Used only
// when the lexicon carries no JMdict transitivity (custom and starter words);
// lexicon words use the real `word.transitive` field instead.
const INTRANSITIVE_HINTS =
  /\b(go|come|return|arrive|depart|leave|exit|enter|fall|drop|rise|climb|happen|occur|appear|disappear|vanish|die|be born|sleep|wake|sit|stand|stay|remain|live|exist|cry|laugh|smile|run|walk|swim|fly|float|sink|grow|become|begin|start|end|finish|gather|change|move)\b/;

export function resolveTransitivity(word) {
  const declared = word?.transitive;
  if (declared === 'transitive' || declared === 'both') return 'transitive';
  if (declared === 'intransitive') return 'intransitive';
  return INTRANSITIVE_HINTS.test(String(word?.meaning || '').toLowerCase())
    ? 'intransitive'
    : 'transitive';
}

function isTransitiveWord(word) {
  return resolveTransitivity(word) === 'transitive';
}

// Conjugates the English action into the short verb phrase that drops into a
// frame's English gloss at the {b} slot. The surrounding sentence supplies any
// clause structure (let's…, if/when…, make/let…), so this stays a bare phrase.
function verbSlot(action, type, transitivity = 'transitive') {
  if (type.includes('passive')) {
    // Transitive: direct passive ("was bought"). Intransitive: the Japanese
    // suffering passive reads naturally as a simple past in English
    // ("a friend went home on me"), so avoid a broken past participle.
    return transitivity === 'intransitive' ? simplePast(action) : pastParticiple(action);
  }
  if (type.includes('causative')) return action;
  if (type.includes('imperative') || type.includes('command')) return action;
  if (type.includes('negative-te') || type.includes('negative-zu')) return gerund(action);
  switch (type) {
    case 'plain-past':
    case 'polite-past':
      return simplePast(action);
    case 'plain-negative':
    case 'polite-negative':
      return `don't ${action}`;
    case 'plain-past-negative':
    case 'polite-past-negative':
      return `didn't ${action}`;
    case 'desiderative':
      return `want to ${action}`;
    case 'desiderative-negative':
      return `don't want to ${action}`;
    case 'progressive':
      return gerund(action);
    default:
      // present, te-form, potential, volitional, conditional, and advanced
      // fallbacks — the frame text wraps the bare action with any grammar.
      return action;
  }
}

function weaveSlot(word, type) {
  if (isAdjective(word)) return word?.meaning || 'that way';
  return verbSlot(actionOf(word), type, resolveTransitivity(word));
}

const CUES = {
  'plain-past': 'Plain past marks a completed action with ～た or ～だ.',
  'plain-negative': 'Plain negative uses ～ない to say the action does not happen.',
  'plain-past-negative': 'Plain past negative uses ～なかった for an action that did not happen.',
  'polite-present': 'Polite present uses ～ます for habitual or future actions.',
  'polite-past': 'Polite past uses ～ました for completed actions in polite speech.',
  'polite-negative': 'Polite negative uses ～ません to say the action does not happen politely.',
  'polite-past-negative':
    'Polite past negative uses ～ませんでした for did-not-do in polite speech.',
  'te-form': 'Te-form links actions or attaches helper patterns after the verb.',
  potential: 'Potential form expresses ability; the thing you can do often takes が.',
  'potential-negative': 'Potential negative says someone cannot do the action.',
  volitional: 'Volitional form proposes a shared action or states an intention.',
  'polite-volitional': 'Polite volitional uses ～ましょう to suggest doing something together.',
  'conditional-tara': 'たら sets up an if/when condition based on the completed form.',
  'conditional-ba': 'ば sets up an if condition and focuses on the condition itself.',
  desiderative: 'Tai-form uses the stem before ます plus たい to say want to do.',
  'desiderative-negative': 'Tai negative uses ～たくない to say do not want to do.',
  progressive: 'Progressive uses te-form plus いる for an ongoing action or resulting state.',
  passive: 'Passive form marks receiving an action, often with the actor marked by に.',
  causative: 'Causative form means make or let someone do the action.',
  imperative: 'Imperative form gives a direct command and can sound abrupt.',
  'command-nasai': 'なさい gives a firm instruction built from the stem before ます.',
  'negative-te': 'ないで means without doing or tells someone not to do before another action.',
  'negative-request': 'ないでください is a polite request not to do something.',
  prohibition: 'Dictionary form plus な gives a strong do-not-do command.',
};

const ADJ_CUES = {
  'adj-plain-past': {
    i: 'い-adjective past changes final い to ～かった.',
    na: 'な-adjective past uses ～だった in plain speech.',
  },
  'adj-plain-negative': {
    i: 'い-adjective negative changes final い to ～くない.',
    na: 'な-adjective negative uses ～ではない or ～じゃない.',
  },
  'adj-plain-past-negative': {
    i: 'い-adjective past negative uses ～くなかった.',
    na: 'な-adjective past negative uses ～ではなかった.',
  },
  'adj-polite-present': {
    i: 'い-adjectives can add です for polite present.',
    na: 'な-adjective polite present uses ～です.',
  },
  'adj-polite-past': {
    i: 'い-adjective polite past is ～かったです.',
    na: 'な-adjective polite past is ～でした.',
  },
  'adj-polite-negative': {
    i: 'い-adjective polite negative is often ～くないです or ～くありません.',
    na: 'な-adjective polite negative uses ～ではありません.',
  },
  'adj-polite-past-negative': {
    i: 'い-adjective polite past negative is ～くなかったです.',
    na: 'な-adjective polite past negative uses ～ではありませんでした.',
  },
  'adj-te-form': {
    i: 'い-adjective te-form changes final い to ～くて.',
    na: 'な-adjective te-form uses ～で.',
  },
  'adj-adverb': {
    i: 'い-adjective adverbs change final い to ～く.',
    na: 'な-adjective adverbs use ～に.',
  },
  'adj-sou': {
    i: 'そう attaches to the adjective stem to mean looks or seems.',
    na: 'そう attaches directly to many な-adjectives to mean looks or seems.',
  },
  'adj-naru': {
    i: '～くなる means becomes that quality for い-adjectives.',
    na: '～になる means becomes that quality for な-adjectives.',
  },
};

const PLAIN_PAST = {
  food: [
    ['昼休みに、駅前の店で {b}。', 'At lunch break, I {b} at the shop by the station.'],
    ['週末に、家族といっしょに {b}。', 'On the weekend, I {b} together with my family.'],
    ['昨日、スーパーのあとで {b}。', 'Yesterday, I {b} after the supermarket.'],
  ],
  movement: [
    ['朝早く、駅まで {b}。', 'Early in the morning, I {b} as far as the station.'],
    ['昨日の午後、友達の家へ {b}。', "Yesterday afternoon, I {b} to a friend's house."],
    ['授業のあと、まっすぐ家に {b}。', 'After class, I {b} straight home.'],
  ],
  study: [
    ['図書館で一時間ぐらい {b}。', 'I {b} at the library for about an hour.'],
    ['テストの前に、ノートを見ながら {b}。', 'Before the test, I {b} while looking at my notes.'],
    ['昨日の夜、机で {b}。', 'Last night, I {b} at my desk.'],
  ],
  communication: [
    ['休み時間に、先生に {b}。', 'During break, I {b} with the teacher.'],
    ['駅で友達に会って、少し {b}。', 'After meeting a friend at the station, I {b} a little.'],
    ['昨日、電話で母に {b}。', 'Yesterday, I {b} with my mother on the phone.'],
  ],
  'daily-action': [
    ['朝、出かける前に {b}。', 'In the morning, I {b} before going out.'],
    ['昨日の夜、部屋で {b}。', 'Last night, I {b} in my room.'],
    ['週末、ゆっくり {b}。', 'On the weekend, I {b} at a relaxed pace.'],
  ],
  general: [
    ['昨日の午後、友達と {b}。', 'Yesterday afternoon, I {b} with a friend.'],
    ['授業のあとで、少し {b}。', 'After class, I {b} a little.'],
    ['週末に、家で {b}。', 'On the weekend, I {b} at home.'],
  ],
};

const PRESENT_HABITUAL = {
  general: [
    ['毎朝、少しだけ {b}。', 'Every morning, I {b} just a little.'],
    ['週末はよく {b}。', 'On weekends, I often {b}.'],
    ['時間があるとき、いつも {b}。', 'When I have time, I always {b}.'],
  ],
  food: [
    ['昼ごはんのあとで、よく {b}。', 'After lunch, I often {b}.'],
    ['日曜日に、家で {b}。', 'On Sundays, I {b} at home.'],
  ],
  movement: [
    ['学校へは、毎日バスで {b}。', 'I {b} to school by bus every day.'],
    ['天気がいい日は、公園まで {b}。', 'On nice days, I {b} as far as the park.'],
  ],
  study: [
    ['毎晩、机で {b}。', 'Every night, I {b} at my desk.'],
    ['授業の前に、少し {b}。', 'Before class, I {b} a little.'],
  ],
  communication: [
    ['質問があるとき、先生に {b}。', 'When I have a question, I {b} the teacher.'],
    ['週に一回、家族に電話で {b}。', 'Once a week, I {b} my family on the phone.'],
  ],
};

const VERB_FRAMES = {
  'plain-past': PLAIN_PAST,
  'plain-present': PRESENT_HABITUAL,
  'plain-negative': {
    general: [
      ['今日は時間がないから {b}。', "I don't have time today, so I {b}."],
      ['平日はあまり {b}。', 'On weekdays, I usually {b}.'],
      ['雨の日は、たいてい {b}。', 'On rainy days, I usually {b}.'],
    ],
    food: [
      ['朝はあまり {b}。', 'In the morning, I {b} much.'],
      ['お腹がいっぱいだから、今は {b}。', "I'm full, so right now I {b}."],
    ],
    movement: [
      ['今日は雨だから、遠くへ {b}。', "It's rainy today, so I {b} far away."],
      ['疲れているから、今夜は {b}。', "I'm tired, so tonight I {b}."],
    ],
    study: [
      ['眠いときは、あまり集中して {b}。', "When I'm sleepy, I {b} with much focus."],
      ['週末はその教科を {b}。', 'On weekends, I {b} that subject.'],
    ],
    communication: [
      ['忙しい朝は、あまり長く {b}。', 'On busy mornings, I {b} for long.'],
      ['知らない人には、急に {b}。', 'With strangers, I {b} all of a sudden.'],
    ],
  },
  'plain-past-negative': {
    general: [
      ['昨日は忙しくて {b}。', 'Yesterday I was busy, so I {b}.'],
      ['先週は一度も {b}。', 'Last week, I {b} even once.'],
      ['約束の時間までに {b}。', 'By the promised time, I still {b}.'],
    ],
    food: [
      ['朝ごはんのあと、何も {b}。', 'After breakfast, I {b} anything.'],
      ['昨日はお腹が痛くて {b}。', 'Yesterday my stomach hurt, so I {b}.'],
    ],
    movement: [
      ['雨が強かったので、外へ {b}。', 'Because the rain was heavy, I {b} outside.'],
      ['時間がなくて、駅まで {b}。', 'I had no time, so I {b} as far as the station.'],
    ],
    study: [
      ['昨日の夜は疲れていて {b}。', 'Last night I was tired, so I {b}.'],
      ['テスト前なのに、ぜんぜん {b}。', 'Even before the test, I {b} at all.'],
    ],
    communication: [
      ['忙しくて、先生には {b}。', 'I was busy, so I {b} with the teacher.'],
      ['昨日は電話で誰にも {b}。', 'Yesterday, I {b} with anyone on the phone.'],
    ],
  },
  'polite-present': PRESENT_HABITUAL,
  'polite-past': {
    general: [
      ['昨日の午後、少し {b}。', 'Yesterday afternoon, I {b} a little.'],
      ['先週の土曜日に {b}。', 'Last Saturday, I {b}.'],
      ['授業のあとで {b}。', 'After class, I {b}.'],
    ],
    food: [
      ['昨日、駅前の店で {b}。', 'Yesterday, I {b} at the shop by the station.'],
      ['週末に友達と {b}。', 'On the weekend, I {b} with a friend.'],
    ],
    movement: [
      ['今朝、早く駅へ {b}。', 'This morning, I {b} to the station early.'],
      ['昨日、図書館まで {b}。', 'Yesterday, I {b} as far as the library.'],
    ],
    study: [
      ['昨日の夜、テストのために {b}。', 'Last night, I {b} for the test.'],
      ['図書館で一時間 {b}。', 'I {b} at the library for an hour.'],
    ],
    communication: [
      ['昨日、先生に質問を {b}。', 'Yesterday, I {b} the teacher a question.'],
      ['昼休みに友達と {b}。', 'At lunch break, I {b} with a friend.'],
    ],
  },
  'polite-negative': {
    general: [
      ['平日はあまり {b}。', 'On weekdays, I usually {b}.'],
      ['今日は時間がないので {b}。', "I don't have time today, so I {b}."],
      ['雨の日はたいてい {b}。', 'On rainy days, I usually {b}.'],
    ],
  },
  'polite-past-negative': {
    general: [
      ['昨日は忙しくて {b}。', 'Yesterday I was busy, so I {b}.'],
      ['先週は一度も {b}。', 'Last week, I {b} even once.'],
      ['時間が足りなかったので {b}。', "There wasn't enough time, so I {b}."],
    ],
  },
  'te-form': {
    general: [
      ['まず {b}、それから休みます。', 'First I {b}, and then I rest.'],
      ['少し {b}から、次の予定に行きます。', 'I {b} a little, and then head to my next plan.'],
      ['ここで {b}、待ってください。', 'Please {b} here and then wait.'],
    ],
    movement: [
      ['駅まで {b}、友達に会います。', 'I {b} as far as the station and then meet a friend.'],
      ['まっすぐ {b}、右に曲がります。', 'I {b} straight and then turn right.'],
    ],
    study: [
      ['ノートを {b}、先生に見せます。', 'I {b} my notes and then show them to the teacher.'],
      ['よく {b}、テストを受けます。', 'I {b} well and then take the test.'],
    ],
  },
  potential: {
    general: [
      [
        '練習すれば、もっと上手に {b}ようになります。',
        'With practice, I become able to {b} better.',
      ],
      [
        'このアプリで、一人でも {b}ようになります。',
        'With this app, I become able to {b} on my own too.',
      ],
      ['少し時間があれば、ここで {b}。', 'With a little time, I can {b} here.'],
    ],
    communication: [
      ['ゆっくりなら、日本語で {b}。', 'If it is slow, I can {b} in Japanese.'],
      ['簡単な質問なら、もう {b}。', 'If it is a simple question, I can already {b}.'],
    ],
  },
  'potential-negative': {
    general: [
      ['今日は忙しくて、まだ {b}。', "I'm busy today, so I still can't {b}."],
      ['一人では、まだうまく {b}。', "On my own, I still can't {b} well."],
      ['時間が短いので、全部は {b}。', "Time is short, so I can't {b} all of it."],
    ],
  },
  volitional: {
    general: [
      ['少し休んでから、また {b}。', "After resting a little, let's {b} again."],
      ['今日はここまでにして、明日 {b}。', "Let's stop here today and {b} tomorrow."],
      ['友達もいるから、いっしょに {b}。', "A friend is here too, so let's {b} together."],
    ],
  },
  'polite-volitional': {
    general: [
      ['時間がありますから、いっしょに {b}。', "We have time, so let's {b} together."],
      ['次は、この例文で {b}。', "Next, let's {b} with this example sentence."],
      ['もう一度、ゆっくり {b}。', "Let's {b} once more, slowly."],
    ],
  },
  'conditional-tara': {
    general: [
      ['もし時間があったら、ここで {b}。', 'If I have time, I will {b} here.'],
      ['宿題が終わったら、少し {b}。', "When my homework is done, I'll {b} a little."],
      ['雨がやんだら、外で {b}。', "When the rain stops, I'll {b} outside."],
    ],
  },
  'conditional-ba': {
    general: [
      ['毎日 {b}、だんだん上手になります。', 'If I {b} every day, I gradually improve.'],
      ['早く {b}、あとで楽になります。', 'If I {b} early, things get easier later.'],
      ['友達と {b}、もっと楽しいです。', "If I {b} with a friend, it's more fun."],
    ],
  },
  desiderative: {
    general: [
      ['週末は、ゆっくり {b}です。', 'On the weekend, I {b} at a relaxed pace.'],
      ['時間があれば、もう少し {b}です。', 'If I have time, I {b} a little more.'],
      ['今日は新しい場所で {b}です。', 'Today, I {b} in a new place.'],
    ],
    food: [
      ['お腹が空いたので、何か {b}です。', "I'm hungry, so I {b} something."],
      ['駅前の店で {b}です。', 'I {b} at the shop by the station.'],
    ],
  },
  'desiderative-negative': {
    general: [
      ['今日は疲れているので、あまり {b}です。', "I'm tired today, so I really {b}."],
      ['雨の日は、外で {b}です。', 'On rainy days, I {b} outside.'],
      ['今は一人で {b}です。', 'Right now, I {b} on my own.'],
    ],
  },
  progressive: {
    general: [
      ['今、となりの部屋で {b}。', "Right now, I'm {b} in the next room."],
      ['最近、毎日少しずつ {b}。', "Lately, I've been {b} a little every day."],
      ['まだ途中なので、今も {b}。', "I'm still in the middle, so I'm {b} now too."],
    ],
    study: [
      ['今、図書館で {b}。', "Right now, I'm {b} at the library."],
      ['最近、この文法を {b}。', "Lately, I've been {b} this grammar."],
    ],
  },
};

const ADJ_PRESENT = [
  ['このカフェはとても {b}。', 'This cafe is very {b}.'],
  ['駅の近くの店は {b}。', 'The shop near the station is {b}.'],
  ['このアプリの練習はけっこう {b}。', "This app's practice is quite {b}."],
];

const ADJ_FRAMES = {
  'adj-plain-present': ADJ_PRESENT,
  'adj-polite-present': ADJ_PRESENT,
  'adj-plain-past': [
    ['昨日のテストはとても {b}。', "Yesterday's test was very {b}."],
    ['先週の旅行は思ったより {b}。', "Last week's trip was more {b} than I expected."],
    ['昨日の部屋は少し {b}。', "Yesterday's room was a little {b}."],
  ],
  'adj-plain-negative': [
    ['この道はあまり {b}。', "This road isn't very {b}."],
    ['今日の宿題はそんなに {b}。', "Today's homework isn't that {b}."],
    ['この店は思ったほど {b}。', "This shop isn't as {b} as I expected."],
  ],
  'adj-plain-past-negative': [
    ['昨日の映画はあまり {b}。', "Yesterday's movie wasn't very {b}."],
    ['先週のテストは思ったほど {b}。', "Last week's test wasn't as {b} as I expected."],
    ['朝の電車はそんなに {b}。', "The morning train wasn't that {b}."],
  ],
  'adj-polite-past': [
    ['昨日の天気は本当に {b}。', "Yesterday's weather was really {b}."],
    ['先週の授業は思ったより {b}。', "Last week's class was more {b} than I expected."],
    ['この前の旅行はとても {b}。', 'The recent trip was very {b}.'],
  ],
  'adj-polite-negative': [
    ['この問題はあまり {b}。', "This problem isn't very {b}."],
    ['今日は駅前がそんなに {b}。', "Today the area by the station isn't that {b}."],
    ['この説明はまだ十分に {b}。', "This explanation isn't fully {b} yet."],
  ],
  'adj-polite-past-negative': [
    ['昨日の道はあまり {b}。', "Yesterday's road wasn't very {b}."],
    ['先週の部屋はそんなに {b}。', "Last week's room wasn't that {b}."],
    ['その答えは十分に {b}。', "That answer wasn't sufficiently {b}."],
  ],
  'adj-te-form': [
    ['この町は {b}、住みやすいです。', 'This town is {b} and easy to live in.'],
    ['説明が {b}、よく分かりました。', 'The explanation was {b}, so I understood it well.'],
    ['部屋が {b}、勉強しやすいです。', "The room is {b}, so it's easy to study."],
  ],
  'adj-adverb': [
    ['先生は {b}話しました。', 'The teacher spoke in a {b} way.'],
    ['この字を {b}書いてください。', 'Please write this character in a {b} way.'],
    ['今日は {b}練習しましょう。', "Let's practice in a {b} way today."],
  ],
  'adj-sou': [
    ['この料理はとても {b}ですね。', 'This food looks very {b}.'],
    ['外の空は {b}です。', 'The sky outside looks {b}.'],
    ['この問題は少し {b}です。', 'This problem looks a little {b}.'],
  ],
  'adj-naru': [
    ['毎日練習すると、少しずつ {b}。', 'With daily practice, it gradually becomes {b}.'],
    ['春になると、この町は {b}。', 'When spring comes, this town becomes {b}.'],
    ['部屋を片付けると、もっと {b}。', 'When I tidy the room, it becomes more {b}.'],
  ],
};

const ADVANCED_VERB_FALLBACKS = [
  ['この文では、自然な流れで {b}。', 'In this sentence, the verb to use is "to {b}".'],
  [
    '会話の中で、先生がこの形を使って {b}。',
    'In conversation, this example uses the verb "to {b}".',
  ],
  ['例文をよく読んで、ここに {b}。', 'Read the example, then fill the blank with "to {b}".'],
];

const ADVANCED_ADJ_FALLBACKS = [
  ['この説明では、その状態が {b}です。', 'In this explanation, the state is "{b}".'],
  ['例文の空欄には、この形で {b}。', 'In the blank, the adjective is "{b}".'],
  ['前の文に合わせて、ここは {b}。', 'Matching the previous sentence, this one is "{b}".'],
];

function formsFor(type, word) {
  const forms = [];
  try {
    forms.push(conjugateItem(word, type));
  } catch {}
  try {
    forms.push(surfaceFormFor(word, type));
  } catch {}
  return [...new Set(forms.filter(Boolean))];
}

function renderFrame(frame, word, type) {
  const slot = weaveSlot(word, type);
  return {
    sentence: frame[0].replace('{b}', BLANK),
    note: frame[1].includes('{b}') ? frame[1].replace('{b}', slot) : frame[1],
  };
}

function contextOptions(frames, bucket) {
  if (Array.isArray(frames)) return frames;
  return [...(frames[bucket] || []), ...(bucket === 'general' ? [] : frames.general || [])];
}

function isIAdjective(word) {
  return word?.group === 'i-adjective' || word?.group === 'irregular-adjective';
}

function cueFor(word, type) {
  if (type.startsWith('adj-')) {
    const cue = ADJ_CUES[type];
    if (cue) return isIAdjective(word) ? cue.i : cue.na;
  }
  if (CUES[type]) return CUES[type];
  if (type.includes('passive')) return CUES.passive;
  if (type.includes('causative')) return CUES.causative;
  if (type.includes('potential')) return CUES.potential;
  if (type.includes('progressive')) return CUES.progressive;
  if (type.includes('desiderative')) return CUES.desiderative;
  if (type.includes('conditional')) return 'Conditional forms set up an if or when clause.';
  if (type.includes('negative'))
    return 'Negative forms show that the action or state does not happen.';
  if (type.includes('past')) return 'Past forms mark a completed action or past state.';
  if (type.includes('polite')) return 'Polite forms fit neutral, respectful conversation.';
  return 'Use the requested target form to complete the cued sentence.';
}

// Transitive passive: a direct passive with an agent reads naturally.
const PASSIVE_TRANSITIVE_FRAMES = [
  ['昨日、先生に {b}。', 'Yesterday, I was {b} by the teacher.'],
  ['会議で、名前を {b}。', 'In the meeting, a name was {b}.'],
  ['駅で知らない人に {b}。', 'At the station, I was {b} by a stranger.'],
];

// Intransitive (suffering) passive: someone's action affects the speaker. The
// slot is a simple-past verb, so "a friend {went home} on me" stays grammatical.
const PASSIVE_INTRANSITIVE_FRAMES = [
  ['その日、友達に {b}。', 'That day, a friend {b} on me.'],
  ['朝早く、子どもに {b}。', 'Early in the morning, the child {b} on me.'],
  ['困ったことに、雨に {b}。', 'To my dismay, it {b} on me.'],
];

const CAUSATIVE_FRAMES = [
  ['先生は学生にもう一度 {b}。', 'The teacher has the student {b} once more.'],
  ['母は子どもに先に {b}。', 'The mother has the child {b} first.'],
  ['先輩は後輩にゆっくり {b}。', 'The senior has the junior {b} slowly.'],
];

const IMPERATIVE_FRAMES = [
  ['急いで、ここで {b}。', 'Hurry and {b} here.'],
  ['忘れないで、今すぐ {b}。', "Don't forget — {b} right now."],
  ['前を見て、まっすぐ {b}。', 'Look ahead and {b} straight on.'],
];

// Transitive negative-te frames can carry an object; intransitive ones cannot.
const NEGATIVE_TE_TRANSITIVE_FRAMES = [
  ['今日は {b}、早く寝ました。', 'Today, without {b}, I went to bed early.'],
  ['何も {b}、そのまま出ました。', 'Without {b} anything, I left as I was.'],
  ['朝ごはんを {b}、学校に行きました。', 'I went to school without {b} breakfast.'],
];

const NEGATIVE_TE_INTRANSITIVE_FRAMES = [
  ['今日は {b}、早く寝ました。', 'Today, without {b}, I went to bed early.'],
  ['その日は {b}、すぐに出かけました。', 'That day, without {b}, I went out right away.'],
  ['結局 {b}、家にいました。', 'In the end, without {b}, I stayed home.'],
];

function frameOptionsFor(word, type, bucket) {
  const direct = type.startsWith('adj-') ? ADJ_FRAMES[type] : VERB_FRAMES[type];
  if (direct) return contextOptions(direct, bucket);

  if (type.startsWith('adj-')) return ADVANCED_ADJ_FALLBACKS;
  const transitive = isTransitiveWord(word);
  if (type.includes('passive')) {
    return transitive ? PASSIVE_TRANSITIVE_FRAMES : PASSIVE_INTRANSITIVE_FRAMES;
  }
  if (type.includes('causative')) return CAUSATIVE_FRAMES;
  if (type.includes('imperative') || type.includes('command')) return IMPERATIVE_FRAMES;
  if (type.includes('negative-te') || type === 'negative-zuni') {
    return transitive ? NEGATIVE_TE_TRANSITIVE_FRAMES : NEGATIVE_TE_INTRANSITIVE_FRAMES;
  }
  return ADVANCED_VERB_FALLBACKS;
}

export function buildOfflineCuedCloze(word, type) {
  const typeInfo = getTypeInfo(type);
  const targetLabel = typeInfo.label || type;
  const bucket = clozeContextBucket(word);
  const options = frameOptionsFor(word, type, bucket);
  const variant = pickDeterministic(options, `${wordKey(word)}|${type}|${bucket}`) || options[0];
  const rendered = renderFrame(variant, word, type);
  const targets = formsFor(type, word);
  const sentence = normalizeSentenceBlankForTarget(rendered.sentence, targets);
  const variantId = `${bucket}:${hashString(`${variant[0]}|${type}`)}`;

  return {
    sentence,
    jaTemplate: sentence.replace(BLANK, '{w}'),
    cue: cueFor(word, type),
    note: rendered.note,
    variantId,
    translation: `Fill in: ${word.dict} (${word.reading}) -> ${targetLabel} (${rendered.note})`,
  };
}
