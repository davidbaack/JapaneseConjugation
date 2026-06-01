import { ALL_CARD_TYPES, FORM_GROUPS } from './conjugationTypes.js';

const groupTypeIds = (id) => FORM_GROUPS.find((group) => group.id === id)?.typeIds || [];

const lessonFromGroup = (groupId, lesson) => ({
  ...lesson,
  groupId,
  typeIds: groupTypeIds(groupId),
});

export const FOUNDATION_CARDS = [
  {
    title: 'Ichidan verbs',
    badge: 'drop ru',
    pattern: 'Drop the final る, then attach the ending.',
    example: '食べる -> 食べない / 食べます / 食べた',
    note: 'Most -eru and -iru verbs are ichidan, but some are godan; trust the dictionary group.',
  },
  {
    title: 'Godan verbs',
    badge: 'row shift',
    pattern: 'Keep the stem, move the final kana to the needed row, then add the ending.',
    example: '書く -> 書かない / 書きます / 書ける / 書こう',
    note: 'The final kana controls everything: a-row, i-row, e-row, o-row, or the te/ta sound change.',
  },
  {
    title: 'Suru and kuru',
    badge: 'irregular',
    pattern: 'Conjugate the する or 来る core irregularly; keep any compound noun before it.',
    example: '勉強する -> 勉強した / 来る -> きた / こない',
    note: 'する often becomes し-, さ-, or できる; 来る alternates こ-, き-, and く-.',
  },
  {
    title: 'Adjectives',
    badge: 'predicate',
    pattern:
      'い-adjectives drop い for most endings; な-adjectives use the base plus copula pieces.',
    example: '高い -> 高くない / 静か -> 静かだった',
    note: 'いい and かっこいい use よ as the stem for changed forms: よかった, よくない.',
  },
];

export const GODAN_ROW_KEYS = [
  {
    row: 'a-row',
    use: 'negative, passive, causative',
    example: '書く -> 書かない / 書かれる / 書かせる',
  },
  {
    row: 'i-row',
    use: 'masu-stem, polite, tai',
    example: '書く -> 書きます / 書きたい',
  },
  {
    row: 'e-row',
    use: 'potential, imperative, ba conditional',
    example: '書く -> 書ける / 書け / 書けば',
  },
  {
    row: 'o-row',
    use: 'volitional',
    example: '書く -> 書こう',
  },
];

export const ONBIN_ROWS = [
  { ending: 'う / つ / る', te: 'って', ta: 'った', example: '買う -> 買って / 買った' },
  { ending: 'む / ぶ / ぬ', te: 'んで', ta: 'んだ', example: '読む -> 読んで / 読んだ' },
  { ending: 'く', te: 'いて', ta: 'いた', example: '書く -> 書いて / 書いた' },
  { ending: 'ぐ', te: 'いで', ta: 'いだ', example: '泳ぐ -> 泳いで / 泳いだ' },
  { ending: 'す', te: 'して', ta: 'した', example: '話す -> 話して / 話した' },
  { ending: '行く', te: 'って', ta: 'った', example: '行く -> 行って / 行った' },
];

export const RU_MASU_DIAGNOSTIC_ROWS = [
  {
    dict: '食べる',
    polite: '食べます',
    group: 'ichidan',
    clue: '食べ goes straight into ます, so final る dropped.',
  },
  {
    dict: '見る',
    polite: '見ます',
    group: 'ichidan',
    clue: '見 keeps the same stem before ます.',
  },
  {
    dict: '走る',
    polite: '走ります',
    group: 'godan',
    clue: 'る becomes り before ます, so it row-shifts.',
  },
  {
    dict: '帰る',
    polite: '帰ります',
    group: 'godan',
    clue: 'The り before ます marks a godan る trap.',
  },
  {
    dict: '切る',
    polite: '切ります',
    group: 'godan',
    clue: 'Homophone warning: to cut is godan.',
  },
  {
    dict: '着る',
    polite: '着ます',
    group: 'ichidan',
    clue: 'Homophone warning: to wear is ichidan.',
  },
];

export const LESSON_SECTIONS = [
  lessonFromGroup('basic-tenses', {
    title: 'Plain and Polite Basics',
    kana: '普通形・ます形',
    summary:
      'These are the everyday tense and register forms. Plain forms anchor casual speech and embedded clauses; polite forms are the default safe register for conversation.',
    build:
      'Plain present is the dictionary form. Plain negative uses ichidan stem + ない or godan a-row + ない. Polite forms use the masu-stem plus ます, ました, ません, or ませんでした.',
    variants:
      'Plain past uses た/だ sound changes. Plain past negative is the negative base plus なかった. Adjective polite forms usually add です or ではありません.',
    watch:
      'ある is special: its negative is ない. For い-adjectives, past and negative change the adjective itself before adding politeness.',
    examples: [
      ['食べる', '食べた / 食べない / 食べます', 'ichidan drops る'],
      ['書く', '書いた / 書かない / 書きます', 'godan uses sound change, a-row, i-row'],
      ['高い', '高かった / 高くない / 高いです', 'い-adjective stem is 高'],
    ],
  }),
  lessonFromGroup('te-form-stem', {
    title: 'Te-form and Masu-stem',
    kana: 'て形・連用形',
    summary:
      'The te-form connects actions and unlocks requests, permission, progressive aspect, and many sentence patterns. The masu-stem is the attachment point for polite forms and helper endings.',
    build:
      'Masu-stem: ichidan drop る; godan moves to i-row; する -> し; 来る -> き. Te-form: ichidan +て; godan uses the sound-change table; する -> して; 来る -> きて.',
    variants:
      'The same te-form feeds てください, てもいい, and ている. The same masu-stem feeds ます, ましょう, たい, なさい, and stem-linking expressions.',
    watch: '行く is the famous exception for te/ta: 行って and 行った, not 行いて or 行いた.',
    examples: [
      ['読む', '読んで / 読んだ', 'む, ぶ, ぬ become んで / んだ'],
      ['話す', '話して / 話した', 'す becomes して / した'],
      ['来る', 'きて / きます', 'kuru alternates き and こ depending on form'],
    ],
  }),
  lessonFromGroup('volitional-desire', {
    title: 'Volitional and Wanting',
    kana: '意向形・たい形',
    summary:
      'Volitional forms propose or intend an action. Tai-forms express wanting to do something and then behave like い-adjectives.',
    build:
      'Volitional: ichidan stem + よう; godan o-row + う; する -> しよう; 来る -> こよう. Polite volitional is masu-stem + ましょう. Tai-form is masu-stem + たい.',
    variants:
      'たい conjugates like an い-adjective: たくない, たかった, たくなかった. Polite tai usually adds です after the tai-form.',
    watch: 'The thing wanted is often marked with が in learner Japanese: 水が飲みたい.',
    examples: [
      ['食べる', '食べよう / 食べたい', 'ichidan stem plus よう or たい'],
      ['書く', '書こう / 書きたい', 'godan o-row for volitional, i-row for tai'],
      ['する', 'しよう / したい', 'irregular する core'],
    ],
  }),
  lessonFromGroup('potential', {
    title: 'Potential',
    kana: '可能形',
    summary:
      'Potential forms mean can do or be able to do. Once formed, the potential behaves mostly like an ichidan-style る form for negatives, past, politeness, and conditionals.',
    build: 'Ichidan: drop る + られる. Godan: e-row + る. する -> できる. 来る -> こられる.',
    variants:
      'Negative, past, polite, and ba variants conjugate the potential base: 食べられる -> 食べられない / 食べられました / 食べられれば.',
    watch:
      'In conversation, ichidan ら often drops: 食べれる. The app teaches the standard full form unless a word supplies otherwise.',
    examples: [
      ['読む', '読める / 読めない', 'godan e-row + る'],
      ['食べる', '食べられる / 食べられない', 'ichidan + られる'],
      ['勉強する', '勉強できる', 'する potential is できる'],
    ],
  }),
  lessonFromGroup('conditional', {
    title: 'Conditionals',
    kana: '条件形',
    summary:
      'Japanese has several practical if/when tools. たら is broad and event-like, ば is rule-like, and なら sets up “if it is the case that…”',
    build:
      'たら attaches to the plain past or past-negative. ば uses godan e-row + ば, ichidan stem + れば, and negative なければ. なら follows the plain/dictionary idea.',
    variants:
      'Potential, passive, causative, and causative-passive ba forms first make the derived る-form, then change る to れば.',
    watch:
      'Use たら for “when/after it happens” freely. Use ば when the condition feels general, required, or rule-like.',
    examples: [
      ['食べる', '食べたら / 食べれば', 'past + ら, or stem + れば'],
      ['書く', '書いたら / 書けば', 'past sound change, or e-row + ば'],
      ['ない', 'なければ / なかったら', 'negative ba and negative tara differ'],
    ],
  }),
  lessonFromGroup('progressive', {
    title: 'Progressive and Result State',
    kana: 'ている',
    summary:
      'ている can mean an action is ongoing, a habit is active, or a state remains after a change. The exact reading depends on the verb.',
    build:
      'Make the te-form, then add いる. Polite and tense variants change いる: います, いない, いた, いませんでした.',
    variants:
      'Progressive past is ていた. Progressive negative is ていない. In speech, ている often contracts to てる.',
    watch:
      'Open-ended activity verbs usually mean “is doing”; change-of-state verbs often mean “has become and remains.”',
    examples: [
      ['読んでいる', 'is reading / has been reading', 'ongoing action'],
      ['結婚している', 'is married', 'resulting state'],
      ['食べていません', 'is not eating / has not eaten', 'polite negative'],
    ],
  }),
  lessonFromGroup('commands-requests', {
    title: 'Commands, Requests, Permission, Obligation',
    kana: '命令・依頼',
    summary:
      'These forms control action: direct commands, polite instructions, requests, permission, prohibition, and must-do obligations.',
    build:
      'Imperative: godan e-row, ichidan stem + ろ, する -> しろ, 来る -> こい. なさい uses masu-stem + なさい. Requests use te-form + ください.',
    variants:
      'Permission is te-form + もいい. Prohibition is dictionary form + な. Obligation is negative base + なければならない.',
    watch:
      'Plain imperatives and dictionary + な can sound sharp. てください, ないでください, and なさい are safer for learners.',
    examples: [
      ['書く', '書け / 書きなさい / 書いてください', 'e-row, masu-stem, te-form'],
      ['食べる', '食べろ / 食べないでください', 'ichidan command and negative request'],
      ['行く', '行ってもいい / 行かなければならない', 'permission and obligation'],
    ],
  }),
  lessonFromGroup('passive', {
    title: 'Passive',
    kana: '受身形',
    summary:
      'Passive forms mean “is done by someone” or “was affected by someone’s action.” Japanese also uses passive for unpleasant affected experiences.',
    build: 'Ichidan: drop る + られる. Godan: a-row + れる. する -> される. 来る -> こられる.',
    variants:
      'After you build the passive る-form, conjugate it with the drop-る pattern: られない, られた, られます, られれば.',
    watch:
      'The doer is usually marked with に. Passive and potential can look identical for ichidan verbs, so read by context.',
    examples: [
      ['褒める', '褒められる', 'ichidan passive'],
      ['書く', '書かれる', 'godan a-row + れる'],
      ['する', 'される', 'suru passive'],
    ],
  }),
  lessonFromGroup('causative', {
    title: 'Causative and Short Causative',
    kana: '使役形',
    summary:
      'Causative forms mean make someone do something or let someone do something. The person made/allowed to act is often marked with に.',
    build:
      'Long causative: ichidan stem + させる; godan a-row + せる; する -> させる; 来る -> こさせる.',
    variants:
      'Long causatives conjugate with the drop-る pattern. Short causative is more casual: ichidan + さす, godan a-row + す, する -> さす, 来る -> こさす; then it behaves like a す-ending godan verb.',
    watch:
      'The short form is common in speech but not always appropriate in formal writing. Use the long form when unsure.',
    examples: [
      ['食べる', '食べさせる / 食べさす', 'long and short ichidan'],
      ['書く', '書かせる / 書かす', 'godan a-row'],
      ['勉強する', '勉強させる', 'compound suru keeps the noun'],
    ],
  }),
  lessonFromGroup('causative-passive', {
    title: 'Causative-Passive',
    kana: '使役受身',
    summary:
      'Causative-passive means “was made to do” or “was forced/allowed into doing.” It combines causative meaning with passive viewpoint.',
    build:
      'Long form: build the causative and make it passive, usually ending in させられる or せられる. する -> させられる. 来る -> こさせられる.',
    variants:
      'Once formed, treat it with the drop-る pattern for polite, past, negative, and ba forms. Short causative-passive often compresses godan forms to a-row + される: 書かされる.',
    watch:
      'Short causative-passive is not available for every verb shape; final す godan verbs avoid the short shortcut.',
    examples: [
      ['食べる', '食べさせられる', 'ichidan long causative-passive'],
      ['書く', '書かせられる / 書かされる', 'long and common short godan'],
      ['する', 'させられる', 'suru long form'],
    ],
  }),
  lessonFromGroup('keigo', {
    title: 'Keigo: Honorific and Humble',
    kana: '尊敬語・謙譲語',
    summary:
      'Keigo changes social perspective. Honorific forms raise someone else’s action; humble forms lower your own or your in-group’s action.',
    build:
      'Regular honorific often uses お/ご + masu-stem + になる. Regular humble often uses お/ご + masu-stem + する. Suru compounds commonly use ご + noun + なさる/いたす.',
    variants:
      'Polite keigo uses the polite version of the keigo verb. Common verbs have special replacements: 行く/来る/いる -> いらっしゃる, する -> なさる/いたす, 言う -> おっしゃる/申す.',
    watch:
      'Keigo is lexical as much as grammatical. Learn the common special verbs, then use the regular pattern for less common verbs.',
    examples: [
      ['見る', 'ご覧になる / 拝見する', 'honorific / humble special pair'],
      ['行く', 'いらっしゃる / 参る', 'movement special pair'],
      ['待つ', 'お待ちになる / お待ちする', 'regular stem pattern'],
    ],
  }),
  lessonFromGroup('special-forms', {
    title: 'Negative Connectors and Special Forms',
    kana: 'ないで・なくて・ずに',
    summary:
      'These forms connect negative actions, express “without doing,” make formal negative links, and add conjecture or prohibition.',
    build:
      'ないで attaches to the plain negative and means without doing or please do not when followed by ください. なくて changes ない to なくて for “not and/because.” ずに is the formal without-doing form.',
    variants:
      'ずに uses the old negative stem: ichidan stem + ずに, godan a-row + ずに, する -> せずに, 来る -> こずに. Conjectural is plain form + だろう.',
    watch:
      'ないで keeps the action undone; なくて often gives a reason or connects adjective-like negatives.',
    examples: [
      ['食べないで', 'without eating / do not eat', 'negative te'],
      ['食べなくて', 'not eating and / because not eating', 'negative connective'],
      ['勉強せずに', 'without studying', 'formal ずに with suru'],
    ],
  }),
  lessonFromGroup('adjectives', {
    title: 'Adjectives',
    kana: '形容詞',
    summary:
      'Adjectives conjugate for tense, negativity, connection, adverb use, noun modification, conditionals, appearance, excess, and becoming.',
    build:
      'い-adjectives drop い for changed forms: かった, くない, くて, く, ければ, そう, すぎる, くなる. な-adjectives use the base plus だ/です, だった, ではない, で, に, な, なら, そう, すぎる, になる.',
    variants:
      'Negative and past-negative adjective forms change before politeness: 高くないです, 高くなかったです; 静かではありません, 静かではありませんでした.',
    watch:
      'For そう with い-adjectives, remove い: 高そう. For いい, use よさそう, よかった, よくない.',
    examples: [
      ['高い', '高かった / 高くない / 高くて / 高そう', 'い-adjective stem 高'],
      ['静か', '静かだった / 静かではない / 静かで / 静かに', 'な-adjective base'],
      ['いい', 'よかった / よくない / よさそう', 'irregular よ stem'],
    ],
  }),
];

export function getLessonCoverage() {
  const covered = new Set(LESSON_SECTIONS.flatMap((lesson) => lesson.typeIds));
  const missing = ALL_CARD_TYPES.filter((type) => !covered.has(type.id));
  return {
    total: ALL_CARD_TYPES.length,
    covered: covered.size,
    missing,
  };
}
