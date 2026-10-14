// Browser helper: returns parsed JSON on success, or the server's Thai message on failure.
export async function callApi<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  const { json, ...rest } = init ?? {};
  try {
    const response = await fetch(input, json === undefined ? rest : {
      ...rest, method: rest.method ?? 'POST', headers: { 'content-type': 'application/json', ...rest.headers }, body: JSON.stringify(json),
    });
    const body = await response.json().catch(() => ({})) as T & { message?: string };
    return response.ok ? { ok: true, data: body } : { ok: false, message: body.message ?? 'ทำรายการไม่สำเร็จ', status: response.status };
  } catch {
    return { ok: false, message: 'เชื่อมต่อระบบไม่ได้ โปรดตรวจสอบสัญญาณแล้วลองใหม่', status: 0 };
  }
}
