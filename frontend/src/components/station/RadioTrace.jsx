import { useEffect, useRef } from "react";
import { getRadioTheme } from "./radioTheme";

function waveNoise(x, phase) {
  const sample = Math.sin((Math.floor(x / 3) + 1) * 127.1 + phase * 311.7) * 43758.5453;
  return (sample - Math.floor(sample)) * 2 - 1;
}

export function RadioTrace({ active, quality, overlapped = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frame;
    let phase = 0;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = getRadioTheme(quality).accent;
      context.globalAlpha = .2;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
      context.globalAlpha = 1;

      const noSignal = quality === 0;
      const noiseAmount = 1 - quality / 100;
      const amplitude = height * (noSignal ? .46 : quality >= 85 ? (overlapped ? .42 : .3) : .22 + noiseAmount * .28);
      const color = getRadioTheme(quality).accent;
      const staticLevel = noSignal ? .8 : quality < 35 ? .56 : quality < 65 ? .24 : quality < 85 ? .08 : 0;
      const point = (position, layer) => {
        const x = position;
        const wavePhase = overlapped && layer ? phase - 0.05 : phase;
        const envelope = (active ? 1 : overlapped ? .82 : .62) * (overlapped && layer ? .9 : 1);
        const interference = noSignal
          ? Math.sin(x * 1.91 + wavePhase * 13) * .62 + Math.sin(x * 2.77 - wavePhase * 17) * .43
          : quality < 85
            ? (Math.sin(x * .91 + wavePhase * 8) * .13 + Math.sin(x * 1.73 - wavePhase * 11) * .1) * noiseAmount
            : 0;
        const carrier = (noSignal ? 0 : Math.sin(x * .018 + wavePhase) * .48
          + Math.sin(x * .047 - wavePhase * .72) * .2
          + Math.sin(x * .13 + wavePhase * 1.7) * .1
          + Math.sin(x * .61 + wavePhase * 3.1) * .035)
          + interference
          + waveNoise(x, Math.floor(wavePhase * 13)) * staticLevel;
        const base = height / 2 + carrier * amplitude * envelope;
        return overlapped && layer ? base + 1.1 : base;
      };

      for (let layer = 0; layer < (overlapped ? 2 : 1); layer += 1) {
        context.beginPath();
        for (let x = 0; x <= width; x += 2) {
          const y = point(x, layer);
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.globalAlpha = layer ? .16 : .24;
        context.shadowColor = color;
        context.shadowBlur = 10;
        context.stroke();
        context.globalAlpha = layer ? .6 : .95;
        context.lineWidth = layer ? 1 : 1.4;
        context.shadowBlur = 3;
        context.stroke();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;

      phase += active ? .13 : noSignal ? .09 : .025;
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [active, quality, overlapped]);

  return <canvas ref={canvasRef} className="ft-radio-trace" aria-hidden="true" />;
}

