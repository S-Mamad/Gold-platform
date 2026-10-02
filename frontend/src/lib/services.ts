import { api } from "./api";
import type { AuthUser } from "@/store/useAuthStore";

export type ApiResponse<T> = { success: boolean; data: T };

export type MarketSnapshot = {
  pricePerGram: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  feeBps: number;
  source: "simulated" | "feed" | "none";
  stale: boolean;
  quotedAt: string | null;
  paymentMode: "sandbox" | "gateway";
};

export type LedgerItem = {
  id: string;
  type: string;
  amount: string;
  unit: "GRAM" | "RIAL";
  pricePerGram: string | null;
  rialAmount: string | null;
  fee: string | null;
  status: string;
  createdAt: string;
};

export async function sendOtp(phoneNumber: string) {
  const { data } = await api.post<{
    success: boolean;
    message: string;
    expiresInSeconds: number;
    devOtp?: string;
  }>("/auth/send-otp", { phoneNumber });
  return data;
}

export async function verifyOtp(phoneNumber: string, otp: string) {
  const { data } = await api.post<
    ApiResponse<{
      user: AuthUser & { isNewUser?: boolean };
    }>
  >("/auth/verify-otp", { phoneNumber, otp });
  return data.data;
}

export async function logoutSession() {
  await api.post("/auth/logout");
}

export async function fetchMe() {
  const { data } = await api.get<ApiResponse<AuthUser | null>>("/auth/me");
  return data.data;
}

export async function submitKyc(nationalCode: string, birthDate: string) {
  const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/kyc", {
    nationalCode,
    birthDate,
  });
  return data.data;
}

export async function fetchMarket() {
  const { data } = await api.get<ApiResponse<MarketSnapshot>>("/gold/live-price");
  return data.data;
}

export async function fetchPriceHistory(limit = 120) {
  const { data } = await api.get<
    ApiResponse<Array<{ price: number; at: string }>>
  >("/gold/price-history", { params: { limit } });
  return data.data;
}

export async function lockGoldPrice() {
  const { data } = await api.post<
    ApiResponse<{
      mid: number;
      buyPrice: number;
      sellPrice: number;
      feeBps: number;
      expiresInSeconds: number;
      source: string;
    }>
  >("/gold/lock-price");
  return data.data;
}

export async function buyGold(requestedGrams: number, idempotencyKey: string) {
  const { data } = await api.post<
    ApiResponse<{
      rialBalance: string;
      goldBalance: string;
      totalCost: string;
      pricePerGram: string;
      fee: string;
    }>
  >("/gold/buy", { requestedGrams, idempotencyKey });
  return data.data;
}

export async function sellGold(gramsToSell: number, idempotencyKey: string) {
  const { data } = await api.post<
    ApiResponse<{
      rialBalance: string;
      goldBalance: string;
      totalCredit: string;
      pricePerGram: string;
      fee: string;
    }>
  >("/gold/sell", { gramsToSell, idempotencyKey });
  return data.data;
}

export async function fetchWalletBalances() {
  const { data } = await api.get<
    ApiResponse<{
      riyalBalance: string;
      goldBalance: string;
      pendingWithdrawal: string;
      pendingDeliveryGrams: string;
      ready: boolean;
    }>
  >("/wallet/balances");
  return data.data;
}

export async function depositFunds(amount: number, idempotencyKey: string) {
  const { data } = await api.post<
    ApiResponse<{
      riyalBalance: string;
      goldBalance: string;
      pendingWithdrawal: string;
      pendingDeliveryGrams: string;
      transactionId: string;
      status: string;
      sandbox: boolean;
    }>
  >("/wallet/deposit", { amount, idempotencyKey });
  return data.data;
}

export async function withdrawFunds(
  amount: number,
  iban: string,
  idempotencyKey: string,
) {
  const { data } = await api.post<
    ApiResponse<{
      amount: string;
      rialBalance: string;
      status: string;
    }>
  >("/wallet/withdraw", { amount, iban, idempotencyKey });
  return data.data;
}

export async function cancelWithdrawal(id: string) {
  const { data } = await api.post(`/wallet/withdrawals/${id}/cancel`);
  return data;
}

export async function requestDelivery(
  grams: number,
  address: string,
  idempotencyKey: string,
) {
  const { data } = await api.post<
    ApiResponse<{ transactionId: string; grams: string; goldBalance: string; status: string }>
  >("/wallet/deliver", { grams, address, idempotencyKey });
  return data.data;
}

export async function fetchTransactions(limit = 20, cursor?: string) {
  const { data } = await api.get<
    ApiResponse<{ items: LedgerItem[]; nextCursor: string | null }>
  >("/wallet/transactions", { params: { limit, cursor } });
  return data.data;
}

export async function fetchReceipt(id: string) {
  const { data } = await api.get<ApiResponse<LedgerItem>>(
    `/wallet/transactions/${id}`,
  );
  return data.data;
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
