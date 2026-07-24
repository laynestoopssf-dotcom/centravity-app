// Shared office/book-size field readers.
//
// Book sizes live on `offices` only (Settings → Office Goals). Never read
// agency.book_size_* — that column doesn't exist / isn't kept in sync.
// Historically a handful of rows were saved under alternate key spellings
// (e.g. an early import script used `auto_book` instead of `book_size_auto`),
// so every reader falls back through those known aliases before giving up.
//
// This is the single source of truth for "how do we read an office's book
// size" — app/dashboard/page.tsx, app/dashboard/reveal/page.tsx, and
// app/dashboard/cockpit/page.tsx all import from here instead of
// re-implementing the alias list (and risking them drifting apart).

export const num = (v: any, fallback = 0): number => {
  if (v == null || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  // Strip currency formatting that would otherwise Number() → NaN → fallback.
  const cleaned = String(v).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

export type BookSizeField =
  | 'book_size_auto'
  | 'book_size_fire'
  | 'book_size_commercial'
  | 'book_size_life'
  | 'book_size_health';

const BOOK_FIELD_ALIASES: Record<BookSizeField, string[]> = {
  book_size_auto: ['book_size_auto', 'auto_book', 'auto_book_size'],
  book_size_fire: ['book_size_fire', 'fire_book', 'fire_book_size', 'book_size_home'],
  book_size_commercial: ['book_size_commercial', 'commercial_book', 'comm_book'],
  book_size_life: ['book_size_life', 'life_book'],
  book_size_health: ['book_size_health', 'health_book'],
};

export function readBookField(office: any, field: BookSizeField): number {
  for (const key of BOOK_FIELD_ALIASES[field] || [field]) {
    if (office?.[key] != null && office[key] !== '') return num(office[key]);
  }
  return 0;
}

export interface OfficeBookSizes {
  book_size_auto: number;
  book_size_fire: number;
  book_size_commercial: number;
  book_size_life: number;
  book_size_health: number;
}

export function sumOfficeBookSizes(officeList: any[]): OfficeBookSizes {
  return (officeList || []).reduce<OfficeBookSizes>(
    (acc, office) => ({
      book_size_auto: acc.book_size_auto + readBookField(office, 'book_size_auto'),
      book_size_fire: acc.book_size_fire + readBookField(office, 'book_size_fire'),
      book_size_commercial: acc.book_size_commercial + readBookField(office, 'book_size_commercial'),
      book_size_life: acc.book_size_life + readBookField(office, 'book_size_life'),
      book_size_health: acc.book_size_health + readBookField(office, 'book_size_health'),
    }),
    { book_size_auto: 0, book_size_fire: 0, book_size_commercial: 0, book_size_life: 0, book_size_health: 0 }
  );
}

export function totalBookPremiumOf(sizes: OfficeBookSizes): number {
  return sizes.book_size_auto + sizes.book_size_fire + sizes.book_size_commercial + sizes.book_size_life + sizes.book_size_health;
}
