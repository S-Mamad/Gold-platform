import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import { AuthHydrator } from "@/components/AuthHydrator";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "زرین | معاملات طلا",
  description: "خرید و فروش طلا با مظنه لحظه‌ای",
  applicationName: "زرین",
  appleWebApp: { capable: true, title: "زرین", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0b09",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body className={vazirmatn.variable}>
        <AuthHydrator />
        <AuthGate>
          <div className="stage">{children}</div>
        </AuthGate>
      </body>
    </html>
  );
}
