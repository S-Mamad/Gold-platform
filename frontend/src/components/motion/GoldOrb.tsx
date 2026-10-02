"use client";

import { motion, useReducedMotion } from "framer-motion";

export function GoldOrb({ pulse = true }: { pulse?: boolean }) {
  const reduce = useReducedMotion();

  return (
    <div className="gold-orb" aria-hidden>
      <motion.div
        className="gold-orb__core"
        animate={
          reduce || !pulse
            ? undefined
            : {
                scale: [1, 1.04, 0.98, 1.02, 1],
                rotate: [0, 4, -3, 2, 0],
              }
        }
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <span className="gold-orb__shine" />
        <span className="gold-orb__rim" />
        <span className="gold-orb__mark">۱۸</span>
      </motion.div>
      {!reduce && pulse && (
        <>
          <span className="gold-orb__ring gold-orb__ring--a" />
          <span className="gold-orb__ring gold-orb__ring--b" />
        </>
      )}
    </div>
  );
}
