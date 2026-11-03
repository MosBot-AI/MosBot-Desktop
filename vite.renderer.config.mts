import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The renderer runs from a local file in packaged builds, so assets are
 * referenced relatively. A strict Content-Security-Policy is added to packaged
 * builds only: the dev server needs inline scripts for React Fast Refresh.
 */
const contentSecurityPolicy: Plugin = {
  name: 'mosbot-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy],
  build: {
    sourcemap: true,
  },
});
