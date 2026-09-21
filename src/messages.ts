// ✎ EDIT ME — every word Kay sees lives here. Plain text, change freely.

/** The personal note on the start screen. Replace this with your own words. */
export const START_NOTE = {
  title: 'For Kay',
  body: 'Made this for you, Moopit. Get well! Listen to the doctors, okay?',
  signoff: '— Love you',
};

/** The note on the game-over screen. */
export const END_NOTE = {
  body: 'Pfft - I could do better!',
  signoff: '— Love you',
};

/** Shown in the corner now and then while playing. */
export const RANDOM_MESSAGES = [
  "You've got this, Moopit 💜",
  'One more line for Kay 🌸',
  'Rest and recover, my love 💗',
  'Moopit is strong ✨',
  "Thinking of you in the ICU — play when you're ready 💜",
  'Take your time. No rush at all 🌙',
  'So proud of you 💗',
  'Every little bit counts 🌷',
];

export const LINE_MESSAGES = [
  'Lovely 💗',
  'Nice one, Moopit ✨',
  'Look at you go 🌸',
  'Beautiful 💜',
];

export const TETRIS_MESSAGES = [
  'TETRIS! Moopit is amazing ✨💗',
  'Four lines! Kay, you star 🌟',
];

export const LEVEL_MESSAGES = [
  'Level up — so strong, Moopit 💪💜',
  'Level up! One more for Kay 🌸',
  'Onward, gently 💗',
];

export const PAUSE_MESSAGE = "Take a rest, Moopit. I'll be right here. 💜";

export const WATERMARK = 'Moopit ♡';

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
