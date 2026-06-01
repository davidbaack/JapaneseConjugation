export const VERB_GROUP_IDS = ['ichidan', 'godan', 'suru', 'kuru'];

export const GROUP_DISPLAY = {
  ichidan: {
    id: 'ichidan',
    kind: 'verb',
    label: 'ichidan: drop る',
    shortLabel: 'ichidan',
    concept: 'drop る',
    aliasText: 'also called る-verb / Group 2',
    decoder: 'remove final る, attach ending.',
    recognition: 'The final る drops away before most endings attach.',
    example: '食べる -> 食べない',
    trap: 'Not every る-ending verb is ichidan; 帰る and 走る are godan.',
  },
  godan: {
    id: 'godan',
    kind: 'verb',
    label: 'godan: row-shift',
    shortLabel: 'godan',
    concept: 'row-shift',
    aliasText: 'also called う-verb / Group 1',
    decoder: 'final kana moves rows, then ending attaches.',
    recognition: 'The final kana is the moving part; it shifts rows for each ending.',
    example: '書く -> 書かない',
    trap: '帰る and 走る are godan even though they end in る.',
  },
  suru: {
    id: 'suru',
    kind: 'verb',
    label: 'irregular: する',
    shortLabel: 'irregular',
    concept: 'irregular',
    aliasText: 'also called suru / Group 3',
    decoder: 'memorize the する core pattern.',
    recognition: 'The する core changes irregularly: しない, して, できる.',
    example: 'する -> しない',
    trap: 'Treat compound する verbs as a noun plus the irregular する core.',
  },
  kuru: {
    id: 'kuru',
    kind: 'verb',
    label: 'irregular: 来る',
    shortLabel: 'irregular',
    concept: 'irregular',
    aliasText: 'also called kuru / Group 3',
    decoder: 'memorize the 来る core pattern.',
    recognition: '来る changes its root sound by form: き, こ, and く all appear.',
    example: '来る -> 来ない',
    trap: 'Read 来る forms carefully; 来ます is きます, but 来ない is こない.',
  },
  'irregular-adjective': {
    id: 'irregular-adjective',
    kind: 'adjective',
    label: 'irregular い-adjective',
    shortLabel: 'irregular adj',
    aliasText: '',
    decoder: 'use the よい stem outside the present form.',
    recognition: 'いい keeps its present form, but other forms use よ.',
    example: 'いい -> よくない',
    trap: '',
  },
  'i-adjective': {
    id: 'i-adjective',
    kind: 'adjective',
    label: 'い-adjective',
    shortLabel: 'い-adj',
    aliasText: '',
    decoder: 'drop final い, attach adjective ending.',
    recognition: 'The final い changes into adjective endings like かった and くない.',
    example: '高い -> 高くない',
    trap: '',
  },
  'na-adjective': {
    id: 'na-adjective',
    kind: 'adjective',
    label: 'な-adjective',
    shortLabel: 'な-adj',
    aliasText: '',
    decoder: 'keep the base, attach copula or な.',
    recognition: 'It uses な before nouns and だ/です-style endings as a predicate.',
    example: '静か -> 静かではない',
    trap: '',
  },
};

export const GROUP_DECODER_ROWS = [
  {
    id: 'ichidan',
    label: GROUP_DISPLAY.ichidan.label,
    decoder: GROUP_DISPLAY.ichidan.decoder,
    aliasText: GROUP_DISPLAY.ichidan.aliasText,
  },
  {
    id: 'godan',
    label: GROUP_DISPLAY.godan.label,
    decoder: GROUP_DISPLAY.godan.decoder,
    aliasText: GROUP_DISPLAY.godan.aliasText,
  },
  {
    id: 'irregular',
    label: 'irregular',
    decoder: 'memorize the core pattern.',
    aliasText: 'also called する / 来る / Group 3',
  },
];

export const WORD_GROUP_DISPLAY_OPTIONS = Object.freeze(
  ['ichidan', 'godan', 'suru', 'kuru', 'irregular-adjective', 'i-adjective', 'na-adjective'].map(
    (id) => ({
      id,
      label: GROUP_DISPLAY[id].label,
      shortLabel: GROUP_DISPLAY[id].shortLabel,
      aliasText: GROUP_DISPLAY[id].aliasText,
    }),
  ),
);

export const GROUP_SENTENCE_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(GROUP_DISPLAY).map(([id, meta]) => [
      id,
      [meta.label, meta.aliasText ? `(${meta.aliasText})` : ''].filter(Boolean).join(' '),
    ]),
  ),
);

export function getGroupDisplay(group) {
  return (
    GROUP_DISPLAY[group] || {
      id: group || 'unknown',
      kind: 'unknown',
      label: group || 'unknown group',
      shortLabel: group || 'unknown',
      aliasText: '',
      decoder: '',
      recognition: '',
      example: '',
      trap: '',
    }
  );
}

export function groupDisplayLabel(group) {
  return getGroupDisplay(group).label;
}

export function groupShortLabel(group) {
  return getGroupDisplay(group).shortLabel;
}

export function groupAliasText(group) {
  return getGroupDisplay(group).aliasText;
}

export function groupSentenceLabel(group) {
  return GROUP_SENTENCE_LABELS[group] || groupDisplayLabel(group);
}

export function groupRecognitionClue(word) {
  const meta = getGroupDisplay(word?.group);
  const reading = word?.reading || '';
  if (word?.group === 'ichidan') {
    return `${reading} ends in る, and this group drops that final る before endings.`;
  }
  if (word?.group === 'godan') {
    const finalKana = reading.slice(-1);
    if (finalKana === 'る') {
      return `${reading} ends in る, but it is still godan: the final る row-shifts instead of dropping.`;
    }
    return `The final kana ${finalKana} is the godan clue; it row-shifts before the ending attaches.`;
  }
  if (word?.group === 'suru') {
    return 'The する core is irregular, so memorize the small set of し/せ/さ/でき patterns.';
  }
  if (word?.group === 'kuru') {
    return '来る is irregular, so watch for the root sound switching between き, こ, and く.';
  }
  return meta.recognition;
}

export function groupTrapText(word) {
  if (word?.group === 'godan' && (word.reading || '').endsWith('る')) {
    return `${word.dict} is one of the る-ending godan traps, like 帰る and 走る.`;
  }
  return getGroupDisplay(word?.group).trap;
}
