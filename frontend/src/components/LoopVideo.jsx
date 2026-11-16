import { useEffect, useRef } from 'react';

// A muted looping clip that shows its poster until `isActive` is true.
// It never plays when the visitor prefers reduced motion.
export default function LoopVideo({ src, poster, isActive, isReducedMotion, className, label }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive && !isReducedMotion) {
      video.play().catch(() => { /* autoplay blocked: the poster stays */ });
    } else {
      video.pause();
    }
  }, [isActive, isReducedMotion]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={isReducedMotion ? undefined : src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
    />
  );
}
