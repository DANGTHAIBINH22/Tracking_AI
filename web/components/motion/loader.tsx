"use client";
// beui.dev/components/motion/loader — the spinner and dots variants only; the
// other fifteen were left out because nothing here uses them.

import { motion, useReducedMotion } from "motion/react";
import { EASE_IN_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export type LoaderVariant = "spinner" | "dots";

export interface LoaderProps {
  /** Which animation to render. */
  variant?: LoaderVariant;
  /** Base square size in px. Everything scales from this. */
  size?: number;
  /** Seconds per animation cycle. */
  speed?: number;
  /** Accessible label announced to screen readers. */
  label?: string;
  className?: string;
}

// Reduced motion keeps a calm opacity pulse and drops every transform.
const REDUCED = {
  animate: { opacity: [1, 0.4, 1] },
  transition: { duration: 1.4, ease: EASE_IN_OUT, repeat: Infinity },
};

export function Loader({ variant = "spinner", size = 32, speed = 1, label = "Loading", className }: LoaderProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span role="status" aria-label={label} className={cn("inline-flex items-center justify-center text-foreground", className)}>
      {variant === "spinner" && <Spinner size={size} speed={speed} reduce={reduce} />}
      {variant === "dots" && <Dots size={size} speed={speed} reduce={reduce} />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface PartProps {
  size: number;
  speed: number;
  reduce: boolean;
}

function Spinner({ size, speed, reduce }: PartProps) {
  const stroke = Math.max(2, size * 0.09);
  const r = (size - stroke) / 2;
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      animate={reduce ? REDUCED.animate : { rotate: 360 }}
      transition={reduce ? REDUCED.transition : { duration: speed, ease: "linear", repeat: Infinity }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
      <path
        d={`M ${size / 2} ${size / 2 - r} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

function Dots({ size, speed, reduce }: PartProps) {
  const dot = size * 0.24;
  return (
    <span className="flex items-center" style={{ gap: size * 0.14 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="rounded-full bg-current"
          style={{ width: dot, height: dot }}
          animate={reduce ? { opacity: [0.4, 1, 0.4] } : { y: [0, -size * 0.3, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: speed, ease: EASE_IN_OUT, repeat: Infinity, delay: i * speed * 0.16 }}
        />
      ))}
    </span>
  );
}
