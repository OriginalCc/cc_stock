"use client";
import { useState, useEffect, useRef } from "react";

/**
 * Lazy-mount hook: only mounts the child component when it scrolls into view.
 * Uses IntersectionObserver with a rootMargin to preload slightly before visible.
 * Once mounted, stays mounted (no unmount on scroll away) to preserve state.
 *
 * @param rootMargin - CSS margin string to start loading before element is visible (default: "200px")
 * @returns [ref, shouldMount] - ref to attach to container div, boolean to conditionally render
 */
export function useLazyMount(rootMargin = "200px"): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shouldMount) return; // already mounted

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, shouldMount]);

  return [ref, shouldMount];
}
