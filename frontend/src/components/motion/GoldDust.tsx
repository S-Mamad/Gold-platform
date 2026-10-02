"use client";

import { useReducedMotion } from "framer-motion";

const SPECKS = [
  { x: 12, y: 18, s: 2, d: 11, delay: 0 },
  { x: 78, y: 12, s: 3, d: 14, delay: 1.2 },
  { x: 88, y: 42, s: 2, d: 10, delay: 2.4 },
  { x: 22, y: 58, s: 2.5, d: 13, delay: 0.6 },
  { x: 64, y: 72, s: 2, d: 12, delay: 3.1 },
  { x: 40, y: 28, s: 1.5, d: 9, delay: 1.8 },
  { x: 8, y: 80, s: 2, d: 15, delay: 4 },
  { x: 92, y: 68, s: 2.5, d: 11, delay: 2.7 },
];

export function GoldDust() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className="gold-dust" aria-hidden>
      {SPECKS.map((p, i) => (
        <span
          key={i}
          className="gold-dust__speck"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              ["--dust-d" as string]: `${p.d}s`,
              ["--dust-delay" as string]: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
