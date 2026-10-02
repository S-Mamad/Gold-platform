# زرین

خرید و فروش طلای ۱۸ عیار. رابط روی Next.js و حساب، قیمت، و کیف‌پول روی NestJS.

## اجرای محلی

Postgres و Redis باید بالا باشند. بعد:

```bash
cd backend
cp .env.example .env
npx prisma migrate dev
npm run start:dev
```

```bash
cd frontend
cp .env.example .env.local
npm run dev
```

مرورگر فقط به Next وصل می‌شود. مسیر `/api` روی سرور به `API_PROXY_TARGET` (پیش‌فرض `http://localhost:3001`) فرستاده می‌شود و کوکی نشست روی همان مبدأ می‌ماند.

برای دیدن کد یک‌بارمصرف در محیط توسعه، `EXPOSE_DEV_OTP=true` و `NODE_ENV=development` لازم است. در تولید این پرچم نادیده گرفته می‌شود.

## تولید

اگر `NODE_ENV=production` باشد، برنامه با رمزهای نمونه، قیمت شبیه‌سازی‌شده، یا احراز ساختگی بالا نمی‌آید مگر پرچم‌ها صریح باشند:

- `JWT_SECRET` و `ADMIN_API_KEY` طولانی و غیرتکراری
- `GOLD_PRICE_SOURCE=http` و `GOLD_PRICE_URL`، یا فقط برای دمو `GOLD_ALLOW_SIMULATED=true`
- `PAYMENT_MODE=gateway` با `PAYMENT_WEBHOOK_SECRET`؛ واریز آزمایشی فقط با `PAYMENT_MODE=sandbox`
- `KYC_MODE=live` تا سرویس شاهکار وصل شود؛ `mock` فقط برای دمو

امضای بازگشت بانک: HMAC-SHA256 روی `transactionId|amount` با چهار رقم اعشار، به‌صورت hex.

## تست

```bash
cd backend && npx prisma generate && npx jest
cd frontend && npx tsc --noEmit
```
