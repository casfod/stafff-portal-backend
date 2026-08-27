import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

// ── Base-URL validation ────────────────────────────────────────────────────
// The bug this exists to prevent: API_BASE_URL/BASE_URL were previously
// read ad hoc via bare `process.env.API_BASE_URL` in file.service.ts and
// notification.service.ts, with no schema, no validation, and inconsistent
// fallback chains between the two. Because nothing validated the value,
// a Render env var left at a placeholder like "http://" (protocol, no
// host) sailed straight through and produced broken vendor-facing
// download/notification links — "http:///files/public/..." — that only
// surfaced when Gmail's link-safety redirect flagged them as invalid.
//
// This throws at process startup (not at first request) if a REQUIRED
// base URL is missing or malformed, so a bad deploy config fails the
// deploy/boot instead of silently shipping broken links to vendors.
function validateBaseUrl(name: string, value: string | undefined, required: boolean): string | undefined {
  const raw = value?.trim();

  if (!raw) {
    if (required) {
      throw new Error(
        `Missing required env var ${name}. Set it to your app's public base URL, ` +
          `e.g. "https://api.yourdomain.com" (no trailing slash, must include a host).`
      );
    }
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `Invalid ${name}: "${raw}" is not a valid absolute URL. ` +
        `Expected something like "https://api.yourdomain.com" — got a value with no scheme/host.`
    );
  }

  if (!parsed.hostname) {
    throw new Error(
      `Invalid ${name}: "${raw}" has no host (e.g. a bare "http://" placeholder). ` +
        `Expected something like "https://api.yourdomain.com".`
    );
  }

  return raw.replace(/\/+$/, ""); // strip trailing slash(es) so callers can safely do `${base}${path}`
}

const PORT = parseInt(process.env.PORT || "5000", 10);

// Required in every environment except local dev, where we default to the
// dev server's own origin so `npm run dev` works with zero .env setup.
const API_BASE_URL =
  validateBaseUrl(
    "API_BASE_URL",
    process.env.API_BASE_URL ?? process.env.BASE_URL,
    process.env.NODE_ENV === "production"
  ) ?? `http://localhost:${PORT}`;

const FRONTEND_URL =
  validateBaseUrl("FRONTEND_URL", process.env.FRONTEND_URL, false) ?? "http://localhost:3000";

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT,

  // ── Database ────────────────────────────────────────────────────────────────
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/CASFOD",

  // ── JWT ─────────────────────────────────────────────────────────────────────
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  // ── Mail (Gmail App Password) ───────────────────────────────────────────────
  // Uses MAIL_APP_USER / MAIL_APP_PASSWORD — generated at:
  // https://myaccount.google.com/apppasswords
  MAIL_APP_USER: process.env.MAIL_APP_USER || "",
  MAIL_APP_PASSWORD: process.env.MAIL_APP_PASSWORD || "",
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || "Casfod Possibility Hub",
  PROCUREMENT_MAIL: process.env.PROCUREMENT_MAIL || "",
  PROCUREMENT_MAIL_PASSWORD: process.env.PROCUREMENT_MAIL_PASSWORD || "",

  // ── Cloudinary ──────────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  FILE_DOWNLOAD_SECRET: process.env.FILE_DOWNLOAD_SECRET,

  // ── Redis ───────────────────────────────────────────────────────────────────
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // ── Public base URLs ────────────────────────────────────────────────────────
  // API_BASE_URL: this server's own public origin. Used to build links that
  // must be reachable by people with NO session/account — vendor download
  // links (file.service.ts), vendor status-change emails, etc. Validated
  // above; will throw at boot in production if missing/malformed rather
  // than silently emailing broken links.
  API_BASE_URL,
  // FRONTEND_URL: the SPA's public origin. Used for links meant to open in
  // the logged-in app UI (RFQ/PO/vendor detail pages for internal users).
  // These are two genuinely different destinations — don't collapse them
  // into one "BASE_URL" env var, that's exactly what caused the previous
  // inconsistent-fallback-chain confusion between file.service.ts and
  // notification.service.ts.
  FRONTEND_URL,

  // ── Rate Limiting ───────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || "60000",
    10
  ),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),

  // ── CORS ────────────────────────────────────────────────────────────────────
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000"],

  // ── Logging ─────────────────────────────────────────────────────────────────
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  // ── Stripe ──────────────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",

  // ── Paystack ────────────────────────────────────────────────────────────────
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "",
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || "",

  // ── Super Admin Seeding ────────────────────────────────────────────────────
  SUPER_ADMIN_FIRST_NAME: process.env.SUPER_ADMIN_FIRST_NAME || "Charles",
  SUPER_ADMIN_LAST_NAME: process.env.SUPER_ADMIN_LAST_NAME || "Yaya",
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || "calebcharles343@gmail.com",
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || "11111111",
  SUPER_ADMIN_ROLE: process.env.SUPER_ADMIN_ROLE || "SUPER-ADMIN",
  // Only seed in development or when explicitly enabled
  SEED_SUPER_ADMIN: process.env.SEED_SUPER_ADMIN === "true" || process.env.NODE_ENV === "development",
};