import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** A number that counts up from zero once, on mount. Shows the final value at once under reduced motion. */
export function CountUp({ value, duration = 1.8, delay = 0.3 }: { value: number; duration?: number; delay?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration, delay, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, duration, delay, reduced]);

  return <>{shown}</>;
}
