/**
 * Korean particles pick a form from the sound before them, so a name
 * pasted into a sentence needs the right one choosing for it: 화염구가 but
 * 얼음창이, 화염구를 but 얼음창을.
 */

/** True when the last syllable of `word` ends in a consonant. */
function hasFinalConsonant(word: string): boolean {
  const syllable = word.charCodeAt(word.length - 1) - 0xac00;
  return syllable >= 0 && syllable <= 11171 && syllable % 28 !== 0;
}

/** True when that final consonant is ㄹ, which 으로 does not take. */
function endsInRieul(word: string): boolean {
  const syllable = word.charCodeAt(word.length - 1) - 0xac00;
  return syllable >= 0 && syllable <= 11171 && syllable % 28 === 8;
}

/** 이 after a final consonant, 가 after a vowel. */
export function subjectParticle(word: string): string {
  return hasFinalConsonant(word) ? '이' : '가';
}

/** 을 after a final consonant, 를 after a vowel. */
export function objectParticle(word: string): string {
  return hasFinalConsonant(word) ? '을' : '를';
}

/** 으로 after a final consonant, 로 after a vowel or ㄹ. */
export function towardParticle(word: string): string {
  return hasFinalConsonant(word) && !endsInRieul(word) ? '으로' : '로';
}
