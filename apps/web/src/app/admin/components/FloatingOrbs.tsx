'use client'

import { motion } from 'framer-motion'

export function FloatingOrbs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {[
        { size: 600, top: '-20%', right: '-10%', color: 'rgba(6,182,212,0.15)', duration: 20, delay: 0 },
        { size: 500, bottom: '-15%', left: '-10%', color: 'rgba(59,130,246,0.12)', duration: 25, delay: 2 },
        { size: 300, top: '30%', left: '60%', color: 'rgba(168,85,247,0.08)', duration: 18, delay: 4 },
        { size: 400, top: '60%', right: '30%', color: 'rgba(6,182,212,0.1)', duration: 22, delay: 1 },
      ].map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-3xl animate-float"
          style={{
            width: orb.size,
            height: orb.size,
            top: orb.top,
            right: orb.right,
            bottom: orb.bottom,
            left: orb.left,
            background: `radial-gradient(circle, ${orb.color}, transparent)`,
            animationDuration: `${orb.duration}s`,
            animationDelay: `${orb.delay}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -40px) scale(1.05); }
          50% { transform: translate(-20px, -20px) scale(0.95); }
          75% { transform: translate(40px, 10px) scale(1.02); }
        }
        .animate-float { animation: float ease-in-out infinite; }
      `}</style>
    </div>
  )
}

export default FloatingOrbs
