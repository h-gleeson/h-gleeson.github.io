import type { Engine } from './Engine';

/** The single live engine, for actions that need scene queries (fit, thumbnails). */
let current: Engine | null = null;
export const setEngine = (e: Engine | null) => {
  current = e;
};
export const getEngine = () => current;
