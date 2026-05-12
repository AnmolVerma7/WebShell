// Display name + static assets (single place to rename the product in the UI).

export const APP_NAME = 'WebShell';

/** Served from `public/Logo.png` — add that file to show the tab icon (hidden until present). */
export function logoUrl() {
  const base = import.meta.env.BASE_URL;
  return base.endsWith('/') ? `${base}Logo.png` : `${base}/Logo.png`;
}
