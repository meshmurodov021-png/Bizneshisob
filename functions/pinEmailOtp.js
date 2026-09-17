import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_VERIFY_ATTEMPTS = 5;
export const OTP_DIGITS = 6;

export function generateOtpCode() {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

export function newSalt() {
  return randomBytes(16).toString("hex");
}

export function hashOtp(code, salt, pepper = "") {
  return createHash("sha256")
    .update(`${pepper}:${salt}:${normalizeOtp(code)}`, "utf8")
    .digest("hex");
}

export function normalizeOtp(code) {
  return String(code || "").replace(/\D/g, "").slice(0, OTP_DIGITS);
}

export function isWellFormedOtp(code) {
  return /^\d{6}$/.test(normalizeOtp(code)) && normalizeOtp(code).length === OTP_DIGITS;
}

export function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ""), "hex");
  const bb = Buffer.from(String(b || ""), "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function evaluateSend(record, nowMs) {
  if (!record) return { ok: true };
  const lastSent = Number(record.lastSentAtMs) || 0;
  const wait = RESEND_COOLDOWN_MS - (nowMs - lastSent);
  if (lastSent && wait > 0) {
    return { ok: false, reason: "cooldown", retryAfterSec: Math.ceil(wait / 1000) };
  }

  const windowStart = Number(record.hourWindowStartMs) || 0;
  const inWindow = windowStart > 0 && nowMs - windowStart < 60 * 60 * 1000;
  const hourCount = inWindow ? Number(record.hourCount) || 0 : 0;
  if (hourCount >= MAX_SENDS_PER_HOUR) {
    const retry = Math.ceil((60 * 60 * 1000 - (nowMs - windowStart)) / 1000);
    return { ok: false, reason: "hourly-limit", retryAfterSec: Math.max(retry, 1) };
  }
  return { ok: true };
}

export function buildSendRecord(prev, code, nowMs, pepper = "") {
  const salt = newSalt();
  const inWindow = prev && nowMs - (Number(prev.hourWindowStartMs) || 0) < 60 * 60 * 1000;
  return {
    hash: hashOtp(code, salt, pepper),
    salt,
    expiresAtMs: nowMs + OTP_TTL_MS,
    attempts: 0,
    consumed: false,
    lastSentAtMs: nowMs,
    hourWindowStartMs: inWindow ? Number(prev.hourWindowStartMs) : nowMs,
    hourCount: (inWindow ? Number(prev.hourCount) || 0 : 0) + 1
  };
}

export function evaluateVerify(record, code, nowMs, pepper = "") {
  if (!record || record.consumed) return { ok: false, reason: "not-found" };
  if (!isWellFormedOtp(code)) return { ok: false, reason: "invalid-format" };
  if (nowMs > Number(record.expiresAtMs)) return { ok: false, reason: "expired" };
  if ((Number(record.attempts) || 0) >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }
  const expected = hashOtp(code, record.salt, pepper);
  if (!safeEqualHex(expected, record.hash)) {
    const attempts = (Number(record.attempts) || 0) + 1;
    return {
      ok: false,
      reason: attempts >= MAX_VERIFY_ATTEMPTS ? "locked" : "mismatch",
      attempts
    };
  }
  return { ok: true };
}

export function maskEmail(email) {
  const raw = String(email || "").trim();
  const at = raw.indexOf("@");
  if (at <= 0) return "—";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return "—";
  const stars = "*".repeat(Math.max(3, Math.min(local.length - 1, 5)));
  return `${local[0]}${stars}@${domain}`;
}

export function buildOtpEmail(lang, code) {
  const templates = {
    uz: {
      subject: `BiznesHisob PIN kodi: ${code}`,
      text: `PIN kodni tiklash uchun tasdiqlash kodi: ${code}\n\nKod 10 daqiqa amal qiladi. Agar bu so‘rovni siz yubormagan bo‘lsangiz, e’tibor bermang.`,
      html: `<p>PIN kodni tiklash uchun tasdiqlash kodi:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>Kod 10 daqiqa amal qiladi. Agar bu so‘rovni siz yubormagan bo‘lsangiz, e’tibor bermang.</p>`
    },
    ru: {
      subject: `Код PIN BiznesHisob: ${code}`,
      text: `Код для сброса PIN: ${code}\n\nКод действует 10 минут. Если вы не запрашивали его, проигнорируйте письмо.`,
      html: `<p>Код для сброса PIN:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>Код действует 10 минут. Если вы не запрашивали его, проигнорируйте письмо.</p>`
    },
    en: {
      subject: `BiznesHisob PIN code: ${code}`,
      text: `Your PIN reset verification code is ${code}\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.`,
      html: `<p>Your PIN reset verification code:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>`
    }
  };
  return templates[lang] || templates.uz;
}
