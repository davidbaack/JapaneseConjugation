// Minimal i18n runtime (improvement #19).
//
// Goals: zero dependencies, a single `t(key, vars)` entry point, {placeholder}
// interpolation, a registry so locales can be added later, and graceful
// fallback (missing key → its English value → the key itself). This is
// deliberately small "scaffolding": adopting it across the app is incremental,
// but new strings now have one home.

import en from './en.js';

const catalogs = { en };
const FALLBACK_LOCALE = 'en';
let currentLocale = FALLBACK_LOCALE;

// Register (or extend) a locale catalog. Example: registerCatalog('ja', {...}).
export function registerCatalog(locale, catalog) {
  catalogs[locale] = { ...(catalogs[locale] || {}), ...catalog };
}

export function setLocale(locale) {
  currentLocale = catalogs[locale] ? locale : FALLBACK_LOCALE;
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

// Pick a supported locale from the browser, falling back to English.
export function detectLocale(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  const langs =
    navigatorLike?.languages || (navigatorLike?.language ? [navigatorLike.language] : []);
  for (const lang of langs) {
    const base = String(lang).toLowerCase().split('-')[0];
    if (catalogs[base]) return base;
  }
  return FALLBACK_LOCALE;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

// Translate a key with optional interpolation vars. Resolution order:
// current locale → English fallback → the key itself (so a missing string is
// visible in development rather than rendering blank).
export function t(key, vars) {
  const fromLocale = catalogs[currentLocale]?.[key];
  const fromFallback = catalogs[FALLBACK_LOCALE]?.[key];
  const template = fromLocale ?? fromFallback ?? key;
  return interpolate(template, vars);
}
