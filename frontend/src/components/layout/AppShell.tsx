"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Home, UserRound, Wallet } from "lucide-react";
import { formatRial } from "@/lib/utils";

const tabs = [
  { href: "/", label: "خانه", icon: Home },
  { href: "/trade", label: "معامله", icon: ArrowLeftRight },
  { href: "/wallet", label: "کیف پول", icon: Wallet },
  { href: "/profile", label: "پروفایل", icon: UserRound },
] as const;

export function AppShell({
  children,
  price,
  delta,
  loading = false,
  error = false,
  hideTabbar = false,
}: {
  children: React.ReactNode;
  price?: number | null;
  delta?: number | null;
  loading?: boolean;
  error?: boolean;
  hideTabbar?: boolean;
}) {
  const pathname = usePathname();
  const state =
    price == null && (loading || !error)
      ? "wait"
      : error && price == null
        ? "down"
        : error
          ? "stale"
          : "live";

  const stateLabel =
    state === "wait"
      ? "در حال دریافت"
      : state === "down"
        ? "مظنه قطع"
        : state === "stale"
          ? "آخرین مظنه"
          : "زنده";

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="brand__mark" aria-hidden>
            ز
          </div>
          <div>
            <div className="brand__name">زرین</div>
            <div className="brand__meta">۱۸ عیار · هر گرم</div>
          </div>
        </div>

        <div className="quote">
          <div className="quote__top">
            <span className={`dot dot--${state}`} aria-hidden />
            <span>{stateLabel}</span>
          </div>
          <div className="quote__price num">
            {price != null ? formatRial(price) : "—"}
          </div>
          <div
            className={
              delta == null || delta === 0
                ? "quote__delta"
                : delta > 0
                  ? "quote__delta delta--up"
                  : "quote__delta delta--down"
            }
          >
            {delta != null && delta !== 0
              ? `${delta > 0 ? "▲" : "▼"} ${formatRial(Math.abs(delta))}`
              : ""}
          </div>
        </div>
      </header>

      <div id="app">
        <div className="pad">{children}</div>
      </div>

      {!hideTabbar && (
        <nav className="tabbar" aria-label="منو">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
