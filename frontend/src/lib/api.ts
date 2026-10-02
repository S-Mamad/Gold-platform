import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 20_000,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? "");
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !url.includes("/auth/me") &&
      !url.includes("/auth/logout") &&
      !window.location.pathname.startsWith("/login")
    ) {
      const path = window.location.pathname;
      const guarded = ["/trade", "/wallet", "/profile"].some(
        (p) => path === p || path.startsWith(`${p}/`),
      );
      if (guarded) {
        window.location.href = `/login?next=${encodeURIComponent(path)}`;
      }
    }
    return Promise.reject(error);
  },
);
