import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '../../../../lib/session';

const SESSION_COOKIE = 'oracle_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const APP_USER_ID = process.env.APP_USER_ID || process.env.APP_USER_EMAIL || 'admin';
const APP_USER_PASSWORD = process.env.APP_USER_PASSWORD || 'Admin@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'oracle-local-session-secret';

export async function POST(request: NextRequest) {
  let payload: { userId?: string; email?: string; password?: string } = {};
  try {
    payload = await request.json();
  } catch (_error) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const userId = String(payload.userId || payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const expectedUserId = APP_USER_ID.toLowerCase();
  const expectedPassword = APP_USER_PASSWORD;
  const userIdMatches = userId === expectedUserId;
  const passwordBuffer = Buffer.from(password);
  const expectedPasswordBuffer = Buffer.from(expectedPassword);
  const passwordMatches = passwordBuffer.length === expectedPasswordBuffer.length && crypto.timingSafeEqual(passwordBuffer, expectedPasswordBuffer);

  if (!userIdMatches || !passwordMatches) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionToken = createSessionToken(expectedUserId, SESSION_SECRET);
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
