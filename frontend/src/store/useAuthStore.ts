import { create } from "zustand";
import { fetchMe, logoutSession } from "@/lib/services";

export type AuthUser = {
  id: string;
  phoneNumber: string;
  isKycVerified: boolean;
  nationalCode?: string | null;
};

export type WalletsState = {
  riyalBalance: number;
  goldBalance: number;
  pendingWithdrawal: number;
  pendingDeliveryGrams: number;
  ready: boolean;
  error: boolean;
};

type AuthStore = {
  isAuthenticated: boolean;
  sessionUnknown: boolean;
  user: AuthUser | null;
  wallets: WalletsState;
  hydrated: boolean;
  login: (userData: AuthUser) => void;
  logout: () => Promise<void>;
  updateWallets: (next: Partial<WalletsState> & { riyalBalance: number; goldBalance: number }) => void;
  markWalletsError: () => void;
  setUser: (user: AuthUser) => void;
  hydrate: () => Promise<void>;
};

const emptyWallets = (): WalletsState => ({
  riyalBalance: 0,
  goldBalance: 0,
  pendingWithdrawal: 0,
  pendingDeliveryGrams: 0,
  ready: false,
  error: false,
});

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  sessionUnknown: false,
  user: null,
  wallets: emptyWallets(),
  hydrated: false,

  login: (userData) => {
    set({
      isAuthenticated: true,
      sessionUnknown: false,
      user: userData,
      hydrated: true,
    });
  },

  logout: async () => {
    try {
      await logoutSession();
    } catch {
      /* cookie may already be gone */
    }
    set({
      isAuthenticated: false,
      sessionUnknown: false,
      user: null,
      wallets: emptyWallets(),
      hydrated: true,
    });
  },

  updateWallets: (next) => {
    set({
      wallets: {
        riyalBalance: next.riyalBalance,
        goldBalance: next.goldBalance,
        pendingWithdrawal: next.pendingWithdrawal ?? get().wallets.pendingWithdrawal,
        pendingDeliveryGrams:
          next.pendingDeliveryGrams ?? get().wallets.pendingDeliveryGrams,
        ready: true,
        error: false,
      },
    });
  },

  markWalletsError: () => {
    set({ wallets: { ...get().wallets, ready: false, error: true } });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: true, sessionUnknown: false });
  },

  hydrate: async () => {
    try {
      const user = await fetchMe();
      if (!user) {
        set({
          isAuthenticated: false,
          sessionUnknown: false,
          user: null,
          hydrated: true,
        });
        return;
      }
      set({
        isAuthenticated: true,
        sessionUnknown: false,
        user,
        hydrated: true,
      });
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        set({
          isAuthenticated: false,
          sessionUnknown: false,
          user: null,
          hydrated: true,
        });
        return;
      }
      set({ sessionUnknown: true, hydrated: true });
    }
  },
}));
