const ADJECTIVE_TYPE_RE = /^adj-/;
const CORRUPT_JA_RE = /\?{2,}|�/;
const MISSPELLED_CONGRATULATIONS_RE = /\bcongradulations\b/i;
const GENERIC_VERB_CONDITIONAL_RE = /^if i\b.+\btomorrow,\s*i will feel relieved\.$/i;
const ADJECTIVE_NEGATED_GLOSS_RE = /\bis not (?:be\b|cannot\b|it can't\b|there isn't\b)/i;
const BODY_SENSATION_RE = /\b(?:itchy|ticklish)\b/i;
const BODY_SUBJECT_RE =
  /\b(?:skin|body|foot|feet|hand|hands|arm|arms|leg|legs|back|neck|throat|eye|eyes|scalp)\b/i;
const ADJ_ADVERB_OBJECT_RE = /\bI make the ([a-z][a-z -]*?) [^.]+\.?$/i;
const HUMAN_TRAIT_ADJECTIVE_RE =
  /(?:clever|nervous|patient|quick[- ]tempered|skillful|smart|strong[- ]willed|timid)/i;
const INANIMATE_SUBJECT_RE =
  /(?:air|answer|area|atmosphere|box|chart|color|condition|dish|document|entrance|equipment|explanation|food|item|job|meal|mood|photo|picture|plan|practice|preparations?|problem|procedure|response|result|room|scene|schedule|screen|seat|shelf|shirt color|situation|sky|step|story|street|table|task|tool|wall|weather|work)/i;
const HUMAN_TRAIT_COPULA_RE =
  /\b([a-z][a-z -]*?)\s+(?:is|are|was|were|looks|looked|seems|seemed|feels|felt|gets|got|becomes|became)\s+(?:not\s+|too\s+)?(clever|nervous|patient|quick[- ]tempered|skillful|smart|strong[- ]willed|timid)\b/i;
const HUMAN_TRAIT_ATTRIBUTIVE_RE =
  /\b(?:a|an|the|this|that)\s+(clever|nervous|patient|quick[- ]tempered|skillful|smart|strong[- ]willed|timid)\s+([a-z][a-z -]*?)\b/i;
const HUMAN_TRAIT_ADVERB_RE =
  /\bI make the ([a-z][a-z -]*?)\s+(clever|nervous|patient|quick[- ]tempered|skillful|smart|strong[- ]willed|timid)\b/i;
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

function isVerbConditionalType(type) {
  const value = String(type || '');
  return !ADJECTIVE_TYPE_RE.test(value) && (value.includes('conditional') || value.endsWith('-ba'));
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
  if (isVerbConditionalType(type) && GENERIC_VERB_CONDITIONAL_RE.test(text)) {
    return 'en-generic-verb-conditional-result';
  }
  if (!ADJECTIVE_TYPE_RE.test(String(type || ''))) return '';
  if (ADJECTIVE_NEGATED_GLOSS_RE.test(text)) return 'en-adjective-negated-gloss-mismatch';
  const humanTraitMismatch = humanTraitSubjectMismatch(text);
  if (humanTraitMismatch) return humanTraitMismatch;
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
