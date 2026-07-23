'use client';

import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';

interface Props {
  frames: string[];
  alt: string;
}

// Drag-to-rotate 360 viewer: all frames are stacked and only one is shown
// (opacity toggle) at a time — simplest thing that works for ~24 small JPEGs.
// ponytail: no canvas/sprite-sheet optimization; revisit if frame counts grow
// well past the current 24 and load time becomes visible.
const PX_PER_FRAME = 8;

export function Product360Viewer({ frames, alt }: Props) {
  const [frameIndex, setFrameIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartFrame = useRef(0);
  const total = frames.length;

  const handleStart = useCallback(
    (x: number) => {
      dragStartX.current = x;
      dragStartFrame.current = frameIndex;
    },
    [frameIndex],
  );

  const handleMove = useCallback(
    (x: number) => {
      if (dragStartX.current === null) return;
      const delta = x - dragStartX.current;
      const framesDelta = Math.round(delta / PX_PER_FRAME);
      const next = (((dragStartFrame.current - framesDelta) % total) + total) % total;
      setFrameIndex(next);
    },
    [total],
  );

  const handleEnd = useCallback(() => {
    dragStartX.current = null;
  }, []);

  if (total === 0) return null;

  return (
    <div
      className="relative w-full h-full select-none cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'pan-y' }}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) handleStart(t.clientX);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) handleMove(t.clientX);
      }}
      onTouchEnd={handleEnd}
    >
      {frames.map((url, i) => (
        <Image
          key={url}
          src={url}
          alt={alt}
          fill
          sizes="100vw"
          priority={i === 0}
          className="object-cover pointer-events-none"
          style={{ opacity: i === frameIndex ? 1 : 0 }}
        />
      ))}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-[10px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none">
        Drag to rotate · 360°
      </div>
    </div>
  );
}
