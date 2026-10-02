"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { formatGrams, formatRial } from "@/lib/utils";

type Props = {
  value: number;
  kind?: "rial" | "grams" | "raw";
  className?: string;
  style?: React.CSSProperties;
  durationMs?: number;
};

export function AnimatedNumber({
  value,
  kind = "rial",
  className,
  style,
  durationMs = 700,
}: Props) {
  const reduce = useReducedMotion();
  const safe = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safe);
  const displayRef = useRef(safe);
  const fromRef = useRef(safe);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (reduce) {
      setDisplay(safe);
      fromRef.current = safe;
      displayRef.current = safe;
      return;
    }

    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      fromRef.current = displayRef.current;
    }

    const from = fromRef.current;
    const to = safe;
    if (Math.abs(from - to) < 0.00001) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        fromRef.current = to;
        displayRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        fromRef.current = displayRef.current;
      }
    };
  }, [safe, durationMs, reduce]);

  const text =
    kind === "rial"
      ? formatRial(display)
      : kind === "grams"
        ? formatGrams(display)
        : Math.round(display).toLocaleString("fa-IR");

  return (
    <span className={className ? `num ${className}` : "num"} style={style}>
      {text}
    </span>
  );
}
