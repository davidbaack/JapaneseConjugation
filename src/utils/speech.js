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
