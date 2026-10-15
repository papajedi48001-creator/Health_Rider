import { withBasePath, withoutBasePath } from '@/lib/base-path';

// Browser helper: returns parsed JSON on success, or the server's Thai message on failure. Paths are the
// app's own ("/api/..."); the base path the app is served under is added here.
export async function callApi<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  const { json, ...rest } = init ?? {};
  try {
    const response = await fetch(withBasePath(input), json === undefined ? rest : {
      ...rest, method: rest.method ?? 'POST', headers: { 'content-type': 'application/json', ...rest.headers }, body: JSON.stringify(json),
    });
    const body = await response.json().catch(() => ({})) as T & { message?: string };
    // The session ended while the page was open: go back to login and return here afterwards.
    if (response.status === 401 && !input.startsWith('/api/auth/')) {
      window.location.assign(withBasePath(`/login?reason=expired&next=${encodeURIComponent(withoutBasePath(window.location.pathname) + window.location.search)}`));
    }
    return response.ok ? { ok: true, data: body } : { ok: false, message: body.message ?? 'ทำรายการไม่สำเร็จ', status: response.status };
  } catch {
    return { ok: false, message: 'เชื่อมต่อระบบไม่ได้ โปรดตรวจสอบสัญญาณแล้วลองใหม่', status: 0 };
  }
}
