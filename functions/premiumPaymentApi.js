/**
 * Firebase entrypoints for Premium checkout.
 * Payme and Click call the HTTP webhooks; the app calls createPremiumCheckout.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import {
  readPaymentConfig,
  providerConfigured,
  buildPaymeCheckoutUrl,
  buildClickCheckoutUrl,
  buildPremiumOrder,
  pickReusableOrder,
  paymeAuthorized,
  handlePaymeRpc,
  handleClickRequest,
  premiumWritePatch
} from "./premiumPayments.js";

if (!getApps().length) initializeApp();

const db = getFirestore();
const REGION = "us-central1";

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "unauthenticated");
  return uid;
}

function firestoreRepo() {
  return {
    async findOrderByPaymeId(paymeId) {
      const snap = await db.collection("payments").where("payme.id", "==", paymeId).limit(1).get();
      return snap.empty ? null : snap.docs[0].id;
    },
    async listPaymeCreatedBetween(from, to) {
      const snap = await db.collection("payments")
        .where("payme.createTime", ">=", from)
        .where("payme.createTime", "<=", to)
        .limit(500)
        .get();
      return snap.docs.map(doc => doc.data());
    },
    async runOrder(orderId, worker) {
      const orderRef = db.collection("payments").doc(orderId);
      return db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        const order = orderSnap.exists ? orderSnap.data() : null;
        let userRef = null;
        let user = null;
        if (order?.uid) {
          userRef = db.collection("users").doc(order.uid);
          const userSnap = await tx.get(userRef);
          user = userSnap.exists ? userSnap.data() : null;
        }
        let nextOrder;
        let nextUser;
        let userSet = false;
        const response = await worker({
          order,
          user,
          setOrder(value) { nextOrder = value; },
          setUser(value) { nextUser = value; userSet = true; }
        });
        if (nextOrder) tx.set(orderRef, nextOrder);
        if (userSet && userRef) {
          const patch = premiumWritePatch(user, nextUser, FieldValue.delete());
          if (Object.keys(patch).length) tx.set(userRef, patch, { merge: true });
        }
        return response;
      });
    }
  };
}

async function reusableOrder(uid, provider, nowMs) {
  const snap = await db.collection("payments").where("uid", "==", uid).limit(20).get();
  return pickReusableOrder(snap.docs.map(doc => doc.data()), provider, nowMs);
}

export const createPremiumCheckout = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const provider = String(request.data?.provider || "");
    if (provider !== "payme" && provider !== "click") {
      throw new HttpsError("invalid-argument", "invalid-provider");
    }
    const cfg = readPaymentConfig();
    if (!providerConfigured(cfg, provider)) {
      console.warn(`[premium] ${provider} is not configured`);
      throw new HttpsError("failed-precondition", "payments-not-configured", {
        reason: "payments-not-configured"
      });
    }

    const nowMs = Date.now();
    const existing = await reusableOrder(uid, provider, nowMs);
    const order = existing || buildPremiumOrder({
      orderId: db.collection("payments").doc().id,
      uid,
      provider,
      nowMs
    });
    if (!existing) {
      await db.collection("payments").doc(order.orderId).set(order);
    }

    const lang = String(request.data?.lang || "uz");
    const checkoutUrl = provider === "payme"
      ? buildPaymeCheckoutUrl(cfg, { orderId: order.orderId, lang })
      : buildClickCheckoutUrl(cfg, { orderId: order.orderId });

    return {
      orderId: order.orderId,
      provider,
      amountUzs: order.amountUzs,
      checkoutUrl
    };
  }
);

function sendJson(res, body) {
  res.set("Cache-Control", "no-store");
  res.status(200).json(body);
}

function paymeBody(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && body.method) return body;
  if (req.rawBody) {
    try {
      return JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      return null;
    }
  }
  return body && typeof body === "object" && !Buffer.isBuffer(body) ? body : null;
}

function clickParams(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && Object.keys(body).length) {
    return body;
  }
  if (!req.rawBody) return {};
  const raw = req.rawBody.toString("utf8");
  if (!raw) return {};
  if (raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export const paymeMerchant = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { code: -32600, message: "POST only" } });
      return;
    }
    const cfg = readPaymentConfig();
    const body = paymeBody(req);
    const authorized = paymeAuthorized(req.get("authorization"), cfg.paymeAuthKey);
    const response = await handlePaymeRpc(firestoreRepo(), body, { authorized });
    sendJson(res, response);
  }
);

export const clickMerchant = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: -8, error_note: "POST only" });
      return;
    }
    const cfg = readPaymentConfig();
    const response = await handleClickRequest(firestoreRepo(), clickParams(req), cfg);
    sendJson(res, response);
  }
);
