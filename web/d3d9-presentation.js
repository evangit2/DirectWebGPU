const COLOR_FORMATS = new Set([21, 22, 23, 24, 25, 26]);
const DEPTH_FORMATS = new Set([0, 71, 75]);
const SWAP_EFFECTS = new Set([1, 2, 3]);
const PRESENT_INTERVALS = new Set([0, 1, 0x80000000]);

export function presentationParametersValid(values, {windowSize, resize = false} = {}) {
  if (!Array.isArray(values) || values.length !== 14 || values.some(value => !Number.isInteger(value) || value < 0 || value > 0xffffffff)) return false;
  const [width, height, format, count, multi, quality, swap, hwnd, windowed, autoDepth, depthFormat, flags, refresh, interval] = values;
  const sizeValid = resize
    ? width >= 1 && height >= 1 && width <= 4096 && height <= 4096
    : Array.isArray(windowSize) && width === windowSize[0] && height === windowSize[1];
  return sizeValid && COLOR_FORMATS.has(format) && count === 1 && multi === 0 && quality === 0
    && SWAP_EFFECTS.has(swap) && hwnd <= 1 && (windowed === 0 || windowed === 1)
    && autoDepth === 1 && DEPTH_FORMATS.has(depthFormat) && flags === 0 && refresh === 0
    && PRESENT_INTERVALS.has(interval);
}
