// English string catalog (improvement #19 — i18n scaffolding).
//
// All user-facing strings should live here keyed by a dotted namespace so a
// future locale only needs to translate this one file. Use {name} placeholders
// for interpolation (see t() in ./index.js). Nav labels are intentionally
// lowercase to match the existing capitalize-on-display styling.
export default {
  'app.title': 'Katachiya',
  'app.tagline': 'Spaced repetition, reference tables, and AI coaching',

  'nav.study': 'study',
  'nav.check': 'check',
  'nav.rush': 'rush',
  'nav.classify': 'classify',
  'nav.endings': 'endings',
  'nav.mistakes': 'mistakes',
  'nav.levels': 'levels',
  'nav.stats': 'stats',
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
