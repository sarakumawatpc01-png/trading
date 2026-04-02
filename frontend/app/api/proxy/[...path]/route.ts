import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE_URL = (process.env.BACKEND_INTERNAL_URL || 'http://localhost:8080').replace(/\/$/, '');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

function buildTargetUrl(request: NextRequest, path: string[]) {
  const upstreamPath = path.join('/');
  const search = request.nextUrl.search || '';
  return `${BACKEND_BASE_URL}/api/${upstreamPath}${search}`;
}

async function proxy(request: NextRequest, path: string[]) {
  const isAdminRoute = path[0] === 'admin';
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  if (isAdminRoute && ADMIN_API_KEY) {
    headers.set('x-admin-key', ADMIN_API_KEY);
  }

  const bodyAllowed = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const response = await fetch(buildTargetUrl(request, path), {
    method: request.method,
    headers,
    body: bodyAllowed ? request.body : undefined,
    cache: 'no-store'
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers
  });
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  const { path } = params;
  return proxy(request, path);
}
