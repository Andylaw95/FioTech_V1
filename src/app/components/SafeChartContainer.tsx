import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveContainer } from 'recharts';

interface SafeChartContainerProps {
  children: React.ComponentProps<typeof ResponsiveContainer>['children'];
  className?: string;
  debounce?: number;
}

/**
 * A wrapper around recharts ResponsiveContainer that only renders the chart
 * once the parent container has non-zero dimensions, preventing the
 * "width(0) and height(0) of chart should be greater than 0" warning.
 */
export function SafeChartContainer({
  children,
  className,
  debounce = 100,
}: SafeChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.floor(width);
      const h = Math.floor(height);
      setDimensions((prev) => {
        // STABILITY: Only update if dimensions actually changed meaningfully (>1px)
        // This prevents render loops from sub-pixel adjustments
        if (Math.abs(prev.width - w) > 1 || Math.abs(prev.height - h) > 1) {
          return { width: w, height: h };
        }
        return prev;
      });
    };

    // Measure immediately
    measure();

    // Also measure after a short delay (handles flex/grid settling)
    const timeout = setTimeout(measure, 50);

    // STABILITY: Debounced ResizeObserver to prevent rapid-fire re-renders
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    });
    observer.observe(el);

    return () => {
      clearTimeout(timeout);
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const ready = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }}>
      {ready && (
        <ResponsiveContainer
          width="100%"
          height="100%"
          debounce={debounce}
        >
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}
