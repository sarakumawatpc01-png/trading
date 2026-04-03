import { cookies } from 'next/headers';
import Dashboard from '../components/Dashboard';
import LoginClient from '../components/LoginClient';
import { verifySessionToken } from '../lib/session';

const SESSION_COOKIE = 'oracle_session';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

export default async function Page() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken || !SESSION_SECRET || !verifySessionToken(sessionToken, SESSION_SECRET)) {
    return <LoginClient />;
  }

  return <Dashboard />;
}
