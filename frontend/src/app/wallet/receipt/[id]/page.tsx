"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { fetchReceipt, type LedgerItem } from "@/lib/services";
import {
  formatGrams,
  formatRial,
  formatRelativeFa,
  getErrorMessage,
  txStatusLabel,
  txTypeLabel,
} from "@/lib/utils";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [row, setRow] = useState<LedgerItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "رسید | زرین";
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchReceipt(id)
      .then(setRow)
      .catch((error) => setErr(getErrorMessage(error, "رسید پیدا نشد")));
  }, [id]);

  const amount =
    row == null
      ? ""
      : row.unit === "GRAM"
        ? `${formatGrams(row.amount)} گرم`
        : `${formatRial(row.amount)} ریال`;

  return (
    <AppShell>
      <div className="stack">
        <Link href="/wallet" className="link-line">
          بازگشت به کیف
        </Link>
        <h1 className="title">رسید</h1>
        {err && (
          <p className="note-err" role="alert">
            {err}
          </p>
        )}
        {row && (
          <section className="slip" aria-label="جزئیات رسید">
            <div className="slip__row">
              <span className="slip__label">نوع</span>
              <span className="slip__num">{txTypeLabel(row.type)}</span>
            </div>
            <div className="slip__row">
              <span className="slip__label">مبلغ</span>
              <span className="slip__num num">{amount}</span>
            </div>
            {row.rialAmount && row.unit === "GRAM" && (
              <div className="slip__row">
                <span className="slip__label">معادل ریال</span>
                <span className="slip__num num">{formatRial(row.rialAmount)}</span>
              </div>
            )}
            {row.fee && (
              <div className="slip__row">
                <span className="slip__label">کارمزد</span>
                <span className="slip__num num">{formatRial(row.fee)} ریال</span>
              </div>
            )}
            <div className="slip__row">
              <span className="slip__label">وضعیت</span>
              <span className="slip__num">{txStatusLabel(row.status)}</span>
            </div>
            <div className="slip__row">
              <span className="slip__label">زمان</span>
              <span className="slip__num">{formatRelativeFa(row.createdAt)}</span>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
