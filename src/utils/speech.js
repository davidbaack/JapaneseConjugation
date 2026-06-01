export function getJapaneseVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis?.getVoices) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.filter(
    (v) =>
      /^ja([-_]|$)/i.test(v.lang || '') ||
      /Japanese|Kyoko|Otoya|Haruka|Ichiro|Sayaka|Hattori/i.test(v.name || ''),
  );
}

export function pickSpeechVoice(voiceURI) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voiceURI) {
    const v = voices.find((v) => v.voiceURI === voiceURI);
    if (v) return v;
  }
  // Try to find a Japanese voice
  const jp = voices.find((v) => v.lang === 'ja-JP' || v.lang.replace('_', '-').startsWith('ja'));
  if (jp) return jp;
  return null;
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function speechRecognitionErrorMessage(error) {
  const messages = {
    'not-allowed': 'Microphone permission was blocked.',
    'service-not-allowed': 'Speech input is blocked in this browser.',
    'audio-capture': 'No microphone was found.',
    'no-speech': 'No speech was heard. Try again.',
    network: 'Speech input could not reach the browser service.',
    aborted: 'Speech input was stopped.',
  };
  return messages[error] || 'Speech input stopped before an answer was heard.';
}

export function speakJapanese(text, rate = 0.9, voiceURI = '', onEnd = null) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickSpeechVoice(voiceURI);
  u.lang = 'ja-JP';
  u.rate = rate;
  if (voice) u.voice = voice;
  if (typeof onEnd === 'function') {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  window.speechSynthesis.speak(u);
}

// ============================================================================
// PRE-RECORDED PRONUNCIATION (improvement #18)
//
// Web Speech voices vary wildly across platforms, so we allow higher-quality
// pre-recorded clips for core vocabulary. A clip source is resolved from (in
// order) an explicit manifest, then a configurable CDN base URL; if neither
// yields a playable clip we fall back to TTS — so behavior is unchanged until
// recordings are actually provided.
// ============================================================================

const audioManifest = new Map();

// Register reading→URL clips (e.g. from a packaged manifest or a vocab pack).
export function registerAudioClips(entries = {}) {
  for (const [key, url] of Object.entries(entries)) {
    if (key && url) audioManifest.set(key, url);
  }
}

export function clearAudioClips() {
  audioManifest.clear();
}

const AUDIO_BASE_URL = (import.meta.env?.VITE_AUDIO_BASE_URL || '').replace(/\/$/, '');

// Resolve a clip URL for some Japanese text, or null if none is known.
export function audioClipUrl(text, { baseUrl = AUDIO_BASE_URL, manifest = audioManifest } = {}) {
  if (!text) return null;
  if (manifest.has(text)) return manifest.get(text);
  if (baseUrl) return `${baseUrl}/${encodeURIComponent(text)}.mp3`;
  return null;
}

// Play a pronunciation: prefer a recorded clip, fall back to TTS on miss or
// playback failure. Drop-in superset of speakJapanese's signature.
export function playPronunciation(text, rate = 0.9, voiceURI = '', onEnd = null) {
  const url = audioClipUrl(text);
  if (!url || typeof Audio === 'undefined') {
    speakJapanese(text, rate, voiceURI, onEnd);
    return;
  }
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    const audio = new Audio(url);
    audio.playbackRate = rate < 0.5 ? 0.5 : rate; // clamp to a sane minimum
    if (typeof onEnd === 'function') audio.onended = onEnd;
    // On any load/playback error, fall back to TTS so the user still hears it.
    audio.onerror = () => speakJapanese(text, rate, voiceURI, onEnd);
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => speakJapanese(text, rate, voiceURI, onEnd));
    }
  } catch {
    speakJapanese(text, rate, voiceURI, onEnd);
  }
}
