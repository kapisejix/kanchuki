'use client';

// My Style Phase 2 (research §7.2 step 3): live front camera with an oval guide.
//
// The frame is drawn to a canvas in page memory and handed to the same prepareUpload pipeline as
// a picked file, so it gets the same on-device check and re-encode. Nothing is stored here. The
// camera tracks stop on unmount (the camera light goes off with the step). Any camera error
// (denied, no camera, insecure context) calls onUnavailable and the sheet falls back to the
// phone's own camera via <input capture="user">.
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BTN_PRIMARY } from '../ui';

/** True where getUserMedia exists. Without it the sheet keeps the plain file input. */
export function hasLiveCamera(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function CameraCapture({
  onCapture,
  onUnavailable,
}: {
  onCapture: (photo: File) => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  // Latest callback without restarting the camera when the parent re-renders.
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (stopped) {
          for (const t of s.getTracks()) t.stop(); // the sheet closed while asking
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s; // ready on the first frame
      })
      .catch(() => {
        if (!stopped) unavailableRef.current();
      });
    return () => {
      stopped = true;
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, []);

  const take = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return; // no frame yet
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return unavailableRef.current();
    ctx.drawImage(v, 0, 0); // un-mirrored: the preview is mirrored on screen only
    canvas.toBlob(
      (b) => {
        if (b) onCapture(new File([b], 'camera.jpg', { type: 'image/jpeg' }));
        else unavailableRef.current();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-spaceCadet-950">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Front camera preview"
          onLoadedData={() => setReady(true)}
          className="h-full w-full -scale-x-100 object-cover"
        />
        <svg
          data-testid="camera-oval"
          aria-hidden="true"
          viewBox="0 0 300 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <mask id="camera-oval-mask">
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy="185" rx="100" ry="135" fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(0,0,0,0.45)" mask="url(#camera-oval-mask)" />
          <ellipse
            cx="150"
            cy="185"
            rx="100"
            ry="135"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeDasharray="8 6"
          />
        </svg>
      </div>
      <output className="mt-3 block text-center text-xs text-heliotrope-500">
        {ready ? 'Fit your face inside the oval, facing a window.' : 'Starting the camera…'}
      </output>
      {/* aria-disabled, not disabled: stays focusable, and take() no-ops until a frame exists. */}
      <button
        type="button"
        onClick={take}
        aria-disabled={!ready}
        className={`${BTN_PRIMARY} mt-3 w-full aria-disabled:opacity-60`}
      >
        <Camera aria-hidden className="h-4 w-4" />
        Take photo
      </button>
    </div>
  );
}
