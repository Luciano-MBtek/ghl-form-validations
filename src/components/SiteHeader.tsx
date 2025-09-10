"use client";

import Image from "next/image";
import Link from "next/link";

type SiteHeaderProps = {
  title?: string;
  subtitle?: string;
  href?: string;
};

export default function SiteHeader({ title, subtitle, href }: SiteHeaderProps) {
  const Logo = (
    <Image src="/MBTEK.avif" alt="MBTEK" width={160} height={40} priority />
  );

  return (
    <header role="banner" className="sticky top-0 z-40 bg-white border-b">
      <div className="max-w-4xl mx-auto px-4 py-3 md:py-4">
        <div className="flex flex-col items-center gap-2 md:flex-row md:items-center md:justify-between">
          <div className="shrink-0">
            {href ? <Link href={href}>{Logo}</Link> : Logo}
          </div>
          <div className="text-center md:text-right">
            {title ? (
              <div className="text-sm md:text-base font-medium text-slate-700">
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div className="text-xs md:text-sm text-slate-500">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
