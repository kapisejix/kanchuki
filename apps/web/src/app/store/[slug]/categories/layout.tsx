import { Bricolage_Grotesque } from 'next/font/google'

// Same display font as the /c/[slug] collection route — the category
// browsing pages reuse CollectionView, which expects font-display to resolve.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return <div className={display.variable}>{children}</div>
}
