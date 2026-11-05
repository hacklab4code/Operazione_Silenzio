import { useEffect, useRef, useState } from "react";

const N = 48;

export default function Waveform({ active, signal, tone }) {
  const rafRef = useRef(null);
  const phaseRef = useRef(0);
  const [heights, setHeights] = useState(() =>
    Array.from({ length: N }, (_, i) => 2 + Math.abs(Math.sin((i / N) * Math.PI * 2)) * 32)
  );

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: N }, () => 2));
      return undefined;
    }

    const tick = () => {
      phaseRef.current += 0.06;
      const p = phaseRef.current;
      setHeights(
        Array.from({ length: N }, (_, i) => {
          const t = (i / N) * Math.PI * 4;
          const v = Math.sin(t - p) * 0.72 + Math.sin(t * 1.9 - p * 1.4) * 0.22 + Math.sin(t * 3.1 - p * 2.3) * 0.06;
          return 2 + Math.abs(v) * 34;
        })
      );
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <div data-testid="waveform" className={`wave ${active ? "live" : ""} w-${signal} ${tone ? `tone-${tone}` : ""}`} aria-hidden>
      {heights.map((h, i) => (
        <i key={i} style={{ height: h }} />
      ))}
    </div>
  );
}
