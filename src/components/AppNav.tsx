'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/explore', label: 'Explore' },
  { href: '/favorites', label: 'Favorites' },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
      <Link href="/" className="font-semibold text-[#FC5200]">
        Buurtheld
      </Link>
      <nav className="flex gap-1">
        {LINKS.map((l) => {
          const isActive = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                isActive
                  ? 'rounded-md bg-[#FC5200] px-3 py-1 text-sm font-semibold text-white'
                  : 'rounded-md px-3 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-100'
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
