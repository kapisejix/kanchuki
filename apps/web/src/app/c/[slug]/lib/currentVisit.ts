const MAX_VISITED_PRODUCTS = 30;
const VISIT_UPDATED_EVENT = 'kanchuki:current-visit-updated';

function storageKey(storeSlug: string): string {
  return `kanchuki_current_visit_${encodeURIComponent(storeSlug)}`;
}

export function loadCurrentVisitProductIds(storeSlug: string): string[] {
  if (typeof window === 'undefined' || !storeSlug) return [];
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(storageKey(storeSlug)) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    ).slice(-MAX_VISITED_PRODUCTS);
  } catch {
    return [];
  }
}

export function recordCurrentVisitProduct(storeSlug: string, productId: string): void {
  if (typeof window === 'undefined' || !storeSlug || !productId) return;
  try {
    const previous = loadCurrentVisitProductIds(storeSlug);
    const next = [...previous.filter((id) => id !== productId), productId].slice(
      -MAX_VISITED_PRODUCTS,
    );
    window.sessionStorage.setItem(storageKey(storeSlug), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(VISIT_UPDATED_EVENT, { detail: { storeSlug } }));
  } catch {
    // Recommendations still fall back to the store's catalog when sessionStorage is unavailable.
  }
}

export function subscribeCurrentVisit(storeSlug: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || !storeSlug) return () => undefined;
  const handler = (event: Event) => {
    if ((event as CustomEvent<{ storeSlug?: string }>).detail?.storeSlug === storeSlug) onChange();
  };
  window.addEventListener(VISIT_UPDATED_EVENT, handler);
  return () => window.removeEventListener(VISIT_UPDATED_EVENT, handler);
}
