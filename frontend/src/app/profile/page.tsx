"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { JALALI_MONTHS, jalaliMonthLength, jalaliToIso } from "@/lib/jalali";
import { fetchMe, submitKyc } from "@/lib/services";
import { getErrorMessage, isValidNationalCode, toEnDigits, toFaDigits } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

function ProfileInner() {
  const router = useRouter();
  const { price, delta, loading: priceLoading, error: priceError } =
    useLiveGoldPrice();
  const { user, isAuthenticated, logout, setUser, hydrated } =
    useAuthStore();

  const [nationalCode, setNationalCode] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "پروفایل | زرین";
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMe()
      .then((user) => {
        if (user) setUser(user);
      })
      .catch(() => undefined);
  }, [isAuthenticated, setUser]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = 1387; y >= 1320; y -= 1) list.push(y);
    return list;
  }, []);

  const jy = Number(year);
  const jm = Number(month);
  const maxDay =
    Number.isFinite(jy) && Number.isFinite(jm) && jm >= 1 && jm <= 12
      ? jalaliMonthLength(jy, jm)
      : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

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
          <h1 className="title">پروفایل</h1>
          <p className="lead">برای دیدن حساب وارد شوید.</p>
          <Link href="/login?next=/profile" className="btn btn-solid">
            ورود
          </Link>
        </div>
      </AppShell>
    );
  }

  async function onKyc(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const code = toEnDigits(nationalCode).replace(/\D/g, "");
    if (!isValidNationalCode(code)) {
      setErr("کد ملی معتبر نیست");
      return;
    }
    const iso = jalaliToIso(Number(year), Number(month), Number(day));
    if (!iso) {
      setErr("تاریخ تولد شمسی را کامل انتخاب کنید");
      return;
    }
    setLoading(true);
    try {
      const result = await submitKyc(code, iso);
      setUser(result.user);
      setMsg("هویت تأیید شد");
      router.replace("/trade");
    } catch (e2) {
      setErr(getErrorMessage(e2, "احراز هویت انجام نشد"));
    } finally {
      setLoading(false);
    }
  }

  const showKyc = !user?.isKycVerified;

  return (
    <AppShell {...shellProps}>
      <div className="stack">
        <h1 className="title">پروفایل</h1>

        <section className="slip" aria-label="مشخصات">
          <div className="slip__row">
            <span className="slip__label">موبایل</span>
              <span className="slip__num num">{toFaDigits(user?.phoneNumber ?? "")}</span>
          </div>
          <div className="slip__row">
            <span className="slip__label">هویت</span>
            <span
              className="slip__num"
              style={{ color: user?.isKycVerified ? "var(--up-ink)" : "var(--stamp)" }}
            >
              {user?.isKycVerified ? "تأیید شده" : "ناقص"}
            </span>
          </div>
          {user?.nationalCode && (
            <div className="slip__row">
              <span className="slip__label">کد ملی</span>
              <span className="slip__num num">{toFaDigits(user.nationalCode)}</span>
            </div>
          )}
        </section>

        {showKyc && (
          <form className="panel" onSubmit={onKyc}>
            <div>
              <div style={{ fontWeight: 800 }}>تکمیل هویت</div>
              <p className="lead">
                کد ملی و تاریخ تولد شمسی. بعد از تأیید، خرید و فروش باز می‌شود.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="nid">
                کد ملی
              </label>
              <input
                id="nid"
                className="field num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                value={nationalCode}
                onChange={(e) =>
                  setNationalCode(toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 10))
                }
                required
              />
            </div>
            <div>
              <span className="label">تاریخ تولد</span>
              <div className="date-row">
                <select
                  className="select"
                  aria-label="سال"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setDay("");
                  }}
                  required
                >
                  <option value="">سال</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(y)}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  aria-label="ماه"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setDay("");
                  }}
                  required
                >
                  <option value="">ماه</option>
                  {JALALI_MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  aria-label="روز"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  required
                >
                  <option value="">روز</option>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn btn-solid" disabled={loading}>
              {loading ? "در حال بررسی…" : "ثبت هویت"}
            </button>
          </form>
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

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            void logout().then(() => router.push("/login"));
          }}
        >
          خروج از حساب
        </button>
      </div>
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="sk sk-slip" />
        </AppShell>
      }
    >
      <ProfileInner />
    </Suspense>
  );
}
