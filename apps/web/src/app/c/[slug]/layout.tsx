import { Bricolage_Grotesque } from 'next/font/google'

// Scoped to the customer collection route only — the rest of the app
// (admin panel, landing page) keeps the root layout's Inter body font.
// This adds a display face for headings/prices without touching global type.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return <div className={display.variable}>{children}</div>
}
