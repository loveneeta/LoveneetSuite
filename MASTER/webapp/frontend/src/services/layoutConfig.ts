/**
 * Shared Layout Configuration & Grouping Engine
 * Single source of truth for products-per-slide, slot geometry, grouping, and slide counts.
 * Shared across Layout Canvas, Live Preview, and PPTX Generator.
 */

export interface Slot {
  img: [number, number, number, number]; // [left, top, right, bottom] in 800x450 scale
  text: [number, number, number, number];
}

export type ProductsPerSlide = 2 | 3;

export const DEFAULT_LAYOUT: Slot[] = [
  { img: [60, 80, 360, 260], text: [60, 275, 360, 395] },
  { img: [440, 80, 740, 260], text: [440, 275, 740, 395] },
];

export const THREE_LAYOUT: Slot[] = [
  { img: [25, 108, 265, 273], text: [25, 290, 265, 390] },
  { img: [290, 108, 530, 273], text: [290, 290, 530, 390] },
  { img: [555, 108, 795, 273], text: [555, 290, 795, 390] },
];

/**
 * Adjusts layout slots to match targetCount while preserving existing slot positions.
 * - 3 -> 2: Removes only the extra slot; surviving slots (0 and 1) keep custom coordinates.
 * - 2 -> 3: Keeps surviving slots (0 and 1) untouched; adds new default slot at index 2.
 * - Enforces slots.length === targetCount always.
 */
export function adjustLayoutSlots(currentSlots: Slot[] | undefined, targetCount: number): Slot[] {
  const count = Math.max(1, targetCount);
  const baseDefaults = count === 2 ? DEFAULT_LAYOUT : THREE_LAYOUT;
  const current = currentSlots && currentSlots.length > 0 ? currentSlots : baseDefaults;

  if (current.length === count) {
    return current.map(s => ({ img: [...s.img] as [number, number, number, number], text: [...s.text] as [number, number, number, number] }));
  }

  if (current.length > count) {
    // Truncate extra slots; keep surviving slots coordinates untouched
    return current.slice(0, count).map(s => ({ img: [...s.img] as [number, number, number, number], text: [...s.text] as [number, number, number, number] }));
  }

  // Expanding (e.g. 2 -> 3): keep existing slots untouched, add new default slot(s)
  const expanded: Slot[] = current.map(s => ({ img: [...s.img] as [number, number, number, number], text: [...s.text] as [number, number, number, number] }));
  for (let i = current.length; i < count; i++) {
    const defaultSlot = THREE_LAYOUT[i] || DEFAULT_LAYOUT[i] || { img: [25 + i * 260, 108, 265 + i * 260, 273], text: [25 + i * 260, 290, 265 + i * 260, 390] };
    expanded.push({
      img: [...defaultSlot.img] as [number, number, number, number],
      text: [...defaultSlot.text] as [number, number, number, number],
    });
  }

  return expanded;
}

/**
 * Single shared product chunking function used by both Live Preview and PPTX Generator.
 * Guarantees no chunk ever exceeds perSlide items.
 */
export function chunkProducts<T>(products: T[], perSlide: number): T[][] {
  if (!products || products.length === 0) return [];
  const safePerSlide = Math.max(1, perSlide);
  const chunks: T[][] = [];
  for (let i = 0; i < products.length; i += safePerSlide) {
    chunks.push(products.slice(i, i + safePerSlide));
  }
  return chunks;
}

/**
 * Slide count calculation ensuring 0 products = 0 product slides.
 * Non-product (cover) slides are reported separately and summed consistently.
 */
export function calculateSlideCount(
  totalProducts: number,
  perSlide: number,
  coverSlides: number = 0
): { productSlides: number; coverSlides: number; totalSlides: number } {
  const safeProducts = Math.max(0, totalProducts);
  const safePerSlide = Math.max(1, perSlide);
  const safeCovers = Math.max(0, coverSlides);

  const productSlides = safeProducts === 0 ? 0 : Math.ceil(safeProducts / safePerSlide);
  return {
    productSlides,
    coverSlides: safeCovers,
    totalSlides: safeCovers + productSlides,
  };
}
