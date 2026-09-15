import { useEffect, useRef } from 'react';
import { useMetaPixel } from 'scoretrack';

const milestones = [0, 25, 50, 75, 100];

export function MetaScrollTracking() {
  const { trackCustomEvent, isInitialized } = useMetaPixel();
  const sent = useRef(new Set<number>());

  useEffect(() => {
    if (!isInitialized) return;
    let frame = 0;
    let lastScrollY = window.scrollY;

    const send = (depth: number) => {
      if (sent.current.has(depth)) return;
      sent.current.add(depth);
      void trackCustomEvent('Scroll', { scroll_depth: depth, scroll_percentage: depth });
    };

    send(0);
    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const scrollY = Math.max(0, window.scrollY);
        const movingDown = scrollY > lastScrollY;
        lastScrollY = scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (!movingDown || maxScroll <= 0) return;
        // Browser scrolling can stop a fraction of a pixel before the bottom.
        const percentage = maxScroll - scrollY <= 1 ? 100 : scrollY / maxScroll * 100;
        milestones.forEach(depth => {
          if (percentage >= depth) send(depth);
        });
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(frame);
    };
  }, [isInitialized, trackCustomEvent]);

  return null;
}
