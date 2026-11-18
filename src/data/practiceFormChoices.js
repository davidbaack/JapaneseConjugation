import { ALL_CARD_TYPES, FORM_GROUPS } from './conjugationTypes.js';
import { PRACTICE_CATEGORIES, practiceDimensionsForType } from './practiceTaxonomy.js';

// Browsing sections never select a family. Past belongs with the basic forms,
// rather than appearing twice under Basic and Te/Ta Sound Changes.
export const PRACTICE_FORM_SECTIONS = [
  {
    id: 'basic-forms',
    label: 'Basic forms',
    typeIds: PRACTICE_CATEGORIES.find((category) => category.id === 'core-forms').typeIds,
  },
  { id: 'te-form', label: 'Te-form', typeIds: ['te-form'] },
  ...FORM_GROUPS.filter((group) => !['basic-tenses', 'te-ta-sound-changes'].includes(group.id)),
];

const BASIC_MEANINGS = {
  'plain-present': 'do / will do (dictionary form)',
  'polite-present': 'do / will do',
  'plain-past': 'did',
  'polite-past': 'did',
  'plain-negative': 'do not / will not do',
  'polite-negative': 'do not / will not do',
  'plain-past-negative': 'did not do',
  'polite-past-negative': 'did not do',
  'te-form': 'connect actions',
};

function choiceLabel(type) {
  const dimensions = practiceDimensionsForType(type.id);
  const base = type.label
    .replace(/^Adj\. /, 'Adjective ')
    .replace(/^Tai(?:-form)?/, 'Wanting (たい)')
    .replace('Causative Passive', 'Causative-passive')
    .replace(/\b(?:Plain|Polite|Past|Negative)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace('Present', 'Non-past');
  const variant = [
    dimensions.time === 'past' ? 'past' : '',
    dimensions.polarity === 'negative' ? 'negative' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const name = base || (variant ? variant[0].toUpperCase() + variant.slice(1) : 'Non-past');
  return [name, base ? variant : '', dimensions.style === 'neutral' ? '' : dimensions.style]
    .filter(Boolean)
    .join(' · ');
}

export const PRACTICE_FORM_CHOICES = ALL_CARD_TYPES.map((type) => ({
  ...type,
  choiceLabel: choiceLabel(type),
  meaning: BASIC_MEANINGS[type.id] || type.hint.replaceAll('~', '…'),
}));

export const PRACTICE_FORM_CHOICE_BY_ID = new Map(
  PRACTICE_FORM_CHOICES.map((type) => [type.id, type]),
);
