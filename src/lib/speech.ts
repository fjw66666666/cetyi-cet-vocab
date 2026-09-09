// Web Speech API 发音（英音/美音可切换）
let voicesCache: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  voicesCache = speechSynthesis.getVoices();
}

if (typeof speechSynthesis !== 'undefined') {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(lang: 'en-GB' | 'en-US'): SpeechSynthesisVoice | null {
  if (!voicesCache.length) refreshVoices();
  const exact = voicesCache.find((v) => v.lang === lang);
  if (exact) return exact;
  const prefix = voicesCache.find((v) => v.lang.startsWith(lang.split('-')[0]));
  return prefix ?? null;
}

export function speak(text: string, lang: 'en-GB' | 'en-US' = 'en-GB', rate = 0.92): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export function stopSpeak(): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
}

export const speechSupported = typeof speechSynthesis !== 'undefined';
