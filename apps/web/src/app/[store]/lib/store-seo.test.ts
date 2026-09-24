import { describe, expect, it } from 'vitest';
import { itemListLd, ldJson, localBusinessLd, productLd } from './store-seo';

const base = { id: 'p1', name: 'Silk Saree', category: 'Sarees', price_min: 150000, price_max: 150000 };

describe('store-seo JSON-LD (§7A.2)', () => {
  it('ldJson escapes < so retailer text cannot close the script tag', () => {
    const out = ldJson(localBusinessLd({ shop_name: 'Evil</script><script>alert(1)</script>', city: null }, 's'));
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).name).toBe('Evil</script><script>alert(1)</script>');
  });

  it('single price → Offer in rupees; range → AggregateOffer; no price → no offers', () => {
    expect(productLd(base, 'Shop', 'u').offers).toMatchObject({ '@type': 'Offer', price: '1500.00', priceCurrency: 'INR' });
    expect(productLd({ ...base, price_max: 250000 }, 'Shop', 'u').offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: '1500.00',
      highPrice: '2500.00',
    });
    expect(productLd({ ...base, price_min: null, price_max: null }, 'Shop', 'u')).not.toHaveProperty('offers');
    expect(productLd({ ...base, status: 'SOLD' }, 'Shop', 'u').offers).toMatchObject({
      availability: 'https://schema.org/OutOfStock',
    });
  });

  it('itemListLd numbers items from 1 with their product URLs', () => {
    const ld = itemListLd('Festive', [base, { ...base, id: 'p2', name: null }], (id) => `https://x/${id}`);
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, url: 'https://x/p1', name: 'Silk Saree' },
      { '@type': 'ListItem', position: 2, url: 'https://x/p2', name: 'Sarees' },
    ]);
  });
});
