import { useSyncExternalStore } from 'react';

/** True on the Developer site (`vite --mode developer`, localhost:5174, sandbox data). */
export const DEV = import.meta.env.MODE === 'developer';

const KEY = 'dev-reveal-all';
const listeners = new Set<() => void>();

function read() {
  try {
    return DEV && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Developer "show everything" switch: draw every country/province as unlocked, with all cities. */
export function setRevealAll(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: the switch just won't persist
  }
  listeners.forEach((l) => l());
}

export function useRevealAll() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}
