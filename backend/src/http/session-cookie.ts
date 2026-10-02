import { Response } from 'express';

const NAME = 'gold_session';

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function writeSessionCookie(
  res: Response,
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  const parts = [
    `${NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response) {
  res.append(
    'Set-Cookie',
    `${NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  );
}
