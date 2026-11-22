/** Motion design system: one place for durations and easings. */
import type { Transition, Variants } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const dur = {
  hover: 0.13,
  button: 0.15,
  dropdown: 0.18,
  dialog: 0.22,
  sidebar: 0.24,
  page: 0.26,
} as const;

export const t = (duration: number, extra: Transition = {}): Transition => ({ duration, ease, ...extra });

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: t(dur.page) },
};

export const stagger = (step = 0.035): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step } },
});

export const collapse: Variants = {
  closed: { height: 0, opacity: 0, transition: t(dur.dropdown) },
  open: { height: "auto", opacity: 1, transition: t(dur.dialog) },
};
