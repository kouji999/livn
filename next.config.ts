import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Applied to every response from one place, rather than per-route, because a
 * header that has to be remembered on each new route will eventually be missed.
 *
 * Each one is here to close a specific class of attack:
 *
 *   Content-Security-Policy
 *     The broadest control. `default-src 'self'` means a script injected into
 *     the page cannot load from a domain the app does not control, so an XSS
 *     foothold cannot become exfiltration.
 *
 *     `'unsafe-inline'` on `script-src` is required: Next.js emits inline
 *     bootstrap scripts, and the root layout emits one inline script to set the
 *     theme before first paint. Removing it would break both. The exposure is
 *     bounded by `'strict-dynamic'` being absent and by every user-supplied
 *     value being rendered through React rather than as HTML.
 *
 *     `'unsafe-eval'` is allowed only in development, where the bundler needs
 *     it. Production does not.
 *
 *   X-Frame-Options: DENY
 *     Stops the app being framed, which is what makes clickjacking possible —
 *     an invisible iframe over a decoy page, harvesting clicks meant for this
 *     UI.
 *
 *   X-Content-Type-Options: nosniff
 *     Stops a browser guessing that an uploaded or mislabelled file is
 *     executable script.
 *
 *   Referrer-Policy
 *     Keeps full URLs (which can carry ids) out of the Referer header sent to
 *     other origins.
 *
 *   Permissions-Policy
 *     Denies hardware APIs the product never uses, so a compromised dependency
 *     cannot silently open the camera or read the clipboard.
 *
 *   Strict-Transport-Security
 *     Only in production, and only meaningful over HTTPS. Sending it on
 *     `localhost` would pin the browser to HTTPS for a domain served over HTTP.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Origin of the database and storage is irrelevant to the browser, so the policy
 * only needs to describe what the page itself loads.
 *
 * `img-src` includes `data:` and `blob:` because Next's image component uses
 * both for placeholders, and `https:` so the tunnel and any CDN work.
 */
const CSP = [
  "default-src 'self'",

  // Next.js emits inline bootstrap scripts; the theme is set by an inline script
  // before first paint to avoid a flash of the wrong theme.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,

  // Tailwind compiles to a stylesheet, but Next injects inline critical CSS.
  "style-src 'self' 'unsafe-inline'",

  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",

  // Server actions and route handlers are same-origin.
  "connect-src 'self'",

  // Nothing in the product is embedded or embeddable.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",

  // A <base> tag injected into the page could redirect every relative URL.
  "base-uri 'self'",

  // Form submissions may only go to this origin.
  "form-action 'self'",

  "worker-src 'self' blob:",
  "manifest-src 'self'",

  // Upgrade any accidental http:// subresource.
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Empty allow-list means "no origin, including this one".
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "clipboard-read=()",
      "clipboard-write=()",
    ].join(", "),
  },
  // Cross-origin isolation for anything the page might embed.
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The framework version is not a secret worth advertising, but the header
  // leaks it and attackers scan for known CVEs by version.
  poweredByHeader: false,

  images: {
    // The showcase screenshots are captured at 2x and 3x device pixel ratios, so
    // their intrinsic width is large. Next optimizes them per breakpoint; this
    // only lists the widths worth generating.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 2880],
    // Only local images are served. A remote loader would let a compromised
    // record point the optimiser at an arbitrary URL.
    remotePatterns: [],
  },

  experimental: {
    serverActions: {
      // Attachments are the only large payload, and they are capped well below
      // this at the validation layer. 8mb keeps a runaway request from becoming
      // a memory problem.
      bodySizeLimit: "8mb",
    },
  },

  async headers() {
    return [
      {
        // Everything, including static assets. A missing header on one path is
        // the kind of gap that is only found by testing that exact path.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // Uploaded and generated files are never executed, so they get the
        // strictest possible treatment.
        source: "/showcase/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
