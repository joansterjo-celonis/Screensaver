export type ShuffleSeed = string | number;

function hashSeed(seed: ShuffleSeed) {
  const value = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: ShuffleSeed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPageLoadSeed() {
  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.getRandomValues) {
    const entropy = new Uint32Array(4);
    cryptoSource.getRandomValues(entropy);
    return Array.from(entropy, (value) => value.toString(36)).join("-");
  }

  const highResolutionTime = globalThis.performance?.now?.() ?? 0;
  return `${Date.now().toString(36)}-${highResolutionTime.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function shuffleWithSeed<T>(
  values: readonly T[],
  seed: ShuffleSeed,
): T[] {
  const shuffled = [...values];
  const random = seededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function shuffledCycle<T>(
  values: readonly T[],
  seed: ShuffleSeed,
  cycle = 0,
  itemKey: (value: T) => string | number = (value) => String(value),
): T[] {
  const safeCycle = Number.isFinite(cycle) ? Math.max(0, Math.floor(cycle)) : 0;
  const shuffled = shuffleWithSeed(values, `${seed}:cycle:${safeCycle}`);
  if (safeCycle === 0 || shuffled.length < 2) return shuffled;

  // A cycle is a complete permutation. Keep its boundary from showing the
  // previous cycle's final item twice in a row.
  const previous = shuffleWithSeed(values, `${seed}:cycle:${safeCycle - 1}`);
  const previousLastKey = itemKey(previous[previous.length - 1]);
  if (itemKey(shuffled[0]) !== previousLastKey) return shuffled;

  const swapIndex = shuffled.findIndex(
    (value, index) => index > 0 && itemKey(value) !== previousLastKey,
  );
  if (swapIndex > 0) {
    [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }
  return shuffled;
}
