"use client";
import React from "react";
import { useLazyMount } from "@/hooks/use-lazy-mount";

/**
 * LazyMount: Wraps children and only mounts them when they scroll into view.
 * Shows a placeholder of the given height until visible.
 * Once mounted, stays mounted to preserve component state.
 *
 * Usage:
 *   <LazyMount height={200}>
 *     <SomeHeavyComponent />
 *   </LazyMount>
 */
export function LazyMount({ children, height = 100, className }: {
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  const [ref, shouldMount] = useLazyMount("300px");

  return (
    <div ref={ref} className={className} style={{ minHeight: shouldMount ? undefined : height }}>
      {shouldMount ? children : (
        <div className="flex items-center justify-center py-4" style={{ height }}>
          <span className="text-sm text-muted-foreground animate-pulse">加载中...</span>
        </div>
      )}
    </div>
  );
}
