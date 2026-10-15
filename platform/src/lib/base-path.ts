// The path the app is served under, such as "/health-rider" on the hospital website, or "" at the
// root. It is fixed when the app is built (Next.js basePath). next/link, next/navigation and the
// router add it on their own; plain URLs written by hand (fetch, <a>, <img>, <form action>,
// Location headers) go through withBasePath.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') ? `${basePath}${path}` : path;
}

// window.location.pathname includes the base path; the app's own routes do not.
export function withoutBasePath(path: string): string {
  return basePath && (path === basePath || path.startsWith(`${basePath}/`)) ? path.slice(basePath.length) || '/' : path;
}
