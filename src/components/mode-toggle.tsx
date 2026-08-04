'use client';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

const themes = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
] as const;

export const ModeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // `theme` is undefined until next-themes reads localStorage on the client, so
  // hold back the active styling until mount to keep the markup in sync.
  useEffect(() => setMounted(true), []);

  const activeIndex = themes.findIndex((t) => t.value === theme);

  const switchTheme = (value: (typeof themes)[number]['value']) => {
    if (value === theme) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // Fall back to an instant swap where the API is missing (Firefox/Safari) or
    // where the user has asked for less motion.
    if (!document.startViewTransition || prefersReducedMotion) {
      setTheme(value);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => setTheme(value));
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="relative flex items-center rounded-full border bg-muted/40 p-0.5"
    >
      {/* Sliding indicator behind the active icon */}
      {mounted && activeIndex !== -1 && (
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 size-7 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${activeIndex * 28}px)` }}
        />
      )}

      {themes.map(({ value, label, icon: Icon }) => {
        const isActive = mounted && theme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            title={`${label} theme`}
            aria-label={`${label} theme`}
            aria-checked={isActive}
            onClick={() => switchTheme(value)}
            className={cn(
              'relative z-10 flex size-7 items-center justify-center rounded-full transition-colors duration-200',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
};
