import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kanchuki — AI Fashion Platform for Indian Retailers',
  description:
    'Digitize your clothing store in minutes. Share personalized collections on WhatsApp. Let customers try outfits from home. No website needed.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">Kanchuki</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">For Indian clothing stores</span>
          <a
            href="#download"
            className="bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-violet-700 transition-colors"
          >
            Get Started Free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
          <span>🇮🇳</span>
          <span>Built for Indian ethnic wear retailers</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Your store on WhatsApp.{' '}
          <span className="text-violet-600">Powered by AI.</span>
        </h1>

        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Digitize your clothing shop in minutes. Share curated collections with customers via WhatsApp.
          AI automatically tags every product from a single photo.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#download"
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-lg px-8 py-4 rounded-2xl transition-colors"
          >
            Start Free Trial →
          </a>
          <a
            href="#how-it-works"
            className="border-2 border-gray-200 text-gray-700 font-semibold text-lg px-8 py-4 rounded-2xl hover:border-violet-300 transition-colors"
          >
            See How It Works
          </a>
        </div>

        <p className="text-sm text-gray-400 mt-5">
          14-day free trial · No credit card · Works without a website
        </p>
      </section>

      {/* Gap matrix — the moat */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">
            The only platform that has everything
          </h2>
          <p className="text-center text-gray-500 mb-10">
            Competitors have one piece. Kanchuki has all five.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-4 text-gray-500 font-medium">Platform</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium">AI Try-On</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium">Fashion DNA CRM</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium">WhatsApp Commerce</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium">No Website Needed</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'TryOnCloud / AI Vastra', cols: [true, false, false, false] },
                  { name: 'Interakt / Meon CRM', cols: [false, false, true, false] },
                  { name: 'DigifyERP', cols: [false, false, false, false] },
                  { name: 'WhatsApp + Google Sheets', cols: [false, false, false, true] },
                ].map((row) => (
                  <tr key={row.name} className="border-b border-gray-50">
                    <td className="px-5 py-4 text-gray-700 font-medium">{row.name}</td>
                    {row.cols.map((v, i) => (
                      <td key={i} className="px-4 py-4 text-center">
                        {v ? '✅' : '❌'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-violet-50">
                  <td className="px-5 py-4 font-bold text-violet-800">Kanchuki</td>
                  {[true, true, true, true].map((v, i) => (
                    <td key={i} className="px-4 py-4 text-center font-bold text-violet-700">✅</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">How it works</h2>
        <p className="text-center text-gray-500 mb-14">Three steps. No tech skills needed.</p>

        <div className="grid sm:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              icon: '📷',
              title: 'Photo → Digital Catalog',
              desc: 'Take a photo of any product. AI reads category, color, fabric, and occasion automatically. Done in 10 seconds.',
            },
            {
              step: '02',
              icon: '🔗',
              title: 'Select → Share on WhatsApp',
              desc: 'Pick 10–20 products and generate a shareable link. Send to customers via WhatsApp in one tap.',
            },
            {
              step: '03',
              icon: '💬',
              title: 'Customer Browses → Enquires',
              desc: 'Customers open the link, browse products, heart their favorites, and tap WhatsApp to enquire. No app download needed.',
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="text-5xl mb-4">{item.icon}</div>
              <div className="text-xs font-bold text-violet-600 mb-2 tracking-widest">STEP {item.step}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Simple pricing</h2>
          <p className="text-center text-gray-500 mb-14">In INR. No hidden costs. Pay via UPI.</p>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                name: 'Starter',
                monthly: '₹999',
                annual: '₹9,999/yr',
                features: ['500 products', '200 customers', '50 collection links/month', 'AI auto-tagging', 'Manual WhatsApp share'],
                highlight: false,
              },
              {
                name: 'Growth',
                monthly: '₹2,499',
                annual: '₹24,999/yr',
                features: ['2,000 products', '1,000 customers', 'Unlimited links', 'AI matching', '100 try-ons/month'],
                highlight: true,
              },
              {
                name: 'Pro',
                monthly: '₹4,999',
                annual: '₹49,999/yr',
                features: ['Unlimited everything', 'Multi-staff', 'WhatsApp automation', '500 try-ons/month', 'Campaign system'],
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-3xl p-6 border-2 ${
                  plan.highlight
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {plan.highlight && (
                  <div className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <div className={`text-3xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.monthly}
                  <span className="text-base font-normal">/month</span>
                </div>
                <div className={`text-sm mb-6 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                  or {plan.annual} (save 20%)
                </div>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span>{plan.highlight ? '✓' : '✓'}</span>
                      <span className={plan.highlight ? 'text-white/90' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#download"
                  className={`block text-center py-3 rounded-xl font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-white text-violet-600 hover:bg-violet-50'
                      : 'bg-violet-600 text-white hover:bg-violet-700'
                  }`}
                >
                  Start Free Trial
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="download" className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Ready to digitize your store?
        </h2>
        <p className="text-gray-500 text-lg mb-8">
          Join Indian clothing retailers already using Kanchuki.{' '}
          14-day free trial. No credit card needed.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#"
            className="flex items-center gap-3 bg-black text-white px-6 py-4 rounded-2xl hover:bg-gray-800 transition-colors"
          >
            <span className="text-2xl">📱</span>
            <div className="text-left">
              <div className="text-xs">Download on</div>
              <div className="font-bold">Google Play</div>
            </div>
          </a>
          <a
            href="#"
            className="flex items-center gap-3 bg-black text-white px-6 py-4 rounded-2xl hover:bg-gray-800 transition-colors"
          >
            <span className="text-2xl">🍎</span>
            <div className="text-left">
              <div className="text-xs">Download on</div>
              <div className="font-bold">App Store</div>
            </div>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">K</span>
            </div>
            <span className="text-gray-700 font-semibold">Kanchuki</span>
          </div>
          <p className="text-gray-400 text-sm">
            © 2026 Kanchuki. Made in India 🇮🇳
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-700">Privacy</a>
            <a href="#" className="hover:text-gray-700">Terms</a>
            <a href="#" className="hover:text-gray-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
