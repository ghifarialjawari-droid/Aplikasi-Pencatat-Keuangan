/* Suara sapaan memakai Web Speech API bawaan browser (gratis, tanpa file audio). */

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// Pagi (<11), siang (<15), sore (<18), malam (selebihnya)
export const greetingWord = (date = new Date()) => {
  const h = date.getHours();
  return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
};

export const greetingText = (name, date = new Date()) => `Selamat ${greetingWord(date)}, ${name}`;

const pickIndonesianVoice = () => {
  const voices = window.speechSynthesis.getVoices?.() || [];
  return voices.find((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('id')) || null;
};

/** Mengucapkan teks. Mengembalikan false jika browser tidak mendukung. */
export function speak(text, { onStart, onEnd } = {}) {
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = 'id-ID';
  const voice = pickIndonesianVoice();
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.pitch = 1.05;
  u.volume = 1;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
