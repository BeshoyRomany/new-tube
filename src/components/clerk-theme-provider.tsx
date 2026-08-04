'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { useTheme } from 'next-themes';

interface ClerkThemeProviderProps {
  children: React.ReactNode;
}

// Clerk renders its own UI outside our Tailwind tree, so it needs the resolved
// theme handed to it explicitly instead of inheriting the `.dark` class.
export const ClerkThemeProvider = ({ children }: ClerkThemeProviderProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      afterSignOutUrl={'/'}
      appearance={{
        baseTheme: resolvedTheme === 'dark' ? dark : undefined,
      }}
    >
      {children}
    </ClerkProvider>
  );
};
