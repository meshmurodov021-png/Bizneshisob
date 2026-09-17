import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  generateOtpCode,
  evaluateSend,
  buildSendRecord,
  evaluateVerify,
  maskEmail,
  buildOtpEmail,
  isWellFormedOtp,
  RESEND_COOLDOWN_MS
} from "./pinEmailOtp.js";

initializeApp();
const db = getFirestore();

const REGION = "us-central1";
const OTP_DOC = "pinEmailOtp";

function pepper() {
  return process.env.PIN_OTP_PEPPER || process.env.GCLOUD_PROJECT || "bizneshisob";
}

function otpRef(uid) {
  return db.doc(`users/${uid}/security/${OTP_DOC}`);
}

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  return uid;
}

function isEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

/**
 * Gated fallback: emulator always; production only if PIN_OTP_DEV_FALLBACK=true.
 * Default (unset) is fail-closed — never logs or returns codes.
 */
function isDevFallbackAllowed() {
  if (isEmulator()) return true;
  return process.env.PIN_OTP_DEV_FALLBACK === "true";
}

function langFrom(request) {
  const lang = String(request.data?.lang || "").slice(0, 2).toLowerCase();
  return lang === "ru" || lang === "en" ? lang : "uz";
}

async function loadRecord(uid) {
  const snap = await otpRef(uid).get();
  return snap.exists ? snap.data() : null;
}

async function deliverOtpEmail({ to, code, lang, uid }) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "").trim()
    || "BiznesHisob <noreply@bizneshisob.uz>";
  const smtpUrl = String(process.env.SMTP_URL || "").trim();
  const useMailCol = process.env.PIN_OTP_USE_MAIL_COLLECTION === "true";
  const { subject, text, html } = buildOtpEmail(lang, code);

  if (resendKey && resendKey !== "REPLACE_ME") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[pinEmailOtp] Resend failed", res.status, body);
      throw new HttpsError("internal", "email-send-failed");
    }
    return { channel: "resend" };
  }

  if (smtpUrl) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport(smtpUrl);
    await transporter.sendMail({ from, to, subject, text, html });
    return { channel: "smtp" };
  }

  if (useMailCol) {
    await db.collection("mail").add({
      to: [to],
      message: { subject, text, html },
      createdAt: FieldValue.serverTimestamp()
    });
    return { channel: "mail-collection" };
  }

  if (isDevFallbackAllowed()) {
    console.warn(
      `[PIN_EMAIL_OTP_DEV] Email not configured. OTP for uid=${uid} to=${to} code=${code}. ` +
      "Do not enable PIN_OTP_DEV_FALLBACK in production."
    );
    return { channel: "dev-log" };
  }

  throw new HttpsError("failed-precondition", "email-not-configured");
}

export const requestPinEmailOtp = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const nowMs = Date.now();
    const user = await getAuth().getUser(uid);
    const email = user.email;
    if (!email) throw new HttpsError("failed-precondition", "no-email");

    const prev = await loadRecord(uid);
    const gate = evaluateSend(prev, nowMs);
    if (!gate.ok) {
      throw new HttpsError("resource-exhausted", gate.reason, {
        reason: gate.reason,
        retryAfterSec: gate.retryAfterSec
      });
    }

    const code = generateOtpCode();
    const record = buildSendRecord(prev, code, nowMs, pepper());
    await otpRef(uid).set(record);

    let delivery;
    try {
      delivery = await deliverOtpEmail({ to: email, code, lang: langFrom(request), uid });
    } catch (err) {
      if (prev) await otpRef(uid).set(prev);
      else await otpRef(uid).delete();
      throw err;
    }

    const payload = {
      ok: true,
      cooldownSec: Math.round(RESEND_COOLDOWN_MS / 1000),
      expiresInSec: Math.round((record.expiresAtMs - nowMs) / 1000),
      maskedEmail: maskEmail(email),
      channel: delivery.channel
    };
    // Never return the code to the client, even in the emulator.
    return payload;
  }
);

export const verifyPinEmailOtp = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const code = request.data?.code;
    if (!isWellFormedOtp(code)) {
      throw new HttpsError("invalid-argument", "invalid-format");
    }

    const ref = otpRef(uid);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const record = snap.exists ? snap.data() : null;
      const nowMs = Date.now();
      const verdict = evaluateVerify(record, code, nowMs, pepper());
      if (!verdict.ok) {
        if (verdict.attempts) {
          tx.update(ref, { attempts: verdict.attempts });
        }
        return verdict;
      }
      tx.delete(ref);
      return { ok: true };
    });

    if (!result.ok) {
      const status = result.reason === "locked" || result.reason === "expired"
        ? "resource-exhausted"
        : result.reason === "not-found"
          ? "not-found"
          : "permission-denied";
      throw new HttpsError(status, result.reason, { reason: result.reason });
    }

    return { ok: true };
  }
);
