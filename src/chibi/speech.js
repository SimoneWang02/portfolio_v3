// Lip sync from text: the reply is "said" letter by letter at a speaking pace, and each letter sets how far
// the mouth opens. Punctuation holds it shut for a beat; markdown symbols are skipped over.

const OPEN = {
  a: 1, o: 0.9, e: 0.65, h: 0.5, u: 0.5, i: 0.45, y: 0.45, l: 0.4, w: 0.35, r: 0.35,
  f: 0.15, v: 0.15, m: 0, b: 0, p: 0,
};

// 0 (closed) .. 1 (wide open)
export function mouthFor(ch) {
  const c = ch.normalize("NFD")[0].toLowerCase(); // à -> a
  if (c in OPEN) return OPEN[c];
  if (/[a-z]/.test(c)) return 0.3;                // other consonants
  if (/[0-9]/.test(c)) return 0.55;
  return 0.05;                                    // spaces, punctuation, symbols
}

// how many letters' worth of time a character takes to say
export function durationOf(ch) {
  if (/[.!?\n]/.test(ch)) return 5;
  if (/[,;:]/.test(ch)) return 2.5;
  if (/[*#_`>~|[\]()]/.test(ch)) return 0.2;
  return 1;
}

// speaking pace in letters per second: catches up when the reply streams in faster than it's said
export const paceFor = (backlog) => Math.min(45, Math.max(14, 14 + (backlog - 30) * 0.3));

// words that refer to the speaker, for a hand-on-chest gesture
export const isSelfWord = (word) => /^(i|i'm|i've|i'd|i'll|me|my|mine|myself)$/i.test(word);
