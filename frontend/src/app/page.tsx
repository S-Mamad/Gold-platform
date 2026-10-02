"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PriceTrace } from "@/components/PriceTrace";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useWalletSync } from "@/hooks/useWalletSync";
import { formatRial, toFaDigits } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

function maskPhone(phone?: string) {
  if (!phone || phone.length < 8) return phone ?? "";
  return `${phone.slice(0, 4)}···${phone.slice(-2)}`;
}

export default function HomePage() {
  const { price, history, delta, loading, error } = useLiveGoldPrice();
  const { syncWallets } = useWalletSync();
  const { isAuthenticated, user, wallets, hydrated, sessionUnknown } = useAuthStore();

  useEffect(() => {
    document.title = "زرین";
  }, []);

  useEffect(() => {
    if (isAuthenticated) syncWallets().catch(() => undefined);
  }, [isAuthenticated, syncWallets]);

  const riyal = Number(wallets.riyalBalance) || 0;
  const gold = Number(wallets.goldBalance) || 0;
  const portfolio = riyal + gold * (price ?? 0);

  return (
    <AppShell price={price} delta={delta} loading={loading} error={error}>
      {!hydrated ? (
        <div className="stack" aria-busy="true">
          <div className="sk sk-line" />
          <div className="sk sk-title" />
          <div className="sk sk-slip" />
        </div>
      ) : sessionUnknown ? (
        <div className="panel gate">
          <h1 className="title">ارتباط قطع است</h1>
          <p className="lead">وضعیت ورود مشخص نشد. موجودی صفر فرض نمی‌شود.</p>
        </div>
      ) : !isAuthenticated ? (
        <div className="stack">
          <div>
            <p className="kicker">بازار طلا</p>
            <h1 className="title">مظنهٔ امروز</h1>
          </div>

          <section className="slip" aria-label="مظنه هر گرم">
            <div className="slip__top">
              <p className="slip__kicker">هر گرم، ۱۸ عیار</p>
              <div className="stamp" aria-hidden>
                ۱۸
              </div>
            </div>
            <p className="slip__value">
              {price != null ? (
                <AnimatedNumber value={price} kind="rial" />
              ) : (
                <span className="slip__missing">مظنه قطع است</span>
              )}
            </p>
            {price != null && <p className="slip__unit">ریال</p>}
            <div className="slip__foot">
              <p
                className={
                  delta == null || delta === 0
                    ? "slip__kicker"
                    : delta > 0
                      ? "slip__kicker delta--up"
                      : "slip__kicker delta--down"
                }
                style={{ margin: 0 }}
              >
                {delta == null || delta === 0
                  ? error
                    ? "مظنه فعلاً در دسترس نیست"
                    : "منتظر حرکت بعدی بازار"
                  : `${delta > 0 ? "بالاتر" : "پایین‌تر"} از تیک قبل · ${formatRial(Math.abs(delta))} ریال`}
              </p>
              <PriceTrace values={history} />
            </div>
          </section>

          <Link href="/login" className="btn btn-solid">
            ورود و شروع معامله
          </Link>
        </div>
      ) : wallets.error ? (
        <div className="panel gate">
          <h1 className="title">موجودی خوانده نشد</h1>
          <p className="lead">ارتباط با حساب قطع است. عدد صفر نشان داده نمی‌شود.</p>
        </div>
      ) : !wallets.ready ? (
        <div className="sk sk-slip" aria-busy="true" />
      ) : (
        <div className="stack">
          <div>
            <p className="kicker">
              سلام،{" "}
              <span className="num">{toFaDigits(maskPhone(user?.phoneNumber))}</span>
            </p>
            <h1 className="title">دارایی</h1>
          </div>

          <section className="slip" aria-label="ارزش دارایی">
            <div className="slip__top">
              <p className="slip__kicker">ارزش کل</p>
              <div className="stamp" aria-hidden>
                ۱۸
              </div>
            </div>
            <p className="slip__value">
              <AnimatedNumber value={portfolio} kind="rial" />
            </p>
            <p className="slip__unit">ریال · با مظنهٔ لحظه‌ای</p>
            <div className="slip__rule" />
            <div className="slip__row">
              <span className="slip__label">نقد</span>
              <span className="slip__num num">
                <AnimatedNumber value={riyal} kind="rial" /> ریال
              </span>
            </div>
            <div className="slip__row">
              <span className="slip__label">طلا</span>
              <span className="slip__num num">
                <AnimatedNumber value={gold} kind="grams" /> گرم
              </span>
            </div>
          </section>

          <div className="split">
            <Link href="/trade" className="btn btn-solid">
              خرید
            </Link>
            <Link href="/trade?mode=sell" className="btn btn-ghost">
              فروش
            </Link>
          </div>

          {!user?.isKycVerified && (
            <Link href="/profile?kyc=1" className="link-line">
              برای معامله، هویت را کامل کنید
            </Link>
          )}
        </div>
      )}
    </AppShell>
  );
}
