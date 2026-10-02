"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useWalletSync } from "@/hooks/useWalletSync";
import {
  buyGold,
  lockGoldPrice,
  newIdempotencyKey,
  sellGold,
} from "@/lib/services";
import {
  formatGrams,
  formatRial,
  formatSeconds,
  getErrorMessage,
  isAmbiguousFailure,
  parseLooseNumber,
  trimGrams,
} from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

const QUICK = [0.5, 1, 2, 5];

function TradeInner() {
  const router = useRouter();
  const modeParam = useSearchParams().get("mode") === "sell" ? "sell" : "buy";
  const {
    price,
    buyPrice,
    sellPrice,
    feeBps,
    stale,
    delta,
    loading: priceLoading,
    error: priceError,
  } = useLiveGoldPrice();
  const { syncWallets } = useWalletSync();
  const updateWallets = useAuthStore((s) => s.updateWallets);
  const wallets = useAuthStore((s) => s.wallets);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [mode, setMode] = useState<"buy" | "sell">(modeParam);
  const [grams, setGrams] = useState("1");
  const [lock, setLock] = useState<{
    price: number;
    until: number;
    total: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const idem = useRef<string | null>(null);

  useEffect(() => {
    document.title = "معامله | زرین";
  }, []);

  useEffect(() => {
    setMode(modeParam);
    idem.current = null;
  }, [modeParam]);

  useEffect(() => {
    if (isAuthenticated) syncWallets().catch(() => undefined);
  }, [isAuthenticated, syncWallets]);

  useEffect(() => {
    if (!lock) return;
    if (Date.now() >= lock.until) {
      setLock(null);
      return;
    }
    const id = window.setInterval(() => {
      if (Date.now() >= lock.until) setLock(null);
      else setNow(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [lock]);

  const remainMs = lock ? lock.until - now : 0;
  const ttl = lock && remainMs > 0 ? Math.ceil(remainMs / 1000) : 0;
  const active = ttl > 0 && lock ? lock.price : null;
  const g = parseLooseNumber(grams);
  const riyal = Number(wallets.riyalBalance) || 0;
  const gold = Number(wallets.goldBalance) || 0;

  const sideQuote = mode === "sell" ? sellPrice : buyPrice;
  const estimate = useMemo(() => {
    const quote = active ?? sideQuote ?? price;
    if (!quote || !Number.isFinite(g) || g <= 0) return null;
    return g * quote;
  }, [active, sideQuote, price, g]);

  const gramsInvalid = !Number.isFinite(g) || g <= 0 || g > 1000;
  const fundsShort =
    mode === "buy"
      ? estimate != null && estimate > riyal + 0.5
      : Number.isFinite(g) && g > gold + 0.0000001;

  if (!hydrated) {
    return (
      <AppShell price={price} delta={delta} loading={priceLoading} error={priceError}>
        <div className="sk sk-slip" aria-busy="true" />
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell price={price} delta={delta} loading={priceLoading} error={priceError}>
        <div className="panel gate">
          <h1 className="title">برای معامله وارد شوید</h1>
          <p className="lead">خرید و فروش فقط با حساب خودتان انجام می‌شود.</p>
          <Link href="/login?next=/trade" className="btn btn-solid">
            ورود
          </Link>
        </div>
      </AppShell>
    );
  }

  if (user && !user.isKycVerified) {
    return (
      <AppShell price={price} delta={delta} loading={priceLoading} error={priceError}>
        <div className="panel gate">
          <h1 className="title">هویت ناقص است</h1>
          <p className="lead">قبل از معامله، کد ملی و تاریخ تولد را ثبت کنید.</p>
          <Link href="/profile?kyc=1" className="btn btn-solid">
            تکمیل هویت
          </Link>
        </div>
      </AppShell>
    );
  }

  async function lockPrice() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const data = await lockGoldPrice();
      const total = Math.max(1, data.expiresInSeconds);
      setLock({
        price: mode === "sell" ? data.sellPrice : data.buyPrice,
        until: Date.now() + total * 1000,
        total,
      });
      setNow(Date.now());
      setMsg(`قیمت برای ${formatSeconds(total)} قفل شد`);
    } catch (e) {
      setErr(getErrorMessage(e, "قفل قیمت انجام نشد"));
    } finally {
      setLoading(false);
    }
  }

  async function trade() {
    setErr(null);
    setMsg(null);
    if (gramsInvalid) {
      setErr("مقدار باید بین یک‌هزارم گرم تا ۱۰۰۰ گرم باشد");
      return;
    }
    if (!active) {
      setErr("اول قیمت را قفل کنید");
      return;
    }
    if (fundsShort) {
      setErr(mode === "buy" ? "موجودی ریال کافی نیست" : "موجودی طلا کافی نیست");
      return;
    }

    setLoading(true);
    const key = idem.current ?? (idem.current = newIdempotencyKey(mode));
    try {
      if (mode === "buy") {
        const r = await buyGold(g, key);
        updateWallets({
          riyalBalance: Number(r.rialBalance),
          goldBalance: Number(r.goldBalance),
        });
        setMsg(`خرید ثبت شد · ${formatRial(r.totalCost)} ریال`);
      } else {
        const r = await sellGold(g, key);
        updateWallets({
          riyalBalance: Number(r.rialBalance),
          goldBalance: Number(r.goldBalance),
        });
        setMsg(`فروش ثبت شد · ${formatRial(r.totalCredit)} ریال`);
      }
      idem.current = null;
      setLock(null);
    } catch (e) {
      if (!isAmbiguousFailure(e)) idem.current = null;
      setErr(
        isAmbiguousFailure(e)
          ? "ارتباط قطع شد. همان دکمه را دوباره بزنید تا سفارش تکراری نشود."
          : getErrorMessage(e, "معامله انجام نشد"),
      );
    } finally {
      setLoading(false);
    }
  }

  function chooseMode(next: "buy" | "sell") {
    setMode(next);
    setLock(null);
    idem.current = null;
    router.replace(next === "sell" ? "/trade?mode=sell" : "/trade");
  }

  function fillMax() {
    if (mode === "sell") {
      setGrams(trimGrams(gold));
      return;
    }
    const quote = active ?? sideQuote ?? price;
    if (!quote || riyal <= 0) return;
    const max = Math.floor((riyal / quote) * 10000) / 10000;
    setGrams(trimGrams(max));
  }

  const progress = lock && ttl > 0 ? Math.max(0, (ttl / lock.total) * 100) : 0;
  const shownQuote = active ?? sideQuote ?? price;

  return (
    <AppShell price={price} delta={delta} loading={priceLoading} error={priceError}>
      <div className="stack">
        <div>
          <h1 className="title">معامله</h1>
          <p className="lead">قیمت را قفل کنید، بعد سفارش را تأیید کنید.</p>
        </div>

        <div className="seg" role="tablist" aria-label="نوع معامله">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "buy"}
            className={mode === "buy" ? "on" : undefined}
            onClick={() => chooseMode("buy")}
          >
            خرید
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sell"}
            className={mode === "sell" ? "on" : undefined}
            onClick={() => chooseMode("sell")}
          >
            فروش
          </button>
        </div>

        <div className="panel">
          <div>
            <label className="label" htmlFor="grams">
              مقدار به گرم
            </label>
            <input
              id="grams"
              className="field num"
              dir="ltr"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
            />
            <div className="quick">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={grams === String(q) ? "on" : undefined}
                  onClick={() => setGrams(String(q))}
                >
                  {q} گرم
                </button>
              ))}
              <button type="button" onClick={fillMax}>
                حداکثر
              </button>
            </div>
            {gramsInvalid && grams !== "" && (
              <p className="hint hint--bad">مقدار نامعتبر است</p>
            )}
            {!gramsInvalid && fundsShort && (
              <p className="hint hint--bad">
                {mode === "buy" ? "موجودی ریال کافی نیست" : "موجودی طلا کافی نیست"}
              </p>
            )}
          </div>

          <section className="slip" aria-label="پیش‌فاکتور">
            {ttl > 0 && (
              <div
                className="lockbar"
                style={{ ["--p" as string]: progress }}
                aria-hidden
              >
                <span />
              </div>
            )}
            <div className="slip__row">
              <span className="slip__label">
                {active ? "قیمت قفل‌شده" : "مظنهٔ بازار"}
              </span>
              <strong className="slip__num num">
                {shownQuote ? formatRial(shownQuote) : "—"}
              </strong>
            </div>
            <div className="slip__row">
              <span className="slip__label">جمع</span>
              <strong className="slip__num num">
                {estimate != null ? `${formatRial(estimate)} ریال` : "—"}
              </strong>
            </div>
            <div className="slip__row">
              <span className="slip__label">کارمزد</span>
              <strong className="slip__num num">{feeBps} در ده هزار</strong>
            </div>
            {ttl > 0 && (
              <div className="slip__row">
                <span className="slip__label">اعتبار قفل</span>
                <strong className="slip__num num">{formatSeconds(ttl)}</strong>
              </div>
            )}
          </section>

          <p className="hint" style={{ margin: 0 }}>
            موجودی شما{" "}
            <span className="num">
              {formatRial(riyal)} ریال · {formatGrams(gold)} گرم
            </span>
          </p>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || stale || shownQuote == null}
            onClick={lockPrice}
          >
            {active ? "قفل دوباره" : "قفل قیمت"}
          </button>
          <button
            type="button"
            className="btn btn-solid"
            disabled={loading || !active || gramsInvalid || fundsShort}
            onClick={trade}
          >
            {loading
              ? "در حال ثبت…"
              : mode === "buy"
                ? "تأیید خرید"
                : "تأیید فروش"}
          </button>
        </div>

          {stale && (
            <p className="note-err" role="status">
              مظنه کهنه است. تا تازه شدن قیمت، قفل بسته است.
            </p>
          )}
          {msg && (
            <p className="note-ok" role="status">
              {msg}
            </p>
          )}
        {err && (
          <p className="note-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </AppShell>
  );
}

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="sk sk-slip" />
        </AppShell>
      }
    >
      <TradeInner />
    </Suspense>
  );
}
