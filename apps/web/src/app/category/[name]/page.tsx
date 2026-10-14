import { Footer, Navbar, PageHero, Section } from '@/components/site/Chrome';
import FeedProductCard, { type FeedProduct } from '@/components/site/FeedProductCard';
import { API_URL } from '@/lib/apiUrl';
import type { Metadata } from 'next';
import Link from 'next/link';

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface CategoryPageData {
  category: string;
  products: FeedProduct[];
  total: number;
  page: number;
  total_pages: number;
}

export const revalidate = 300;

async function fetchCategory(name: string, page: number): Promise<CategoryPageData | null> {
  try {
    const qs = new URLSearchParams({ category: name, page: String(page), pageSize: '20' });
    const res = await fetch(`${API_URL}/v1/public/category-products?${qs}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data: CategoryPageData }).data;
  } catch {
    return null;
  }
}

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decode((await params).name);
  return {
    title: `${name} — Shop from real stores | Kanchuki`,
    description: `Browse ${name} from real clothing stores on Kanchuki and message shops on WhatsApp.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const name = decode((await params).name);
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? '1', 10) || 1);
  const data = await fetchCategory(name, page);
  const base = `/category/${encodeURIComponent(name)}`;

  return (
    <>
      <Navbar />
      <PageHero
        tag="Category"
        title={name}
        lead="Tap any piece to open it in the shop's catalog."
      />
      <Section className="bg-cream">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {data && data.products.length > 0 ? (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {data.products.map((p) => (
                  <li key={p.id}>
                    <FeedProductCard p={p} fallbackAlt={name} />
                  </li>
                ))}
              </ul>
              {data.total_pages > 1 && (
                <nav
                  aria-label="Pages"
                  className="mt-8 flex items-center justify-center gap-4 text-sm"
                >
                  {page > 1 && (
                    <Link
                      href={`${base}?page=${page - 1}`}
                      className="font-semibold text-cobalt-600"
                    >
                      ← Previous
                    </Link>
                  )}
                  <span className="text-carbon/60">
                    Page {data.page} of {data.total_pages}
                  </span>
                  {page < data.total_pages && (
                    <Link
                      href={`${base}?page=${page + 1}`}
                      className="font-semibold text-cobalt-600"
                    >
                      Next →
                    </Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <p className="text-center text-carbon/60">No products in this category yet.</p>
          )}
        </div>
      </Section>
      <Footer />
    </>
  );
}
