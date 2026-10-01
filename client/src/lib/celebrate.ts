import confetti from 'canvas-confetti';

const COLORS = ['#ff7eb6', '#ffd36e', '#7ee0c3', '#b9a6ff', '#8fd7f7'];

/** A two-sided confetti burst for unlocking a new country. */
export function celebrate() {
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.75 }, colors: COLORS, shapes: ['circle', 'star'] });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.75 }, colors: COLORS, shapes: ['circle', 'star'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
