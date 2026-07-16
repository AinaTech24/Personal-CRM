import { useEffect, useRef } from "react";

/**
 * Smoothly auto-scrolls a horizontally-scrollable container while dragging
 * near its left/right edge. Attach `ref` to the scroll container and
 * `onDragOver` to the same element (or any ancestor the dragover bubbles
 * through); call `stop` on drop/dragend.
 */
export function useDragAutoScroll<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const velocityRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  function step() {
    const container = containerRef.current;
    if (!container || velocityRef.current === 0) {
      frameRef.current = null;
      return;
    }
    container.scrollLeft += velocityRef.current;
    frameRef.current = requestAnimationFrame(step);
  }

  function onDragOver(e: React.DragEvent<HTMLElement>) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edgeSize = 70;
    const maxSpeed = 10;
    const distFromLeft = e.clientX - rect.left;
    const distFromRight = rect.right - e.clientX;

    let velocity = 0;
    if (distFromLeft < edgeSize) {
      velocity = -maxSpeed * (1 - Math.max(distFromLeft, 0) / edgeSize);
    } else if (distFromRight < edgeSize) {
      velocity = maxSpeed * (1 - Math.max(distFromRight, 0) / edgeSize);
    }

    velocityRef.current = velocity;
    if (velocity !== 0 && frameRef.current === null) {
      frameRef.current = requestAnimationFrame(step);
    }
  }

  function stop() {
    velocityRef.current = 0;
  }

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { containerRef, onDragOver, stop };
}
