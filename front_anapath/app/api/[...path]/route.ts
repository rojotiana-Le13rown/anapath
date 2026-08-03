import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/authCookie';

// Fallback : le service back_anapath a été recréé sous un nouveau nom Render
// (anapath-backend-ar7u seul n'est plus joignable) — l'ancien défaut menait dans le mur.
const BACKEND_URL = (process.env.API_PROXY_TARGET || 'https://anapath-backend-ar7u-uj8n.onrender.com').replace(/\/$/, '');

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
  }

  const { path } = await params;
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path.join('/')}${search}`;

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.text() : undefined;

  try {
    const backendRes = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
      cache: 'no-store',
    });

    const responseBody = await backendRes.text();
    return new NextResponse(responseBody, {
      status: backendRes.status,
      headers: {
        'Content-Type': backendRes.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Backend indisponible' }, { status: 502 });
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as DELETE,
};
