const SPECKS = Array.from({ length: 40 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 1 + (i % 3),
  dur: 14 + ((i * 7) % 18),
  delay: -((i * 3.1) % 30),
  op: 0.15 + ((i % 5) * 0.08),
}));

export default function Dust() {
  return (
    <div className="dust" aria-hidden>
      {SPECKS.map((s, i) => (
        <span key={i} style={{ left: `${s.left}%`, width: s.size, height: s.size,
          animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, opacity: s.op }} />
      ))}
    </div>
  );
}
