import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages can't set HTTP response headers, so ship a CSP as a meta tag.
// Injected only into production builds — a meta CSP would break Vite's dev-mode HMR.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  // api.anthropic.com: the BYO-key inventory scanner calls Claude directly
  // from the browser (see src/scanner.ts).
  "connect-src 'self' https://api.anthropic.com",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const injectCsp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    };
  },
};

// base './' keeps asset paths relative so the build works at any URL:
// GitHub Pages project path, custom domain, or local file preview.
export default defineConfig({
  plugins: [react(), injectCsp],
  base: './',
});
