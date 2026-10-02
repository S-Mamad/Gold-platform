"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";

type WithdrawRow = {
  id: string;
  amount: string;
  createdAt: string;
  iban: string;
  user: { phoneNumber: string };
};

type DeliveryRow = {
  id: string;
  grams: string;
  createdAt: string;
  address: string;
  user: { phoneNumber: string };
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [ready, setReady] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("رد شد");

  async function load(adminKey: string) {
    const headers = { "x-admin-api-key": adminKey };
    const [w, d] = await Promise.all([
      api.get<WithdrawRow[]>("/admin/withdrawals/pending", { headers }),
      api.get<DeliveryRow[]>("/admin/deliveries/pending", { headers }),
    ]);
    setWithdrawals(w.data);
    setDeliveries(d.data);
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await load(key);
      setReady(true);
    } catch (error) {
      setErr(getErrorMessage(error, "کلید مدیر پذیرفته نشد"));
    }
  }

  async function act(path: string, body?: { reason: string }) {
    setErr(null);
    try {
      await api.post(path, body, { headers: { "x-admin-api-key": key } });
      await load(key);
    } catch (error) {
      setErr(getErrorMessage(error, "عملیات انجام نشد"));
    }
  }

  return (
    <AppShell hideTabbar>
      <div className="stack">
        <h1 className="title">میز مدیر</h1>
        {!ready ? (
          <form className="panel" onSubmit={onUnlock}>
            <label className="label" htmlFor="admin-key">
              کلید مدیر
            </label>
            <input
              id="admin-key"
              className="field"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn btn-solid">ورود</button>
          </form>
        ) : (
          <>
            <section className="panel">
              <h2 className="title" style={{ fontSize: 22 }}>
                برداشت‌های باز
              </h2>
              {withdrawals.length === 0 && <p className="empty">موردی نیست.</p>}
              {withdrawals.map((row) => (
                <div key={row.id} className="tx">
                  <div>
                    <div className="tx__type num">{row.user.phoneNumber}</div>
                    <div className="tx__meta num">{row.iban}</div>
                    <div className="tx__meta num">{row.amount} ریال</div>
                  </div>
                  <div className="stack">
                    <button
                      type="button"
                      className="btn btn-solid"
                      onClick={() => act(`/admin/withdrawals/${row.id}/approve`)}
                    >
                      تأیید
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        act(`/admin/withdrawals/${row.id}/reject`, { reason })
                      }
                    >
                      رد
                    </button>
                  </div>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2 className="title" style={{ fontSize: 22 }}>
                تحویل‌های باز
              </h2>
              {deliveries.length === 0 && <p className="empty">موردی نیست.</p>}
              {deliveries.map((row) => (
                <div key={row.id} className="tx">
                  <div>
                    <div className="tx__type num">{row.user.phoneNumber}</div>
                    <div className="tx__meta">{row.address}</div>
                    <div className="tx__meta num">{row.grams} گرم</div>
                  </div>
                  <div className="stack">
                    <button
                      type="button"
                      className="btn btn-solid"
                      onClick={() => act(`/admin/deliveries/${row.id}/approve`)}
                    >
                      تحویل شد
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        act(`/admin/deliveries/${row.id}/reject`, { reason })
                      }
                    >
                      رد و بازگشت طلا
                    </button>
                  </div>
                </div>
              ))}
              <label className="label" htmlFor="reason">
                دلیل رد
              </label>
              <input
                id="reason"
                className="field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </section>
          </>
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
