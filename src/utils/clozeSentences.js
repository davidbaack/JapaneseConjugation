import { getTypeInfo } from '../data/conjugationTypes.js';
import { conjugateItem, isAdjective, surfaceFormFor, wordKey } from './conjugator.js';
import { normalizeSentenceBlankForTarget } from './display.js';

const BLANK = '[______]';

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
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
    ['昼休みに、駅前の店で {b}。', 'At lunch break, at the shop by the station.'],
    ['週末に、家族といっしょに {b}。', 'On the weekend, together with family.'],
    ['昨日、スーパーのあとで {b}。', 'Yesterday, after the supermarket.'],
  ],
  movement: [
    ['朝早く、駅まで {b}。', 'Early in the morning, as far as the station.'],
    ['昨日の午後、友達の家へ {b}。', "Yesterday afternoon, to a friend's house."],
    ['授業のあと、まっすぐ家に {b}。', 'After class, straight home.'],
  ],
  study: [
    ['図書館で一時間ぐらい {b}。', 'At the library, for about an hour.'],
    ['テストの前に、ノートを見ながら {b}。', 'Before the test, while looking at notes.'],
    ['昨日の夜、机で {b}。', 'Last night, at the desk.'],
  ],
  communication: [
    ['休み時間に、先生に {b}。', 'During break, to the teacher.'],
    ['駅で友達に会って、少し {b}。', 'After meeting a friend at the station, for a bit.'],
    ['昨日、電話で母に {b}。', 'Yesterday, on the phone with my mother.'],
  ],
  'daily-action': [
    ['朝、出かける前に {b}。', 'In the morning, before going out.'],
    ['昨日の夜、部屋で {b}。', 'Last night, in the room.'],
    ['週末、ゆっくり {b}。', 'On the weekend, slowly.'],
  ],
  general: [
    ['昨日の午後、友達と {b}。', 'Yesterday afternoon, with a friend.'],
    ['授業のあとで、少し {b}。', 'After class, for a bit.'],
    ['週末に、家で {b}。', 'On the weekend, at home.'],
  ],
};

const VERB_FRAMES = {
  'plain-past': PLAIN_PAST,
  'plain-negative': {
    general: [
      ['今日は時間がないから {b}。', 'No time today, so it does not happen.'],
      ['平日はあまり {b}。', 'On weekdays, not very often.'],
      ['雨の日は、たいてい {b}。', 'On rainy days, usually not.'],
    ],
    food: [
      ['朝はあまり {b}。', 'In the morning, not very much.'],
      ['お腹がいっぱいだから、今は {b}。', 'Full, so not now.'],
    ],
    movement: [
      ['今日は雨だから、遠くへ {b}。', 'Rainy today, so not far away.'],
      ['疲れているから、今夜は {b}。', 'Tired, so not tonight.'],
    ],
    study: [
      ['眠いときは、あまり集中して {b}。', 'When sleepy, not with much focus.'],
      ['週末はその教科を {b}。', 'On weekends, not that subject.'],
    ],
    communication: [
      ['忙しい朝は、あまり長く {b}。', 'On busy mornings, not for long.'],
      ['知らない人には、急に {b}。', 'To strangers, not suddenly.'],
    ],
  },
  'plain-past-negative': {
    general: [
      ['昨日は忙しくて {b}。', 'Yesterday was busy, so it did not happen.'],
      ['先週は一度も {b}。', 'Last week, not even once.'],
      ['約束の時間までに {b}。', 'By the promised time, it did not happen.'],
    ],
    food: [
      ['朝ごはんのあと、何も {b}。', 'After breakfast, nothing.'],
      ['昨日はお腹が痛くて {b}。', 'Yesterday, because of a stomachache.'],
    ],
    movement: [
      ['雨が強かったので、外へ {b}。', 'Because the rain was heavy, not outside.'],
      ['時間がなくて、駅まで {b}。', 'No time, so not as far as the station.'],
    ],
    study: [
      ['昨日の夜は疲れていて {b}。', 'Last night, too tired.'],
      ['テスト前なのに、ぜんぜん {b}。', 'Even before the test, not at all.'],
    ],
    communication: [
      ['忙しくて、先生には {b}。', 'Busy, so not to the teacher.'],
      ['昨日は電話で誰にも {b}。', 'Yesterday, not to anyone by phone.'],
    ],
  },
  'polite-present': {
    general: [
      ['毎朝、少しだけ {b}。', 'Every morning, just a little.'],
      ['週末はよく {b}。', 'On weekends, often.'],
      ['時間があるとき、いつも {b}。', 'When there is time, always.'],
    ],
    food: [
      ['昼ごはんのあとで、よく {b}。', 'After lunch, often.'],
      ['日曜日に、家で {b}。', 'On Sundays, at home.'],
    ],
    movement: [
      ['学校へは、毎日バスで {b}。', 'To school, every day by bus.'],
      ['天気がいい日は、公園まで {b}。', 'On nice days, as far as the park.'],
    ],
    study: [
      ['毎晩、机で {b}。', 'Every night, at the desk.'],
      ['授業の前に、少し {b}。', 'Before class, a little.'],
    ],
    communication: [
      ['質問があるとき、先生に {b}。', 'When there is a question, to the teacher.'],
      ['週に一回、家族に電話で {b}。', 'Once a week, by phone with family.'],
    ],
  },
  'polite-past': {
    general: [
      ['昨日の午後、少し {b}。', 'Yesterday afternoon, a little.'],
      ['先週の土曜日に {b}。', 'Last Saturday.'],
      ['授業のあとで {b}。', 'After class.'],
    ],
    food: [
      ['昨日、駅前の店で {b}。', 'Yesterday, at the shop by the station.'],
      ['週末に友達と {b}。', 'On the weekend, with a friend.'],
    ],
    movement: [
      ['今朝、早く駅へ {b}。', 'This morning, early to the station.'],
      ['昨日、図書館まで {b}。', 'Yesterday, as far as the library.'],
    ],
    study: [
      ['昨日の夜、テストのために {b}。', 'Last night, for the test.'],
      ['図書館で一時間 {b}。', 'At the library, for an hour.'],
    ],
    communication: [
      ['昨日、先生に質問を {b}。', 'Yesterday, a question to the teacher.'],
      ['昼休みに友達と {b}。', 'At lunch break, with a friend.'],
    ],
  },
  'polite-negative': {
    general: [
      ['平日はあまり {b}。', 'On weekdays, not very often.'],
      ['今日は時間がないので {b}。', 'No time today, so not.'],
      ['雨の日はたいてい {b}。', 'On rainy days, usually not.'],
    ],
  },
  'polite-past-negative': {
    general: [
      ['昨日は忙しくて {b}。', 'Yesterday was busy, so it did not happen.'],
      ['先週は一度も {b}。', 'Last week, not even once.'],
      ['時間が足りなかったので {b}。', 'Because there was not enough time.'],
    ],
  },
  'te-form': {
    general: [
      ['まず {b}、それから休みます。', 'First do it, then rest.'],
      ['少し {b}から、次の予定に行きます。', 'Do it a little, then go to the next plan.'],
      ['ここで {b}、待ってください。', 'Do it here, then wait please.'],
    ],
    movement: [
      ['駅まで {b}、友達に会います。', 'Go as far as the station, then meet a friend.'],
      ['まっすぐ {b}、右に曲がります。', 'Go straight, then turn right.'],
    ],
    study: [
      ['ノートを {b}、先生に見せます。', 'Do it with notes, then show the teacher.'],
      ['よく {b}、テストを受けます。', 'Do it well, then take the test.'],
    ],
  },
  potential: {
    general: [
      [
        '練習すれば、もっと上手に {b}ようになります。',
        'With practice, become able to do it better.',
      ],
      [
        'このアプリで、一人でも {b}ようになります。',
        'With this app, become able to do it alone too.',
      ],
      ['少し時間があれば、ここで {b}。', 'With a little time, can do it here.'],
    ],
    communication: [
      ['ゆっくりなら、日本語で {b}。', 'If slowly, can do it in Japanese.'],
      ['簡単な質問なら、もう {b}。', 'If it is a simple question, can already do it.'],
    ],
  },
  'potential-negative': {
    general: [
      ['今日は忙しくて、まだ {b}。', 'Busy today, so still cannot.'],
      ['一人では、まだうまく {b}。', 'Alone, still cannot do it well.'],
      ['時間が短いので、全部は {b}。', 'Time is short, so cannot do all of it.'],
    ],
  },
  volitional: {
    general: [
      ['少し休んでから、また {b}。', 'After resting a little, let us do it again.'],
      ['今日はここまでにして、明日 {b}。', 'Stop here today, and do it tomorrow.'],
      ['友達もいるから、いっしょに {b}。', 'A friend is here too, so let us do it together.'],
    ],
  },
  'polite-volitional': {
    general: [
      ['時間がありますから、いっしょに {b}。', 'There is time, so let us do it together.'],
      ['次は、この例文で {b}。', 'Next, let us do it with this example sentence.'],
      ['もう一度、ゆっくり {b}。', 'One more time, slowly.'],
    ],
  },
  'conditional-tara': {
    general: [
      ['もし時間があったら、ここで {b}。', 'If there is time, do it here.'],
      ['宿題が終わったら、少し {b}。', 'When homework is done, do it a little.'],
      ['雨がやんだら、外で {b}。', 'When the rain stops, do it outside.'],
    ],
  },
  'conditional-ba': {
    general: [
      ['毎日 {b}、だんだん上手になります。', 'If you do it every day, you gradually improve.'],
      ['早く {b}、あとで楽になります。', 'If you do it early, later gets easier.'],
      ['友達と {b}、もっと楽しいです。', 'If you do it with a friend, it is more fun.'],
    ],
  },
  desiderative: {
    general: [
      ['週末は、ゆっくり {b}です。', 'On the weekend, want to do it slowly.'],
      ['時間があれば、もう少し {b}です。', 'If there is time, want to do it a little more.'],
      ['今日は新しい場所で {b}です。', 'Today, want to do it in a new place.'],
    ],
    food: [
      ['お腹が空いたので、何か {b}です。', 'Hungry, so want to do something food-related.'],
      ['駅前の店で {b}です。', 'Want to do it at the shop by the station.'],
    ],
  },
  'desiderative-negative': {
    general: [
      ['今日は疲れているので、あまり {b}です。', 'Tired today, so do not really want to.'],
      ['雨の日は、外で {b}です。', 'On rainy days, do not want to do it outside.'],
      ['今は一人で {b}です。', 'Right now, do not want to do it alone.'],
    ],
  },
  progressive: {
    general: [
      ['今、となりの部屋で {b}。', 'Right now, in the next room.'],
      ['最近、毎日少しずつ {b}。', 'Recently, a little every day.'],
      ['まだ途中なので、今も {b}。', 'Still in the middle, so still doing it.'],
    ],
    study: [
      ['今、図書館で {b}。', 'Right now, at the library.'],
      ['最近、この文法を {b}。', 'Recently, this grammar.'],
    ],
  },
};

const ADJ_FRAMES = {
  'adj-plain-past': [
    ['昨日のテストはとても {b}。', 'The test yesterday was that way.'],
    ['先週の旅行は思ったより {b}。', 'Last week’s trip was more that way than expected.'],
    ['昨日の部屋は少し {b}。', 'The room yesterday was a little that way.'],
  ],
  'adj-plain-negative': [
    ['この道はあまり {b}。', 'This road is not very that way.'],
    ['今日の宿題はそんなに {b}。', 'Today’s homework is not that way.'],
    ['この店は思ったほど {b}。', 'This shop is not as that way as expected.'],
  ],
  'adj-plain-past-negative': [
    ['昨日の映画はあまり {b}。', 'Yesterday’s movie was not very that way.'],
    ['先週のテストは思ったほど {b}。', 'Last week’s test was not as that way as expected.'],
    ['朝の電車はそんなに {b}。', 'The morning train was not that way.'],
  ],
  'adj-polite-present': [
    ['このカフェはとても {b}。', 'This cafe is very that way.'],
    ['駅の近くの店は {b}。', 'The shop near the station is that way.'],
    ['このアプリの練習はけっこう {b}。', 'This app’s practice is fairly that way.'],
  ],
  'adj-polite-past': [
    ['昨日の天気は本当に {b}。', 'Yesterday’s weather was really that way.'],
    ['先週の授業は思ったより {b}。', 'Last week’s class was more that way than expected.'],
    ['この前の旅行はとても {b}。', 'The recent trip was very that way.'],
  ],
  'adj-polite-negative': [
    ['この問題はあまり {b}。', 'This problem is not very that way.'],
    ['今日は駅前がそんなに {b}。', 'Today the station area is not that way.'],
    ['この説明はまだ十分に {b}。', 'This explanation is not fully that way yet.'],
  ],
  'adj-polite-past-negative': [
    ['昨日の道はあまり {b}。', 'Yesterday’s road was not very that way.'],
    ['先週の部屋はそんなに {b}。', 'Last week’s room was not that way.'],
    ['その答えは十分に {b}。', 'That answer was not sufficiently that way.'],
  ],
  'adj-te-form': [
    ['この町は {b}、住みやすいです。', 'This town is that way, and easy to live in.'],
    ['説明が {b}、よく分かりました。', 'The explanation was that way, so I understood well.'],
    ['部屋が {b}、勉強しやすいです。', 'The room is that way, so it is easy to study.'],
  ],
  'adj-adverb': [
    ['先生は {b}話しました。', 'The teacher spoke in that manner.'],
    ['この字を {b}書いてください。', 'Please write this character in that manner.'],
    ['今日は {b}練習しましょう。', 'Let us practice in that manner today.'],
  ],
  'adj-sou': [
    ['この料理はとても {b}ですね。', 'This food looks that way.'],
    ['外の空は {b}です。', 'The sky outside looks that way.'],
    ['この問題は少し {b}です。', 'This problem looks a little that way.'],
  ],
  'adj-naru': [
    [
      '毎日練習すると、少しずつ {b}。',
      'With daily practice, it becomes that way little by little.',
    ],
    ['春になると、この町は {b}。', 'When spring comes, this town becomes that way.'],
    ['部屋を片付けると、もっと {b}。', 'When the room is tidied, it becomes more that way.'],
  ],
};

const ADVANCED_VERB_FALLBACKS = [
  ['この文では、自然な流れで {b}。', 'In this sentence, it fits the natural flow.'],
  ['会話の中で、先生がこの形を使って {b}。', 'In conversation, the teacher uses this form.'],
  ['例文をよく読んで、ここに {b}。', 'Read the example and place this form here.'],
];

const ADVANCED_ADJ_FALLBACKS = [
  ['この説明では、その状態が {b}。', 'In this explanation, the state is expressed this way.'],
  ['例文の空欄には、この形で {b}。', 'In the blank, use this form.'],
  ['前の文に合わせて、ここは {b}。', 'Match the previous sentence with this form here.'],
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

function renderFrame(frame) {
  return {
    sentence: frame[0].replace('{b}', BLANK),
    note: frame[1],
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

function frameOptionsFor(word, type, bucket) {
  const direct = type.startsWith('adj-') ? ADJ_FRAMES[type] : VERB_FRAMES[type];
  if (direct) return contextOptions(direct, bucket);

  if (type.startsWith('adj-')) return ADVANCED_ADJ_FALLBACKS;
  if (type.includes('passive')) {
    return [
      ['昨日、先生に {b}。', 'Yesterday, by the teacher.'],
      ['会議で、名前を {b}。', 'In the meeting, the name receives the action.'],
      ['駅で知らない人に {b}。', 'At the station, by someone unknown.'],
    ];
  }
  if (type.includes('causative')) {
    return [
      ['先生は学生にもう一度 {b}。', 'The teacher makes or lets the student do it again.'],
      ['母は子どもに先に {b}。', 'The mother makes or lets the child do it first.'],
      ['先輩は後輩にゆっくり {b}。', 'The senior makes or lets the junior do it slowly.'],
    ];
  }
  if (type.includes('imperative') || type.includes('command')) {
    return [
      ['急いで、ここで {b}。', 'Hurry and do it here.'],
      ['忘れないで、今すぐ {b}。', 'Do not forget; do it now.'],
      ['前を見て、まっすぐ {b}。', 'Look ahead and do it straight.'],
    ];
  }
  if (type.includes('negative-te') || type === 'negative-zuni') {
    return [
      ['今日は {b}、早く寝ました。', 'Today, without doing it, went to bed early.'],
      ['何も {b}、そのまま出ました。', 'Without doing anything, left as is.'],
      ['答えを見ないで、{b}ください。', 'Without looking at the answer, please do it.'],
    ];
  }
  return ADVANCED_VERB_FALLBACKS;
}

export function buildOfflineCuedCloze(word, type) {
  const typeInfo = getTypeInfo(type);
  const targetLabel = typeInfo.label || type;
  const bucket = clozeContextBucket(word);
  const options = frameOptionsFor(word, type, bucket);
  const variant = pickDeterministic(options, `${wordKey(word)}|${type}|${bucket}`) || options[0];
  const rendered = renderFrame(variant);
  const targets = formsFor(type, word);
  const sentence = normalizeSentenceBlankForTarget(rendered.sentence, targets);
  const variantId = `${bucket}:${hashString(`${variant[0]}|${type}`)}`;

  return {
    sentence,
    cue: cueFor(word, type),
    note: rendered.note,
    variantId,
    translation: `Fill in: ${word.dict} (${word.reading}) -> ${targetLabel} (${rendered.note})`,
  };
}
