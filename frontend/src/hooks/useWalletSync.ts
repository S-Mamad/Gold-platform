"use client";

import { useCallback } from "react";
import { fetchWalletBalances } from "@/lib/services";
import { useAuthStore } from "@/store/useAuthStore";

export function useWalletSync() {
  const updateWallets = useAuthStore((s) => s.updateWallets);
  const markWalletsError = useAuthStore((s) => s.markWalletsError);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const syncWallets = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const balances = await fetchWalletBalances();
      updateWallets({
        riyalBalance: Number(balances.riyalBalance),
        goldBalance: Number(balances.goldBalance),
        pendingWithdrawal: Number(balances.pendingWithdrawal),
        pendingDeliveryGrams: Number(balances.pendingDeliveryGrams),
      });
    } catch {
      markWalletsError();
    }
  }, [isAuthenticated, markWalletsError, updateWallets]);

  return { syncWallets };
}
