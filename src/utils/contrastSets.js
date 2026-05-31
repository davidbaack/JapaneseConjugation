// Contrast pairs for minimal-pair drills. Each pair focuses on two form types
// that learners commonly confuse. Selecting a pair enables only those two types
// so every card in the session is one of the two confusable forms.
export const CONTRAST_SETS = [
  {
    id: 'passive-potential',
    label: 'Passive vs Potential',
    description: 'Both shift the stem — only the ending differs',
    types: ['passive', 'potential'],
  },
  {
    id: 'causative-passive',
    label: 'Causative vs Passive',
    description: 'Both use the A-row vowel change; different social roles',
    types: ['causative', 'passive'],
  },
  {
    id: 'te-form-plain-past',
    label: 'Te-form vs Plain Past',
    description: 'Same consonant mutations; て vs た ending',
    types: ['te-form', 'plain-past'],
  },
  {
    id: 'plain-neg-polite-neg',
    label: 'Plain vs Polite Negative',
    description: 'ない vs ません — register switch on the same concept',
    types: ['plain-negative', 'polite-negative'],
  },
  {
    id: 'conditional-ba-tara',
    label: 'ば vs たら Conditional',
    description: 'Both mean "if"; ば is hypothetical, たら is sequential',
    types: ['conditional-ba', 'conditional-tara'],
  },
  {
    id: 'volitional-polite',
    label: 'Volitional vs Polite Volitional',
    description: 'よう vs ましょう — casual vs polite proposal',
    types: ['volitional', 'polite-volitional'],
  },
];
