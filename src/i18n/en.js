// English string catalog (improvement #19 — i18n scaffolding).
//
// All user-facing strings should live here keyed by a dotted namespace so a
// future locale only needs to translate this one file. Use {name} placeholders
// for interpolation (see t() in ./index.js). Nav labels feed a capitalize-on-
// display style, so single-word labels stay lowercase here; multi-word labels
// carry their exact casing.
export default {
  'app.title': 'Katachiya',
  'app.subtitle': 'Japanese Conjugation SRS',

  'nav.study': 'study',
  'nav.check': 'Conjugation Check',
  'nav.classify': 'Which Group?',
  'nav.endings': 'て Forms',
  'nav.games': 'games',
  'nav.insights': 'insights',
  'nav.library': 'library',
  'nav.settings': 'settings',

  'header.session': '{correct}/{reviewed} this session',
  'header.today': '{count}/{goal} today',
  'header.goalStreak': '{days} day goal streak',

  'sync.syncing': 'syncing',
  'sync.error': 'sync error',
  'sync.synced': 'synced',

  'common.loading': 'Loading…',
};
