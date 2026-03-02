 export function isAdminEmail(email?: string | null) {
   const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
   if (!allowlist || !email) return false;
   const allowed = allowlist
     .split(",")
     .map((item) => item.trim().toLowerCase())
     .filter(Boolean);
   return allowed.includes(email.toLowerCase());
 }
