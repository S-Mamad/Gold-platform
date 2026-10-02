"use client";

import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";

/** Stable decorative spark — seed only sets shape, not re-keyed every price tick */
export function SparkBars({ seed = 42 }: { seed?: number }) {
  const reduce = useReducedMotion();
  const bars = useMemo(() => {
    const arr: number[] = [];
    let v = Math.abs(Math.round(seed)) % 97 || 17;
    for (let i = 0; i < 16; i++) {
      v = (v * 17 + 23) % 97;
      arr.push(0.32 + (v % 60) / 100);
    }
    return arr;
  }, [seed]);

  return (
    <div className="spark" aria-hidden>
      {bars.map((h, i) => (
        <i
          key={i}
          className={reduce ? undefined : "spark__bar"}
          style={
            {
              ["--bar-h" as string]: h,
              ["--bar-delay" as string]: `${i * 0.08}s`,
              ["--bar-dur" as string]: `${2.4 + (i % 4) * 0.25}s`,
              transform: `scaleY(${h})`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
