// Browser-side protection for everything Express serves (the built app in production; in dev
// Vite serves the pages and only /auth, /account and /socket.io reach Express).
// Google Sign-In needs its script, styles, frame and connect origins; avatars come from
// Google's image host; Phaser draws generated textures from data: and blob: URLs.
const CSP = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https://accounts.google.com/gsi/",
    "frame-src https://accounts.google.com/gsi/",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(req, res, next) {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Google's sign-in popup talks back to this window, which same-origin would block.
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
}
