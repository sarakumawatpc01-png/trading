import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '../../../../lib/session';

const SESSION_COOKIE = 'oracle_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const APP_USER_EMAIL = process.env.APP_USER_EMAIL || '';
const APP_USER_PASSWORD = process.env.APP_USER_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

export async function POST(request: NextRequest) {
  if (!APP_USER_EMAIL || !APP_USER_PASSWORD || !SESSION_SECRET) {
    return NextResponse.json({ error: 'Auth is not configured' }, { status: 503 });
  }

  let payload: { email?: string; password?: string } = {};
  try {
    payload = await request.json();
  } catch (_error) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const expectedEmail = APP_USER_EMAIL.toLowerCase();
  const expectedPassword = APP_USER_PASSWORD;
  const emailMatches = email === expectedEmail;
  const passwordBuffer = Buffer.from(password);
  const expectedPasswordBuffer = Buffer.from(expectedPassword);
  const passwordMatches = passwordBuffer.length === expectedPasswordBuffer.length && crypto.timingSafeEqual(passwordBuffer, expectedPasswordBuffer);

  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionToken = createSessionToken(expectedEmail, SESSION_SECRET);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });
  return response;
}
