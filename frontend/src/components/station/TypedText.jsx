import { useEffect, useState } from "react";

const STATIC = "░▒▓█#$%&*?~/\\@!§+=-_";

function noiseSample(index, pulse) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(pulse + 1, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function distort(text, quality, pulse = 0) {
  if (quality >= 85) return text;

  const corruptionRate = quality <= 0 ? 1 : Math.min(1, (85 - quality) / 85);
  return Array.from(text, (character, index) => {
    if (character === " " || character === "\n") return character;
    const sample = noiseSample(index, pulse);
    if (sample >= corruptionRate) return character;
    const glyph = Math.floor(noiseSample(index + text.length * 3, pulse + 7) * STATIC.length);
    return STATIC[glyph];
  }).join("");
}

export default function TypedText({ text, quality = 100, onTick, onComplete, animate = true, typewriter = true }) {
  const [shown, setShown] = useState(0);
  const [pulse, setPulse] = useState(0);
  const displayedText = distort(typewriter ? text.slice(0, shown) : text, quality, pulse);

  useEffect(() => {
    if (!animate || quality >= 85 || !text.length) return undefined;
    const interval = window.setInterval(() => setPulse((current) => current + 1), quality < 30 ? 90 : quality < 55 ? 135 : 210);
    return () => window.clearInterval(interval);
  }, [animate, quality, text]);

  useEffect(() => {
    if (!typewriter) return undefined;
    if (shown >= text.length) { onComplete?.(); return undefined; }
    const speed = quality === 0 ? 18 : quality < 55 ? 46 : quality < 85 ? 34 : 24;
    const timer = setTimeout(() => { setShown((count) => count + 1); onTick?.(); }, speed);
    return () => clearTimeout(timer);
  }, [shown, text, quality, onTick, onComplete, typewriter]);

  const effect = quality === 0 ? "noise" : quality < 55 ? "heavy" : quality < 85 ? "distorted" : "clean";
  return (
    <span className={`glitchy ${effect}`} aria-label={text}>
      {displayedText}
      {typewriter && shown < text.length && <span className="caret">▌</span>}
    </span>
  );
}
