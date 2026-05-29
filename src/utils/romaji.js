export const ROMAJI_MAP = {
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  shi: 'し',
  cha: 'ちゃ',
  chu: 'ちゅ',
  cho: 'ちょ',
  chi: 'ち',
  tsu: 'つ',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  ji: 'じ',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  sa: 'さ',
  su: 'す',
  se: 'せ',
  so: 'そ',
  si: 'し',
  za: 'ざ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  zi: 'じ',
  ta: 'た',
  te: 'て',
  to: 'と',
  ti: 'ち',
  tu: 'つ',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  fu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  hu: 'ふ',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wo: 'を',
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
};

export const ROMAJI_PREFIXES = new Set(
  Object.keys(ROMAJI_MAP).flatMap((k) =>
    Array.from({ length: k.length - 1 }, (_, i) => k.slice(0, i + 1)),
  ),
);

export const ROMAJI_LONG_VOWELS = {
  ā: 'aa',
  â: 'aa',
  ī: 'ii',
  î: 'ii',
  ū: 'uu',
  û: 'uu',
  ē: 'ee',
  ê: 'ee',
  ō: 'ou',
  ô: 'ou',
  Ā: 'aa',
  Â: 'aa',
  Ī: 'ii',
  Î: 'ii',
  Ū: 'uu',
  Û: 'uu',
  Ē: 'ee',
  Ê: 'ee',
  Ō: 'ou',
  Ô: 'ou',
};

export function normalizeRomajiInput(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[āâīîūûēêōôĀÂĪÎŪÛĒÊŌÔ]/g, (ch) => ROMAJI_LONG_VOWELS[ch] || ch);
}

export function toHiragana(s) {
  if (!s) return '';
  s = normalizeRomajiInput(s).toLowerCase().trim();
  let out = '',
    i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '’' || ch === 'ʼ') {
      i++;
      continue;
    }
    if (ch.charCodeAt(0) > 127) {
      out += ch;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === 'n') {
      const nx = s[i + 1];
      if (nx === undefined || nx === 'n' || !/[aiueoy]/.test(nx)) {
        out += 'ん';
        i++;
        continue;
      }
    }
    if (i < s.length - 1 && /[bcdfghjkmpqrstvwxyz]/.test(ch) && s[i] === s[i + 1]) {
      out += 'っ';
      i++;
      continue;
    }
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      const sub = s.slice(i, i + len);
      if (ROMAJI_MAP[sub]) {
        out += ROMAJI_MAP[sub];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += ch;
      i++;
    }
  }
  return out;
}

export function toHiraganaProgress(s) {
  if (!s) return '';
  s = normalizeRomajiInput(s).toLowerCase().trim();
  let out = '',
    i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '’' || ch === 'ʼ') {
      i++;
      continue;
    }
    if (ch.charCodeAt(0) > 127) {
      out += ch;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === 'n') {
      const nx = s[i + 1];
      if (nx === undefined) break;
      if (nx === 'n' || !/[aiueoy]/.test(nx)) {
        out += 'ん';
        i++;
        continue;
      }
    }
    if (i < s.length - 1 && /[bcdfghjkmpqrstvwxyz]/.test(ch) && s[i] === s[i + 1]) {
      out += 'っ';
      i++;
      continue;
    }
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      const sub = s.slice(i, i + len);
      if (ROMAJI_MAP[sub]) {
        out += ROMAJI_MAP[sub];
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const rest = s.slice(i);
    if (/^[a-z]+$/.test(rest) && ROMAJI_PREFIXES.has(rest)) break;
    out += ch;
    i++;
  }
  return out;
}

export const HIRAGANA_TO_ROMAJI = {};
for (const [rom, kana] of Object.entries(ROMAJI_MAP)) {
  if (!HIRAGANA_TO_ROMAJI[kana]) HIRAGANA_TO_ROMAJI[kana] = rom;
}
HIRAGANA_TO_ROMAJI['ん'] = 'n';

export function kanaToRomaji(s) {
  if (!s) return '';
  const hira = String(s)
    .normalize('NFKC')
    .replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  let out = '',
    i = 0;
  while (i < hira.length) {
    const ch = hira[i];
    if (ch === 'っ') {
      const next =
        HIRAGANA_TO_ROMAJI[hira.slice(i + 1, i + 3)] || HIRAGANA_TO_ROMAJI[hira[i + 1]] || '';
      out += next.startsWith('ch') ? 't' : next[0] || '';
      i++;
      continue;
    }
    const pair = hira.slice(i, i + 2);
    if (HIRAGANA_TO_ROMAJI[pair]) {
      out += HIRAGANA_TO_ROMAJI[pair];
      i += 2;
      continue;
    }
    if (HIRAGANA_TO_ROMAJI[ch]) {
      out += HIRAGANA_TO_ROMAJI[ch];
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function isAllKana(s) {
  if (!s) return false;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (!((c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff))) return false;
  }
  return true;
}

export const KANA_PAD_ROWS = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', 'ゆ', 'よ', 'わ', 'を'],
  ['ら', 'り', 'る', 'れ', 'ろ', 'ん'],
  ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  ['だ', 'ぢ', 'づ', 'で', 'ど'],
  ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'],
  ['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ー'],
];
