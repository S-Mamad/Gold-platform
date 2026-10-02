"use client";

import { useEffect, useState } from "react";
import { fetchMarket, fetchPriceHistory } from "@/lib/services";

const POLL_MS = 12_000;

type Tick = {
  price: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  feeBps: number;
  source: string;
  stale: boolean;
  paymentMode: "sandbox" | "gateway" | null;
  history: number[];
  error: boolean;
  loading: boolean;
};

let tick: Tick = {
  price: null,
  buyPrice: null,
  sellPrice: null,
  feeBps: 0,
  source: "none",
  stale: false,
  paymentMode: null,
  history: [],
  error: false,
  loading: true,
};

const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

function emit() {
  subs.forEach((fn) => fn());
}

async function pull() {
  if (inflight) return;
  inflight = true;
  try {
    const [market, history] = await Promise.all([
      fetchMarket(),
      fetchPriceHistory(120).catch(() => []),
    ]);
    const price =
      market.pricePerGram != null && Number.isFinite(market.pricePerGram)
        ? market.pricePerGram
        : null;
    tick = {
      price,
      buyPrice: market.buyPrice,
      sellPrice: market.sellPrice,
      feeBps: market.feeBps,
      source: market.source,
      stale: market.stale || price == null,
      paymentMode: market.paymentMode,
      history: history.map((point) => point.price).filter((n) => Number.isFinite(n)),
      error: price == null,
      loading: false,
    };
  } catch {
    tick = { ...tick, error: true, loading: false, stale: true };
  } finally {
    inflight = false;
    emit();
  }
}

function start() {
  if (timer) return;
  void pull();
  timer = setInterval(() => void pull(), POLL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function useLiveGoldPrice() {
  const [, setRev] = useState(0);

  useEffect(() => {
    const sub = () => setRev((n) => n + 1);
    subs.add(sub);
    start();
    return () => {
      subs.delete(sub);
      if (subs.size === 0) stop();
    };
  }, []);

  const history = tick.history;
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const delta =
    tick.price != null && prev != null ? tick.price - prev : null;

  return { ...tick, delta };
}
