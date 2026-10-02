"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { useWalletSync } from "@/hooks/useWalletSync";
import {
  cancelWithdrawal,
  depositFunds,
  fetchTransactions,
  newIdempotencyKey,
  requestDelivery,
  withdrawFunds,
  type LedgerItem,
} from "@/lib/services";
import {
  formatGrams,
  formatRelativeFa,
  formatRial,
  getErrorMessage,
  isAmbiguousFailure,
  isValidIban,
  normalizeIban,
  parseLooseNumber,
  txStatusLabel,
  txTypeLabel,
} from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

type Tx = LedgerItem;

const DEPOSIT_CHIPS = [1_000_000, 5_000_000, 10_000_000, 50_000_000];

function txView(t: Tx) {
  if (t.unit === "GRAM") {
    return {
      main: `${formatGrams(t.amount)} گرم`,
      sub: t.rialAmount ? `${formatRial(t.rialAmount)} ریال` : null,
    };
  }
  return { main: `${formatRial(t.amount)} ریال`, sub: null };
}

export default function WalletPage() {
  const { price, delta, loading: priceLoading, error: priceError, paymentMode } =
    useLiveGoldPrice();
  const wallets = useAuthStore((s) => s.wallets);
  const updateWallets = useAuthStore((s) => s.updateWallets);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const { syncWallets } = useWalletSync();

  const [tab, setTab] = useState<"deposit" | "withdraw" | "deliver" | "history">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [iban, setIban] = useState("");
  const [deliverGrams, setDeliverGrams] = useState("");
  const [address, setAddress] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const idem = useRef<string | null>(null);

  useEffect(() => {
    document.title = "کیف پول | زرین";
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    syncWallets().catch(() => undefined);
    fetchTransactions()
      .then((page) => {
        setTxs(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch(() => undefined);
  }, [isAuthenticated, syncWallets]);

  function switchTab(next: typeof tab) {
    setTab(next);
    setMsg(null);
    setErr(null);
    idem.current = null;
  }

  const shellProps = {
    price,
    delta,
    loading: priceLoading,
    error: priceError,
  };

  if (!hydrated) {
    return (
      <AppShell {...shellProps}>
        <div className="sk sk-slip" aria-busy="true" />
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell {...shellProps}>
        <div className="panel gate">
          <h1 className="title">کیف پول</h1>
          <p className="lead">برای دیدن موجودی وارد شوید.</p>
          <Link href="/login?next=/wallet" className="btn btn-solid">
            ورود
          </Link>
        </div>
      </AppShell>
    );
  }

  const riyal = Number(wallets.riyalBalance) || 0;
  const gold = Number(wallets.goldBalance) || 0;
  const pendingWithdrawal = Number(wallets.pendingWithdrawal) || 0;
  const pendingDelivery = Number(wallets.pendingDeliveryGrams) || 0;

  async function reloadTx() {
    const page = await fetchTransactions();
    setTxs(page.items);
    setNextCursor(page.nextCursor);
  }

  async function onDeposit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const amount = parseLooseNumber(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("مبلغ واریز را وارد کنید");
      return;
    }
    setLoading(true);
    const key = idem.current ?? (idem.current = newIdempotencyKey("deposit"));
    try {
      const data = await depositFunds(amount, key);
      await syncWallets();
      idem.current = null;
      setDepositAmount("");
      setMsg(
        data.sandbox
          ? "واریز آزمایشی ثبت شد و موجودی زیاد شد."
          : "درخواست واریز ثبت شد و تا تأیید درگاه موجودی عوض نمی‌شود.",
      );
      const page = await fetchTransactions();
      setTxs(page.items);
      setNextCursor(page.nextCursor);
    } catch (e2) {
      if (!isAmbiguousFailure(e2)) idem.current = null;
      setErr(
        isAmbiguousFailure(e2)
          ? "ارتباط قطع شد. دوباره بزنید تا واریز تکراری نشود."
          : getErrorMessage(e2, "واریز انجام نشد"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onWithdraw(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const amount = parseLooseNumber(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("مبلغ برداشت را وارد کنید");
      return;
    }
    if (amount > riyal) {
      setErr("موجودی ریال کافی نیست");
      return;
    }
    const normalized = normalizeIban(iban);
    if (!isValidIban(normalized)) {
      setErr("شبا نامعتبر است یا رقم کنترل آن درست نیست");
      return;
    }
    setLoading(true);
    const key = idem.current ?? (idem.current = newIdempotencyKey("withdraw"));
    try {
      await withdrawFunds(amount, normalized, key);
      await syncWallets();
      idem.current = null;
      setWithdrawAmount("");
      setIban("");
      setMsg("برداشت ثبت شد و منتظر تأیید است");
      const page = await fetchTransactions();
      setTxs(page.items);
      setNextCursor(page.nextCursor);
      setTab("history");
    } catch (e2) {
      if (!isAmbiguousFailure(e2)) idem.current = null;
      setErr(
        isAmbiguousFailure(e2)
          ? "ارتباط قطع شد. دوباره بزنید تا برداشت تکراری نشود."
          : getErrorMessage(e2, "برداشت انجام نشد"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onCancel(id: string) {
    setErr(null);
    setLoading(true);
    try {
      await cancelWithdrawal(id);
      await syncWallets();
      await reloadTx();
      setMsg("برداشت لغو شد و مبلغ برگشت");
    } catch (e2) {
      setErr(getErrorMessage(e2, "لغو برداشت انجام نشد"));
    } finally {
      setLoading(false);
    }
  }

  async function onDeliver(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const grams = parseLooseNumber(deliverGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setErr("مقدار تحویل را وارد کنید");
      return;
    }
    if (address.trim().length < 8) {
      setErr("نشانی تحویل را کامل بنویسید");
      return;
    }
    setLoading(true);
    const key = idem.current ?? (idem.current = newIdempotencyKey("deliver"));
    try {
      await requestDelivery(grams, address.trim(), key);
      await syncWallets();
      idem.current = null;
      setDeliverGrams("");
      setAddress("");
      setMsg("درخواست تحویل ثبت شد و طلا تا تأیید بلوکه است");
      await reloadTx();
      setTab("history");
    } catch (e2) {
      if (!isAmbiguousFailure(e2)) idem.current = null;
      setErr(getErrorMessage(e2, "تحویل ثبت نشد"));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await fetchTransactions(20, nextCursor);
      setTxs((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e2) {
      setErr(getErrorMessage(e2, "ادامه تاریخچه خوانده نشد"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell {...shellProps}>
      <div className="stack">
        <h1 className="title">کیف پول</h1>

        <section className="slip" aria-label="موجودی">
          <p className="slip__kicker">نقد قابل استفاده</p>
          <p className="slip__value">
            <AnimatedNumber value={riyal} kind="rial" />
          </p>
          <p className="slip__unit">ریال</p>
          <div className="slip__rule" />
          <div className="slip__row">
            <span className="slip__label">طلا</span>
            <span className="slip__num num">{formatGrams(gold)} گرم</span>
          </div>
          {pendingWithdrawal > 0 && (
            <div className="slip__row">
              <span className="slip__label">برداشت در انتظار</span>
              <span className="slip__num num">{formatRial(pendingWithdrawal)} ریال</span>
            </div>
          )}
          {pendingDelivery > 0 && (
            <div className="slip__row">
              <span className="slip__label">تحویل در انتظار</span>
              <span className="slip__num num">{formatGrams(pendingDelivery)} گرم</span>
            </div>
          )}
          {wallets.error && (
            <p className="hint hint--bad">آخرین موجودی خوانده نشد.</p>
          )}
        </section>

        <div className="seg seg--4" role="tablist" aria-label="عملیات کیف">
          {(
            [
              ["deposit", "واریز"],
              ["withdraw", "برداشت"],
              ["deliver", "تحویل"],
              ["history", "تاریخچه"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "on" : undefined}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "deposit" && paymentMode === "gateway" && (
          <div className="panel gate">
            <h2 className="title" style={{ fontSize: 22 }}>
              واریز از درگاه
            </h2>
            <p className="lead">
              شارژ آزمایشی خاموش است. موجودی فقط بعد از امضای بانک زیاد می‌شود.
            </p>
          </div>
        )}

        {tab === "deposit" && paymentMode === "sandbox" && (
          <form className="panel" onSubmit={onDeposit}>
            <p className="lead" style={{ margin: 0 }}>
              واریز آزمایشی برای شارژ موجودی، تا درگاه بانکی وصل شود.
            </p>
            <div>
              <label className="label" htmlFor="deposit">
                مبلغ به ریال
              </label>
              <input
                id="deposit"
                className="field num"
                dir="ltr"
                inputMode="numeric"
                placeholder="مبلغ"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <div className="quick">
                {DEPOSIT_CHIPS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={depositAmount === String(n) ? "on" : undefined}
                    onClick={() => setDepositAmount(String(n))}
                  >
                    {formatRial(n)}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-solid" disabled={loading}>
              {loading ? "در حال واریز…" : "واریز"}
            </button>
          </form>
        )}

        {tab === "deposit" && paymentMode == null && (
          <p className="empty">وضعیت درگاه هنوز مشخص نیست.</p>
        )}

        {tab === "withdraw" && !user?.isKycVerified && (
          <div className="panel gate">
            <h2 className="title" style={{ fontSize: 22 }}>
              برداشت بعد از هویت
            </h2>
            <p className="lead">موجودی را می‌بینید، اما برداشت به شبا نیاز به احراز دارد.</p>
            <Link href="/profile?kyc=1" className="btn btn-solid">
              تکمیل هویت
            </Link>
          </div>
        )}

        {tab === "withdraw" && user?.isKycVerified && (
          <form className="panel" onSubmit={onWithdraw}>
            <p className="lead" style={{ margin: 0 }}>
              مبلغ همین حالا از موجودی کم می‌شود و بعد از تأیید به شبا می‌رود.
            </p>
            <div>
              <label className="label" htmlFor="withdraw">
                مبلغ به ریال
              </label>
              <input
                id="withdraw"
                className="field num"
                dir="ltr"
                inputMode="numeric"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="iban">
                شماره شبا
              </label>
              <input
                id="iban"
                className="field num"
                dir="ltr"
                placeholder="IR"
                autoComplete="off"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
              />
            </div>
            <button className="btn btn-solid" disabled={loading}>
              {loading ? "در حال ثبت…" : "ثبت برداشت"}
            </button>
          </form>
        )}

        {tab === "deliver" && !user?.isKycVerified && (
          <div className="panel gate">
            <h2 className="title" style={{ fontSize: 22 }}>
              تحویل بعد از هویت
            </h2>
            <Link href="/profile?kyc=1" className="btn btn-solid">
              تکمیل هویت
            </Link>
          </div>
        )}

        {tab === "deliver" && user?.isKycVerified && (
          <form className="panel" onSubmit={onDeliver}>
            <p className="lead" style={{ margin: 0 }}>
              گرم درخواستی همین حالا از موجودی کم می‌شود. رد شدن درخواست، طلا را برمی‌گرداند.
            </p>
            <div>
              <label className="label" htmlFor="deliver-grams">
                مقدار به گرم
              </label>
              <input
                id="deliver-grams"
                className="field num"
                dir="ltr"
                inputMode="decimal"
                value={deliverGrams}
                onChange={(e) => setDeliverGrams(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="address">
                نشانی
              </label>
              <input
                id="address"
                className="field"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <button className="btn btn-solid" disabled={loading}>
              {loading ? "در حال ثبت…" : "درخواست تحویل"}
            </button>
          </form>
        )}

        {tab === "history" && (
          <div>
            {txs.length === 0 ? (
              <p className="empty">
                هنوز تراکنشی نیست.
                <br />
                با واریز یا معامله، اینجا پر می‌شود.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {txs.map((t) => {
                  const view = txView(t);
                  return (
                    <li key={t.id} className="tx">
                      <div>
                        <div className="tx__type">
                          <Link href={`/wallet/receipt/${t.id}`}>{txTypeLabel(t.type)}</Link>
                        </div>
                        <div className="tx__meta">
                          {formatRelativeFa(t.createdAt)}
                          {" · "}
                          {txStatusLabel(t.status)}
                        </div>
                        {t.type === "WITHDRAW" && t.status === "PENDING" && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={loading}
                            onClick={() => onCancel(t.id)}
                          >
                            لغو برداشت
                          </button>
                        )}
                      </div>
                      <div className="tx__amt num">
                        {view.main}
                        {view.sub && <small className="num">{view.sub}</small>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {nextCursor && (
              <button type="button" className="btn btn-ghost" disabled={loading} onClick={loadMore}>
                تراکنش‌های قدیمی‌تر
              </button>
            )}
          </div>
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
