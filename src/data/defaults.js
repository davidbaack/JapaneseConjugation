export const STORAGE_KEY = 'jp-verb-srs-v2';

export const DEFAULT_SYNC = {url:'',anonKey:'',syncId:'',enabled:false};

export const DEFAULT_PREFS = {
  answerMode: 'input',
  drillDirection: 'forward',
  autoSpeak: false,
  listeningPrompt: false,
  autoAdvanceCorrect: false,
  autoAiExplainErrors: false,
  englishHints: 'show',
  practiceFocus: 'balanced',
  skipDuplicateForms: true,
  trickQuestions: false,
  voiceURI: '',
  theme: 'system',
  aiFeedbackLevel: 'beginner',
  aiGuideTone: 'sensei',
  dailyGoal: 10,
  scriptMode: 'kanji',
  displayScripts: {kanji:true,kana:true,romaji:false},
  furigana: true,
  promptForm: 'dictionary',
  durationSec: 0,
  reviewLimit: 0,
  jlptLevels: ['N5','N4','N3','N2','N1'],
  genkiLessons: [],
  wordTypes: ['verb','i-adjective','na-adjective'],
  wordGroups: ['ichidan','godan','suru','kuru','irregular-adjective','i-adjective','na-adjective'],
  wordListIds: [],
  drillMode: 'word',
  colorCodeConjugations: true,
  kanaMatchDisplay: 'none'
};
