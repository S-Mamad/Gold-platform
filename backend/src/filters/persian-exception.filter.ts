import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { clearSessionCookie } from '../http/session-cookie';

const FA: Record<string, string> = {
  'Price lock expired. Please request a new price.':
    'زمان مظنه تمام شده. لطفاً مظنه جدید بگیرید.',
  'Insufficient Riyal balance': 'موجودی ریالی کافی نیست',
  'Insufficient Gold balance': 'موجودی طلا کافی نیست',
  'Invalid or expired OTP': 'کد تأیید نامعتبر یا منقضی شده است',
  'Invalid national code': 'کد ملی نامعتبر است',
  'National code already registered': 'این کد ملی قبلاً ثبت شده است',
  'KYC verification required before trading or withdrawals':
    'قبل از معامله باید احراز هویت کنید',
  'Missing or invalid Authorization header. Expected: Bearer <token>':
    'لطفاً دوباره وارد شوید',
  'Invalid or expired token': 'نشست منقضی شده. دوباره وارد شوید',
  'Authentication required': 'لطفاً دوباره وارد شوید',
  'Live gold price is not available. Try again shortly.':
    'مظنه در دسترس نیست. کمی بعد تلاش کنید',
  'Wallets not found for user': 'کیف پول کاربر پیدا نشد',
  'Riyal wallet not found': 'کیف پول ریالی یافت نشد',
  'Gold wallet not found for user': 'کیف پول طلا یافت نشد',
  'iban must be a valid Iranian IBAN (IR + 24 digits)':
    'شماره شبا معتبر نیست (IR + ۲۴ رقم)',
  'phoneNumber must be a valid Iranian mobile':
    'شماره موبایل معتبر نیست',
  'otp must be a 5-digit code': 'کد باید ۵ رقم باشد',
  'requestedGrams must be a positive number': 'مقدار گرم باید مثبت باشد',
  'gramsToSell must be a positive number': 'مقدار فروش باید مثبت باشد',
  'amount must be a positive number': 'مبلغ باید مثبت باشد',
  'nationalCode must be 10 digits': 'کد ملی باید ۱۰ رقم باشد',
  'birthDate must be YYYY-MM-DD': 'تاریخ تولد نامعتبر است',
  'Withdrawal is not pending': 'این برداشت دیگر در انتظار تأیید نیست',
  'Withdrawal not found': 'درخواست برداشت پیدا نشد',
  'Duplicate request is already being processed':
    'این درخواست در حال پردازش است',
  'idempotencyKey must be between 8 and 128 characters':
    'شناسه درخواست نامعتبر است',
  'Live gold price is invalid': 'مظنه نامعتبر است',
  'Too many OTP requests. Try again later':
    'درخواست کد بیش از حد مجاز است. کمی بعد تلاش کنید',
  'OTP could not be delivered': 'ارسال پیامک انجام نشد',
  'Payment gateway is not configured': 'درگاه پرداخت پیکربندی نشده است',
  'payment signature is invalid': 'امضای پرداخت معتبر نیست',
  'Deposit is not pending': 'این واریز دیگر در انتظار تأیید نیست',
  'Deposit not found': 'واریز پیدا نشد',
  'Transaction not found': 'رسید پیدا نشد',
  'Shahkar provider is not configured':
    'سرویس احراز هویت پیکربندی نشده است',
  'delivery address is invalid': 'نشانی تحویل معتبر نیست',
  'amount is outside the allowed range': 'مبلغ یا مقدار از سقف مجاز بیشتر است',
  'amount has more than 4 decimal places': 'اعشار بیش از چهار رقم مجاز نیست',
  'birthDate must be a real calendar date': 'تاریخ تولد واقعی نیست',
  'account holder must be at least 18': 'سن باید حداقل ۱۸ سال باشد',
  'iban checksum failed': 'رقم کنترل شبا نادرست است',
  'Delivery is not pending': 'این تحویل دیگر در انتظار تأیید نیست',
  'Delivery not found': 'درخواست تحویل پیدا نشد',
};

function translate(message: string): string {
  return FA[message] ?? message;
}

@Catch()
export class PersianExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'خطای داخلی سرور';

    let raw = '';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        raw = body;
        message = translate(body);
      } else if (typeof body === 'object' && body !== null) {
        const m = (body as { message?: string | string[] }).message;
        if (Array.isArray(m)) {
          raw = m.join(' ');
          message = m.map((x) => translate(String(x)));
        } else if (typeof m === 'string') {
          raw = m;
          message = translate(m);
        }
      }
    }

    if (
      status === HttpStatus.UNAUTHORIZED &&
      /token|Authorization/i.test(raw)
    ) {
      clearSessionCookie(response);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: status >= 500 ? 'Server Error' : 'Request Error',
    });
  }
}
