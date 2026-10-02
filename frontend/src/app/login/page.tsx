"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveGoldPrice } from "@/hooks/useLiveGoldPrice";
import { sendOtp, verifyOtp } from "@/lib/services";
import {
  getErrorMessage,
  normalizeIranMobile,
  safeInternalPath,
  toEnDigits,
} from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

function OtpBoxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: 5 }, (_, i) => value[i] ?? "");

  function write(index: number, raw: string) {
    const digits = toEnDigits(raw).replace(/\D/g, "");
    if (!digits) {
      const next = `${value.slice(0, index)}${value.slice(index + 1)}`;
      onChange(next);
      return;
    }
    const merged = (value.slice(0, index) + digits + value.slice(index + 1)).slice(0, 5);
    onChange(merged);
    const focusAt = Math.min(index + digits.length, 4);
    refs.current[focusAt]?.focus();
  }

  return (
    <div className="otp">
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`رقم ${i + 1}`}
          maxLength={i === 0 ? 5 : 1}
          value={ch}
          onChange={(e) => write(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !chars[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = toEnDigits(e.clipboardData.getData("text")).replace(/\D/g, "");
            if (!text) return;
            onChange(text.slice(0, 5));
            refs.current[Math.min(text.length, 4)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

function LoginInner() {
  const router = useRouter();
  const next = safeInternalPath(useSearchParams().get("next"));
  const login = useAuthStore((s) => s.login);
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { price, delta, loading: priceLoading, error: priceError } =
    useLiveGoldPrice();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "ورود | زرین";
  }, []);

  useEffect(() => {
    if (hydrated && isAuthenticated) router.replace(next);
  }, [hydrated, isAuthenticated, next, router]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeIranMobile(phone);
    if (!normalized) {
      setError("شماره را مثل ۰۹۱۲۱۲۳۴۵۶۷ وارد کنید");
      return;
    }
    setPhone(normalized);
    setLoading(true);
    try {
      const res = await sendOtp(normalized);
      if (res.devOtp) setDevOtp(res.devOtp);
      setStep("otp");
    } catch (err) {
      setError(getErrorMessage(err, "ارسال کد انجام نشد"));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = toEnDigits(otp).replace(/\D/g, "");
    if (code.length !== 5) {
      setError("کد پنج‌رقمی را کامل وارد کنید");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyOtp(phone, code);
      login({
        id: result.user.id,
        phoneNumber: result.user.phoneNumber,
        isKycVerified: result.user.isKycVerified,
      });
      router.replace(result.user.isKycVerified ? next : "/profile?kyc=1");
    } catch (err) {
      setError(getErrorMessage(err, "کد نامعتبر است"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell price={price} delta={delta} loading={priceLoading} error={priceError}>
      <div className="stack" style={{ paddingTop: 12 }}>
        <div>
          <p className="kicker">ورود</p>
          <h1 className="title">فقط با موبایل</h1>
          <p className="lead">رمز ثابت ندارید. یک کد یک‌بارمصرف می‌آید.</p>
        </div>

        <div className="panel">
          {step === "phone" ? (
            <form onSubmit={onSend} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" htmlFor="phone">
                  شماره موبایل
                </label>
                <input
                  id="phone"
                  className="field num"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09121234567"
                  value={phone}
                  onChange={(e) => setPhone(toEnDigits(e.target.value))}
                  required
                />
              </div>
              <button className="btn btn-solid" disabled={loading}>
                {loading ? "در حال ارسال…" : "دریافت کد"}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerify} style={{ display: "grid", gap: 14 }}>
              <p className="lead" style={{ margin: 0 }}>
                کد به <span className="num">{phone}</span> فرستاده شد.
              </p>
              {devOtp && (
                <div className="dev-otp">
                  کد توسعه:{" "}
                  <strong className="num" style={{ letterSpacing: "0.18em" }}>
                    {devOtp}
                  </strong>
                </div>
              )}
              <div>
                <span className="label">کد پنج‌رقمی</span>
                <OtpBoxes value={otp} onChange={setOtp} />
              </div>
              <button className="btn btn-solid" disabled={loading || otp.length < 5}>
                {loading ? "در حال ورود…" : "تأیید و ورود"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setDevOtp(null);
                  setError(null);
                }}
              >
                تغییر شماره
              </button>
            </form>
          )}
          {error && (
            <p className="note-err" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="sk sk-slip" />
        </AppShell>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
