const ADJECTIVE_TYPE_RE = /^adj-/;
const BODY_SENSATION_RE = /\b(?:itchy|ticklish)\b/i;
const BODY_SUBJECT_RE =
  /\b(?:skin|body|foot|feet|hand|hands|arm|arms|leg|legs|back|neck|throat|eye|eyes|scalp)\b/i;
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

/**
 * Flags English sentence-context rows that are grammatical enough to pass
 * syntax checks but pair an adjective with a subject that makes the Practice
 * prompt feel untrustworthy.
 *
 * @param {{ en?: string, type?: string }} row
 * @returns {string}
 */
export function sentenceSemanticQualityIssue({ en = '', type = '' } = {}) {
  if (!ADJECTIVE_TYPE_RE.test(String(type || ''))) return '';
  const text = String(en || '').trim();
  if (!text) return '';
  if (BODY_SENSATION_RE.test(text) && !BODY_SUBJECT_RE.test(text)) {
    return 'en-adjective-body-context-mismatch';
  }
  return ADJECTIVE_CONTEXT_MISMATCHES.find((rule) => rule.pattern.test(text))?.reason || '';
}
