const ADJECTIVE_TYPE_RE = /^adj-/;
const CORRUPT_JA_RE = /\?{2,}|�/;
const MISSPELLED_CONGRATULATIONS_RE = /\bcongradulations\w*\b/i;
const GENERIC_VERB_CONDITIONAL_RE = /^if i\b.+\btomorrow,\s*i will feel relieved\.$/i;
const BAD_ENGLISH_GERUND_RE = /\bruning\b/i;
const DANGLING_PREPOSITION_TIME_RE =
  /\b(?:with|to|for|from|over|into|on|about|of|after)\s+(?:today(?!['\u2019])|this morning|after class|before leaving|at work)\b/i;
const STALE_NEGATIVE_TE_GO_HOME_RE = /^I go home\b.+\bwithout\b/i;
const ADJECTIVE_NEGATED_GLOSS_RE = /\bis not (?:be\b|cannot\b|it can't\b|there isn't\b)/i;
const BODY_SENSATION_RE = /\b(?:itchy|ticklish)\b/i;
const BODY_SUBJECT_RE =
  /\b(?:skin|body|foot|feet|hand|hands|arm|arms|leg|legs|back|neck|throat|eye|eyes|scalp)\b/i;
const ADJ_ADVERB_OBJECT_RE = /\bI make the ([a-z][a-z -]*?) [^.]+\.?$/i;
const HUMAN_TRAIT_ADJECTIVE_RE =
  /(?:apologetic|careful|clever|competitive|diligent|eager|envious|familiar|grateful|greedy|happy|hungry|impolite|impudent|intimate|kind|likable|lonely|mischievous|miserable|nervous|obedient|patient|polite|quick[- ]tempered|sad|serious|skillful|sleepy|smart|sore|strong[- ]willed|tender-hearted|timid|young|youthful)/i;
const INANIMATE_SUBJECT_RE =
  /(?:air|answer|area|atmosphere|box|chart|color|condition|current state|dish|discussion|document|entrance|equipment|explanation|food|item|job|meal|meeting flow|mood|morning air|next step|photo|picture|plan|practice|preparations?|problem|procedure|proposal|response|result|room|scene|schedule|screen|seat|shelf|shirt color|situation|sky|step|story|street|surroundings|table|task|tool|wall|weather|work)/i;
const ABSTRACT_SUBJECT_RE =
  /(?:answer|condition|current state|discussion|explanation|job|meeting flow|mood|next step|plan|practice|preparations?|problem|procedure|proposal|response|result|scene|schedule|situation|step|story|task|work)/i;
const BAD_ADJECTIVE_GLOSS_RE =
  /\b(?:is|are|was|were|looks|looked|gets|got|becomes|became)\s+(?:not\s+|too\s+)?(?:have a headache|looking forward to|how|fawn|manner|trick|overcoat|injustice|neglect|seriousness|kindness|disadvantage|unpleasent|competetive|very like-able|very hard|very much|here and there)\b/i;
const ABSTRACT_BAD_ADJECTIVE_RE =
  /(?:apologetic|careful|cute|envious|familiar|fishy|grateful|greedy|happy|impudent|intimate|lonely|miserable|obedient|polite|round|sad|sleepy|smoky|square|stinky|tall|tender-hearted|thick|young|youthful)/i;
const ABSTRACT_BAD_COPULA_RE =
  /\b([a-z][a-z -]*?)\s+(?:is|are|was|were|looks|looked|seems|seemed|feels|felt|gets|got|becomes|became)\s+(?:not\s+|too\s+)?(apologetic|careful|cute|envious|familiar|fishy|grateful|greedy|happy|impudent|intimate|lonely|miserable|obedient|polite|round|sad|sleepy|smoky|square|stinky|tall|tender-hearted|thick|young|youthful)\b/i;
const HUMAN_TRAIT_COPULA_RE =
  /\b([a-z][a-z -]*?)\s+(?:is|are|was|were|looks|looked|seems|seemed|feels|felt|gets|got|becomes|became)\s+(?:not\s+|too\s+)?(apologetic|careful|clever|competitive|diligent|eager|envious|familiar|grateful|greedy|happy|hungry|impolite|impudent|intimate|kind|likable|lonely|mischievous|miserable|nervous|obedient|patient|polite|quick[- ]tempered|sad|serious|skillful|sleepy|smart|sore|strong[- ]willed|tender-hearted|timid|young|youthful)\b/i;
const HUMAN_TRAIT_ATTRIBUTIVE_RE =
  /\b(?:a|an|the|this|that)\s+(apologetic|careful|clever|competitive|diligent|eager|envious|familiar|grateful|greedy|happy|hungry|impolite|impudent|intimate|kind|likable|lonely|mischievous|miserable|nervous|obedient|patient|polite|quick[- ]tempered|sad|serious|skillful|sleepy|smart|sore|strong[- ]willed|tender-hearted|timid|young|youthful)\s+([a-z][a-z -]*?)\b/i;
const HUMAN_TRAIT_ADVERB_RE =
  /\bI make the ([a-z][a-z -]*?)\s+(apologetic|careful|clever|competitive|diligent|eager|envious|familiar|grateful|greedy|happy|hungry|impolite|impudent|intimate|kind|likable|lonely|mischievous|miserable|nervous|obedient|patient|polite|quick[- ]tempered|sad|serious|skillful|sleepy|smart|sore|strong[- ]willed|tender-hearted|timid|young|youthful)\b/i;
const EN_STUDENT_RE = /\bthe student\b/i;
const JA_HUMAN_CONTEXT_RE =
  /(?:学生|生徒|子ども|友だち|友達|先生|母|父|兄|弟|姉|妹|人|店員|担当者)/u;
/** @type {Array<[string, string[]]>} */
const ADJ_ADVERB_JA_OBJECTS = [
  ['予定', ['plan', 'schedule']],
  ['説明', ['explanation']],
  ['服', ['clothes', 'outfit']],
  ['部屋', ['room']],
  ['道具', ['tool', 'tools']],
  ['席', ['seat']],
  ['写真', ['photo', 'picture']],
  ['入口', ['entrance']],
  ['画面', ['screen']],
  ['資料', ['material', 'materials', 'document', 'documents']],
  ['表', ['chart', 'table']],
  ['棚', ['shelf']],
  ['料理', ['dish', 'food', 'meal']],
  ['文章', ['text', 'sentence', 'writing']],
  ['空気', ['air', 'atmosphere']],
  ['壁', ['wall']],
  ['話', ['story', 'conversation', 'talk']],
];
const ADJECTIVE_CONTEXT_MISMATCHES = [
  {
    reason: 'en-adjective-body-context-mismatch',
    pattern:
      /\b(?:task|work|job|plan|schedule|mood|atmosphere|response|box|shop|room|area|explanation|answer|preparations?|practice|step|procedure|situation|scene)\s+(?:is|was|looks|looked|seems|seemed|feels|felt|gets|got|becomes|became)\s+(?:itchy|ticklish)\b/i,
  },
  {
    reason: 'en-adjective-object-context-mismatch',
    pattern: /\bgood-for-nothing\b/i,
  },
  {
    reason: 'en-adjective-response-context-mismatch',
    pattern:
      /\b(?:response|reply|service|reception desk'?s response|practice|plan|schedule)\s+(?:is|was|looks|looked|seems|seemed|feels|felt)\s+(?:lovely|cute)\b/i,
  },
  {
    reason: 'en-adjective-task-context-mismatch',
    pattern:
      /\b(?:task|work|job|step|procedure|preparations?)\s+(?:is|was|looks|looked|seems|seemed|feels|felt)\s+tight\b/i,
  },
];

function normalizeEnglishObject(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function adjAdverbJaObject(jaTemplate) {
  const text = String(jaTemplate || '');
  const match = text.match(/私は(.+?)を\{w\}する。/u);
  if (!match) return '';
  return match[1];
}

function adjAdverbObjectMismatch({ en = '', type = '', jaTemplate = '' } = {}) {
  if (type !== 'adj-adverb') return '';
  const enMatch = String(en || '').match(ADJ_ADVERB_OBJECT_RE);
  if (!enMatch) return '';
  const jaObject = adjAdverbJaObject(jaTemplate);
  const expected = ADJ_ADVERB_JA_OBJECTS.find(([ja]) => ja === jaObject)?.[1];
  if (!expected) return '';
  const enObject = normalizeEnglishObject(enMatch[1]);
  return expected.some((candidate) => enObject.includes(candidate))
    ? ''
    : 'en-ja-adverb-object-mismatch';
}

function humanTraitSubjectMismatch(en) {
  const text = String(en || '');
  if (!HUMAN_TRAIT_ADJECTIVE_RE.test(text)) return '';
  const copula = text.match(HUMAN_TRAIT_COPULA_RE);
  if (copula && INANIMATE_SUBJECT_RE.test(copula[1])) {
    return 'en-adjective-human-trait-context-mismatch';
  }
  const attributive = text.match(HUMAN_TRAIT_ATTRIBUTIVE_RE);
  if (attributive && INANIMATE_SUBJECT_RE.test(attributive[2])) {
    return 'en-adjective-human-trait-context-mismatch';
  }
  const adverb = text.match(HUMAN_TRAIT_ADVERB_RE);
  if (adverb && INANIMATE_SUBJECT_RE.test(adverb[1])) {
    return 'en-adjective-human-trait-context-mismatch';
  }
  return '';
}

function abstractAdjectiveSubjectMismatch(en) {
  const text = String(en || '');
  if (!ABSTRACT_BAD_ADJECTIVE_RE.test(text)) return '';
  const copula = text.match(ABSTRACT_BAD_COPULA_RE);
  if (copula && ABSTRACT_SUBJECT_RE.test(copula[1])) {
    return 'en-adjective-abstract-context-mismatch';
  }
  return '';
}

function jaEnglishSubjectMismatch({ en = '', jaTemplate = '' } = {}) {
  const ja = String(jaTemplate || '');
  if (!ja) return '';
  if (EN_STUDENT_RE.test(String(en || '')) && !JA_HUMAN_CONTEXT_RE.test(ja)) {
    return 'ja-en-adjective-subject-mismatch';
  }
  return '';
}

function isVerbConditionalType(type) {
  const value = String(type || '');
  return !ADJECTIVE_TYPE_RE.test(value) && (value.includes('conditional') || value.endsWith('-ba'));
}

function isNegativeTeType(type) {
  return ['negative-te', 'negative-te-connective', 'negative-zuni'].includes(String(type || ''));
}

/**
 * Flags English sentence-context rows that are grammatical enough to pass
 * syntax checks but pair an adjective with a subject that makes the Practice
 * prompt feel untrustworthy.
 *
 * @param {{ en?: string, type?: string, jaTemplate?: string }} row
 * @returns {string}
 */
export function sentenceSemanticQualityIssue({ en = '', type = '', jaTemplate = '' } = {}) {
  const text = String(en || '').trim();
  if (!text) return '';
  if (MISSPELLED_CONGRATULATIONS_RE.test(text)) return 'en-misspelled-congratulations';
  if (BAD_ENGLISH_GERUND_RE.test(text)) return 'en-bad-gerund';
  if (DANGLING_PREPOSITION_TIME_RE.test(text)) return 'en-dangling-preposition-time';
  if (isNegativeTeType(type) && STALE_NEGATIVE_TE_GO_HOME_RE.test(text)) {
    return 'en-negative-te-stale-go-home';
  }
  if (isVerbConditionalType(type) && GENERIC_VERB_CONDITIONAL_RE.test(text)) {
    return 'en-generic-verb-conditional-result';
  }
  if (!ADJECTIVE_TYPE_RE.test(String(type || ''))) return '';
  if (ADJECTIVE_NEGATED_GLOSS_RE.test(text)) return 'en-adjective-negated-gloss-mismatch';
  if (BAD_ADJECTIVE_GLOSS_RE.test(text)) return 'en-adjective-bad-gloss-fragment';
  const jaEnMismatch = jaEnglishSubjectMismatch({ en: text, jaTemplate });
  if (jaEnMismatch) return jaEnMismatch;
  const humanTraitMismatch = humanTraitSubjectMismatch(text);
  if (humanTraitMismatch) return humanTraitMismatch;
  const abstractMismatch = abstractAdjectiveSubjectMismatch(text);
  if (abstractMismatch) return abstractMismatch;
  if (BODY_SENSATION_RE.test(text) && !BODY_SUBJECT_RE.test(text)) {
    return 'en-adjective-body-context-mismatch';
  }
  const objectMismatch = adjAdverbObjectMismatch({ en: text, type, jaTemplate });
  if (objectMismatch) return objectMismatch;
  return ADJECTIVE_CONTEXT_MISMATCHES.find((rule) => rule.pattern.test(text))?.reason || '';
}

/**
 * Flags a complete sentence row when either side is too corrupted or when the
 * Japanese and English contexts contradict each other.
 *
 * @param {{ en?: string, type?: string, jaTemplate?: string }} row
 * @returns {string}
 */
export function sentenceRowQualityIssue({ en = '', type = '', jaTemplate = '' } = {}) {
  if (CORRUPT_JA_RE.test(String(jaTemplate || ''))) return 'ja-corrupt-question-marks';
  return sentenceSemanticQualityIssue({ en, type, jaTemplate });
}
