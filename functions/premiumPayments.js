/**
 * Payme Merchant API + Click SHOP API for BiznesHisob Premium.
 *
 * One-time monthly charge (30 days). Payme amount is in tiyin.
 * Click amount is in so'm. Secrets stay in environment variables.
 *
 * Payme checkout: https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get
 * Payme methods: CheckPerformTransaction, CreateTransaction, PerformTransaction,
 *   CancelTransaction, CheckTransaction, GetStatement, SetFiscalData.
 * Click: https://my.click.uz/services/pay plus Prepare (action=0) / Complete (action=1).
 */
import crypto from "node:crypto";

export const PREMIUM_PRICE_UZS = 29900;
export const PREMIUM_PRICE_TIYIN = 2_990_000;
export const PREMIUM_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const PAYME_TX_TIMEOUT_MS = 43_200_000;
export const PAYME_ACCOUNT_FIELD = "order_id";
export const DEFAULT_RETURN_URL = "https://bizneshisob.vercel.app/app?payment=return";

const PREMIUM_USER_KEYS = [
  "isPremium",
  "premiumUntil",
  "premiumSource",
  "premiumOrderId",
  "premiumActivatedAt"
];

function str(value) {
  return String(value ?? "").trim();
}

function msg(uz, ru, en) {
  return { uz, ru, en };
}

export function readPaymentConfig(env = process.env) {
  const testMode = str(env.PAYMENTS_TEST_MODE) === "true";
  const paymeMerchantId = str(env.PAYME_MERCHANT_ID);
  const paymeKey = str(env.PAYME_KEY);
  const paymeTestKey = str(env.PAYME_TEST_KEY);
  const paymeAuthKey = testMode ? (paymeTestKey || paymeKey) : paymeKey;
  const clickServiceId = str(env.CLICK_SERVICE_ID);
  const clickMerchantId = str(env.CLICK_MERCHANT_ID);
  const clickSecret = str(env.CLICK_SECRET_KEY);
  const returnUrl = str(env.PAYMENTS_RETURN_URL) || DEFAULT_RETURN_URL;
  const paymeCheckoutBase = str(env.PAYME_CHECKOUT_BASE)
    || (testMode ? "https://test.paycom.uz" : "https://checkout.paycom.uz");
  const clickPayBase = str(env.CLICK_PAY_BASE) || "https://my.click.uz/services/pay";

  return {
    testMode,
    paymeMerchantId,
    paymeAuthKey,
    paymeCheckoutBase,
    clickServiceId,
    clickMerchantId,
    clickSecret,
    clickMerchantUserId: str(env.CLICK_MERCHANT_USER_ID),
    clickPayBase,
    returnUrl: returnUrl.replace(/;/g, ""),
    paymeReady: Boolean(paymeMerchantId && paymeAuthKey),
    clickReady: Boolean(clickServiceId && clickMerchantId && clickSecret)
  };
}

export function providerConfigured(cfg, provider) {
  if (provider === "payme") return cfg.paymeReady;
  if (provider === "click") return cfg.clickReady;
  return false;
}

export function paymeCheckoutToken(paramString) {
  return Buffer.from(paramString, "utf8").toString("base64");
}

export function buildPaymeCheckoutUrl(cfg, { orderId, lang = "uz" } = {}) {
  const safeLang = lang === "ru" || lang === "en" ? lang : "uz";
  const params = [
    `m=${cfg.paymeMerchantId}`,
    `ac.${PAYME_ACCOUNT_FIELD}=${orderId}`,
    `a=${PREMIUM_PRICE_TIYIN}`,
    `l=${safeLang}`,
    `c=${cfg.returnUrl}`
  ].join(";");
  const base = cfg.paymeCheckoutBase.replace(/\/$/, "");
  return `${base}/${paymeCheckoutToken(params)}`;
}

export function buildClickCheckoutUrl(cfg, { orderId } = {}) {
  const url = new URL(cfg.clickPayBase);
  url.searchParams.set("service_id", cfg.clickServiceId);
  url.searchParams.set("merchant_id", cfg.clickMerchantId);
  url.searchParams.set("amount", PREMIUM_PRICE_UZS.toFixed(2));
  url.searchParams.set("transaction_param", orderId);
  url.searchParams.set("return_url", cfg.returnUrl);
  if (cfg.clickMerchantUserId) {
    url.searchParams.set("merchant_user_id", cfg.clickMerchantUserId);
  }
  return url.toString();
}

export function buildPremiumOrder({ orderId, uid, provider, nowMs }) {
  const iso = new Date(nowMs).toISOString();
  return {
    orderId,
    uid,
    provider,
    plan: "premium_monthly",
    amountUzs: PREMIUM_PRICE_UZS,
    amountTiyin: PREMIUM_PRICE_TIYIN,
    currency: "UZS",
    status: "created",
    createdAt: iso,
    updatedAt: iso,
    premiumGranted: false,
    payme: null,
    click: null
  };
}

export function pickReusableOrder(orders, provider, nowMs) {
  const maxAge = PAYME_TX_TIMEOUT_MS;
  const open = (orders || []).filter(order => {
    if (!order || order.provider !== provider) return false;
    if (order.premiumGranted || order.status === "paid") return false;
    if (order.status !== "created" && order.status !== "pending") return false;
    if (order.payme?.state === 2 || (typeof order.payme?.state === "number" && order.payme.state < 0)) {
      return false;
    }
    const created = Date.parse(order.createdAt || "");
    if (!Number.isFinite(created) || nowMs - created > maxAge) return false;
    return true;
  });
  open.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return open[0] || null;
}

export function paymeAuthorized(authorizationHeader, key) {
  if (!key || !authorizationHeader) return false;
  const match = String(authorizationHeader).match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const expected = `Paycom:${key}`;
  const got = Buffer.from(decoded);
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

function rpcResult(id, result) {
  return { id: id ?? null, result };
}

function rpcError(id, code, uz, ru, en, data) {
  const error = { code, message: msg(uz, ru, en) };
  if (data !== undefined) error.data = data;
  return { id: id ?? null, error };
}

function accountOrderId(params) {
  const account = params?.account;
  if (!account || typeof account !== "object") return "";
  return str(account.order_id ?? account.orderId);
}

function isPaymeExpired(payme, nowMs) {
  if (!payme || payme.state !== 1) return false;
  const created = Number(payme.createTime);
  if (!Number.isFinite(created)) return true;
  return nowMs - created >= PAYME_TX_TIMEOUT_MS;
}

function amountError(id) {
  return rpcError(id, -31001, "Noto'g'ri summa", "Неверная сумма", "Invalid amount");
}

function notFoundTx(id) {
  return rpcError(id, -31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found");
}

function cannotPerform(id) {
  return rpcError(
    id,
    -31008,
    "Amaliyotni bajarib bo'lmaydi",
    "Невозможно выполнить операцию",
    "Cannot perform operation"
  );
}

function cannotCancel(id) {
  return rpcError(
    id,
    -31007,
    "Tranzaksiyani bekor qilib bo'lmaydi",
    "Невозможно отменить транзакцию",
    "Cannot cancel transaction"
  );
}

function orderNotFound(id) {
  return rpcError(
    id,
    -31050,
    "Buyurtma topilmadi",
    "Заказ не найден",
    "Order not found",
    PAYME_ACCOUNT_FIELD
  );
}

function touch(order, nowMs, patch) {
  return {
    ...order,
    ...patch,
    updatedAt: new Date(nowMs).toISOString()
  };
}

function cancelPaymeOrder(order, reason, nowMs) {
  return touch(order, nowMs, {
    status: "cancelled",
    payme: {
      ...order.payme,
      state: order.payme.state === 2 ? -2 : -1,
      reason,
      cancelTime: nowMs
    }
  });
}

export function premiumAccessActive(isPremium, premiumUntil, nowMs = Date.now()) {
  if (!isPremium) return false;
  if (!premiumUntil) return true;
  const until = Date.parse(premiumUntil);
  if (!Number.isFinite(until)) return true;
  return until > nowMs;
}

function grantPremium(user, order, nowMs) {
  const untilBefore = user?.premiumUntil ?? null;
  const baseMs = Math.max(Date.parse(untilBefore || "") || 0, nowMs);
  const premiumUntil = new Date(baseMs + PREMIUM_PERIOD_MS).toISOString();
  const activatedAt = new Date(nowMs).toISOString();
  return {
    user: {
      ...(user || {}),
      isPremium: true,
      premiumUntil,
      premiumSource: order.provider,
      premiumOrderId: order.orderId,
      premiumActivatedAt: activatedAt
    },
    orderPatch: {
      status: "paid",
      premiumGranted: true,
      paidAt: activatedAt,
      wasPremiumBefore: !!user?.isPremium,
      premiumUntilBefore: untilBefore,
      premiumSourceBefore: user?.premiumSource ?? null,
      premiumOrderIdBefore: user?.premiumOrderId ?? null,
      premiumActivatedAtBefore: user?.premiumActivatedAt ?? null,
      premiumUntilAfter: premiumUntil
    }
  };
}

function restorePremium(user, order) {
  if (!order?.premiumGranted) return null;
  if (user?.premiumOrderId && user.premiumOrderId !== order.orderId) return null;
  return {
    ...(user || {}),
    isPremium: !!order.wasPremiumBefore,
    premiumUntil: order.premiumUntilBefore ?? null,
    premiumSource: order.premiumSourceBefore ?? null,
    premiumOrderId: order.premiumOrderIdBefore ?? null,
    premiumActivatedAt: order.premiumActivatedAtBefore ?? null
  };
}

function applyGrant(ctx, order, nowMs) {
  if (order.premiumGranted) return order;
  const granted = grantPremium(ctx.user, order, nowMs);
  ctx.setUser(granted.user);
  return touch(order, nowMs, granted.orderPatch);
}

function paymeView(order) {
  const payme = order.payme || {};
  return {
    create_time: payme.createTime || 0,
    perform_time: payme.performTime || 0,
    cancel_time: payme.cancelTime || 0,
    transaction: order.orderId,
    state: payme.state,
    reason: payme.reason ?? null
  };
}

function statementRow(order) {
  const payme = order.payme;
  return {
    id: payme.id,
    time: payme.time || payme.createTime,
    amount: order.amountTiyin,
    account: { [PAYME_ACCOUNT_FIELD]: order.orderId },
    create_time: payme.createTime,
    perform_time: payme.performTime || 0,
    cancel_time: payme.cancelTime || 0,
    transaction: order.orderId,
    state: payme.state,
    reason: payme.reason ?? null
  };
}

async function checkPerform(repo, params, id, nowMs) {
  const orderId = accountOrderId(params);
  if (!orderId) return orderNotFound(id);
  return repo.runOrder(orderId, ctx => {
    const order = ctx.order;
    if (!order || order.provider !== "payme") return orderNotFound(id);
    const amount = Number(params.amount);
    if (!Number.isInteger(amount) || amount !== order.amountTiyin) return amountError(id);
    if (order.status === "paid" || order.payme?.state === 2) return cannotPerform(id);
    if (order.payme?.state === 1 && !isPaymeExpired(order.payme, nowMs)) return cannotPerform(id);
    if (order.status === "cancelled" || order.status === "failed") return cannotPerform(id);
    return rpcResult(id, { allow: true });
  });
}

async function createTransaction(repo, params, id, nowMs) {
  const paymeId = str(params.id);
  const orderId = accountOrderId(params);
  if (!paymeId || !orderId) {
    return rpcError(id, -32600, "Noto'g'ri so'rov", "Неверный запрос", "Invalid request");
  }
  const existingId = await repo.findOrderByPaymeId(paymeId);
  const targetId = existingId || orderId;
  return repo.runOrder(targetId, ctx => {
    const order = ctx.order;
    if (!order || order.provider !== "payme") return orderNotFound(id);
    const amount = Number(params.amount);
    if (!Number.isInteger(amount) || amount !== order.amountTiyin) return amountError(id);

    if (order.payme?.id === paymeId) {
      if (order.payme.state === 1) {
        if (isPaymeExpired(order.payme, nowMs)) {
          ctx.setOrder(cancelPaymeOrder(order, 4, nowMs));
          return cannotPerform(id);
        }
        return rpcResult(id, {
          create_time: order.payme.createTime,
          transaction: order.orderId,
          state: 1
        });
      }
      return cannotPerform(id);
    }

    if (order.payme?.state === 1 && !isPaymeExpired(order.payme, nowMs)) return cannotPerform(id);
    if (order.status === "paid" || order.payme?.state === 2) return cannotPerform(id);
    if (order.status === "cancelled" || order.status === "failed" || order.payme?.state < 0) {
      return cannotPerform(id);
    }

    const time = Number.isFinite(Number(params.time)) ? Number(params.time) : nowMs;
    const next = touch(order, nowMs, {
      status: "pending",
      payme: {
        id: paymeId,
        time,
        createTime: time,
        performTime: 0,
        cancelTime: 0,
        state: 1,
        reason: null
      }
    });
    ctx.setOrder(next);
    return rpcResult(id, {
      create_time: time,
      transaction: order.orderId,
      state: 1
    });
  });
}

async function performTransaction(repo, params, id, nowMs) {
  const paymeId = str(params.id);
  if (!paymeId) return notFoundTx(id);
  const orderId = await repo.findOrderByPaymeId(paymeId);
  if (!orderId) return notFoundTx(id);
  return repo.runOrder(orderId, ctx => {
    const order = ctx.order;
    if (!order?.payme || order.payme.id !== paymeId) return notFoundTx(id);
    if (order.payme.state === 2) {
      return rpcResult(id, {
        transaction: order.orderId,
        perform_time: order.payme.performTime || 0,
        state: 2
      });
    }
    if (order.payme.state !== 1) return cannotPerform(id);
    if (isPaymeExpired(order.payme, nowMs)) {
      ctx.setOrder(cancelPaymeOrder(order, 4, nowMs));
      return cannotPerform(id);
    }
    const performTime = nowMs;
    let next = touch(order, nowMs, {
      payme: {
        ...order.payme,
        state: 2,
        performTime
      }
    });
    next = applyGrant(ctx, next, nowMs);
    ctx.setOrder(next);
    return rpcResult(id, {
      transaction: order.orderId,
      perform_time: performTime,
      state: 2
    });
  });
}

async function cancelTransaction(repo, params, id, nowMs) {
  const paymeId = str(params.id);
  if (!paymeId) return notFoundTx(id);
  const orderId = await repo.findOrderByPaymeId(paymeId);
  if (!orderId) return notFoundTx(id);
  const reason = Number.isInteger(Number(params.reason)) ? Number(params.reason) : 10;
  return repo.runOrder(orderId, ctx => {
    const order = ctx.order;
    if (!order?.payme || order.payme.id !== paymeId) return notFoundTx(id);
    const state = order.payme.state;
    if (state === -1 || state === -2) {
      return rpcResult(id, {
        transaction: order.orderId,
        cancel_time: order.payme.cancelTime || 0,
        state
      });
    }
    if (state !== 1 && state !== 2) return cannotCancel(id);
    let next = cancelPaymeOrder(order, reason, nowMs);
    if (state === 2) {
      const restored = restorePremium(ctx.user, order);
      if (restored) {
        ctx.setUser(restored);
        next = touch(next, nowMs, { premiumGranted: false, premiumRevoked: true });
      }
    }
    ctx.setOrder(next);
    return rpcResult(id, {
      transaction: order.orderId,
      cancel_time: nowMs,
      state: next.payme.state
    });
  });
}

async function checkTransaction(repo, params, id) {
  const paymeId = str(params.id);
  if (!paymeId) return notFoundTx(id);
  const orderId = await repo.findOrderByPaymeId(paymeId);
  if (!orderId) return notFoundTx(id);
  return repo.runOrder(orderId, ctx => {
    const order = ctx.order;
    if (!order?.payme || order.payme.id !== paymeId) return notFoundTx(id);
    return rpcResult(id, paymeView(order));
  });
}

async function getStatement(repo, params, id) {
  const from = Number(params.from);
  const to = Number(params.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    return rpcError(id, -32600, "Noto'g'ri so'rov", "Неверный запрос", "Invalid request");
  }
  const orders = await repo.listPaymeCreatedBetween(from, to);
  const transactions = orders
    .filter(order => order?.payme?.id && Number.isFinite(Number(order.payme.createTime)))
    .sort((a, b) => a.payme.createTime - b.payme.createTime)
    .map(statementRow);
  return rpcResult(id, { transactions });
}

async function setFiscalData(repo, params, id, nowMs) {
  const paymeId = str(params.id);
  if (!paymeId) return notFoundTx(id);
  const orderId = await repo.findOrderByPaymeId(paymeId);
  if (!orderId) return notFoundTx(id);
  return repo.runOrder(orderId, ctx => {
    const order = ctx.order;
    if (!order?.payme || order.payme.id !== paymeId) return notFoundTx(id);
    const type = str(params.type) === "CANCEL" ? "cancel" : "perform";
    ctx.setOrder(touch(order, nowMs, {
      fiscal: {
        ...(order.fiscal || {}),
        [type]: params.fiscal_data || null
      }
    }));
    return rpcResult(id, { success: true });
  });
}

export async function handlePaymeRpc(repo, body, { authorized = false, nowMs = Date.now() } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return rpcError(null, -32700, "JSON xato", "Ошибка парсинга JSON", "JSON parse error");
  }
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  if (!authorized) {
    return rpcError(id, -32504, "Ruxsat yo'q", "Недостаточно привилегий", "Insufficient privilege");
  }
  const method = body.method;
  const params = body.params && typeof body.params === "object" ? body.params : {};
  try {
    switch (method) {
      case "CheckPerformTransaction":
        return await checkPerform(repo, params, id, nowMs);
      case "CreateTransaction":
        return await createTransaction(repo, params, id, nowMs);
      case "PerformTransaction":
        return await performTransaction(repo, params, id, nowMs);
      case "CancelTransaction":
        return await cancelTransaction(repo, params, id, nowMs);
      case "CheckTransaction":
        return await checkTransaction(repo, params, id);
      case "GetStatement":
        return await getStatement(repo, params, id);
      case "SetFiscalData":
        return await setFiscalData(repo, params, id, nowMs);
      default:
        return rpcError(id, -32601, "Metod topilmadi", "Метод не найден", "Method not found");
    }
  } catch (err) {
    console.error("[payme]", method, err);
    return rpcError(id, -32400, "Tizim xatosi", "Системная ошибка", "System error");
  }
}

export function clickSignaturePayload(secret, params) {
  const action = String(params.action ?? "");
  const parts = [
    params.click_trans_id,
    params.service_id,
    secret,
    params.merchant_trans_id
  ];
  if (action === "1") parts.push(params.merchant_prepare_id);
  parts.push(params.amount, params.action, params.sign_time);
  return parts.map(part => (part == null ? "" : String(part))).join("");
}

export function clickSign(secret, params) {
  return crypto.createHash("md5").update(clickSignaturePayload(secret, params)).digest("hex");
}

export function clickPrepareId(orderId) {
  const hash = crypto.createHash("sha256").update(String(orderId)).digest();
  const value = hash.readUInt32BE(0) % 1_000_000_000;
  return value === 0 ? 1 : value;
}

function clickResponse(params, error, errorNote, prepareId = 0) {
  return {
    click_trans_id: params?.click_trans_id ?? null,
    merchant_trans_id: params?.merchant_trans_id ?? null,
    merchant_prepare_id: prepareId || 0,
    error,
    error_note: errorNote
  };
}

function clickSignOk(secret, params) {
  const expected = clickSign(secret, params);
  const got = str(params.sign_string).toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function clickAmountOk(sent, expectedUzs) {
  const amount = Number(sent);
  return Number.isFinite(amount) && Math.abs(amount - expectedUzs) < 0.001;
}

function applyClick(ctx, params, nowMs) {
  const order = ctx.order;
  const action = String(params.action);
  const prepareId = order?.click?.prepareId || (order ? clickPrepareId(order.orderId) : 0);
  if (!order || order.provider !== "click") {
    return clickResponse(params, -6, "Transaction does not exist");
  }
  if (!clickAmountOk(params.amount, order.amountUzs)) {
    return clickResponse(params, -2, "Incorrect parameter amount", order.click?.prepareId || 0);
  }

  if (action === "0") {
    if (order.status === "paid" || order.premiumGranted) {
      return clickResponse(params, -4, "Already paid", order.click?.prepareId || prepareId);
    }
    if (order.status === "cancelled" || order.status === "failed") {
      return clickResponse(params, -9, "Transaction cancelled", order.click?.prepareId || 0);
    }
    ctx.setOrder(touch(order, nowMs, {
      status: "pending",
      click: {
        clickTransId: str(params.click_trans_id),
        clickPaydocId: str(params.click_paydoc_id),
        prepareId,
        signTime: str(params.sign_time),
        lastError: 0
      }
    }));
    return clickResponse(params, 0, "Success", prepareId);
  }

  if (action !== "1") {
    return clickResponse(params, -3, "Action not found");
  }

  const storedPrepare = order.click?.prepareId;
  if (!storedPrepare) {
    return clickResponse(params, -6, "Transaction does not exist");
  }
  if (str(params.merchant_prepare_id) !== String(storedPrepare)) {
    return clickResponse(params, -6, "Transaction does not exist", storedPrepare);
  }

  const clickError = Number(params.error ?? 0);
  if (Number.isFinite(clickError) && clickError < 0) {
    ctx.setOrder(touch(order, nowMs, {
      status: "cancelled",
      click: { ...order.click, lastError: clickError }
    }));
    return clickResponse(params, -9, "Transaction cancelled", storedPrepare);
  }

  if (order.status === "paid" || order.premiumGranted) {
    if (str(order.click?.clickTransId) === str(params.click_trans_id)) {
      return clickResponse(params, 0, "Success", storedPrepare);
    }
    return clickResponse(params, -4, "Already paid", storedPrepare);
  }
  if (order.status === "cancelled" || order.status === "failed") {
    return clickResponse(params, -9, "Transaction cancelled", storedPrepare);
  }

  let next = touch(order, nowMs, {
    click: {
      ...order.click,
      clickTransId: str(params.click_trans_id),
      clickPaydocId: str(params.click_paydoc_id || order.click?.clickPaydocId),
      lastError: 0
    }
  });
  next = applyGrant(ctx, next, nowMs);
  ctx.setOrder(next);
  return clickResponse(params, 0, "Success", storedPrepare);
}

export async function handleClickRequest(repo, rawParams, cfg, nowMs = Date.now()) {
  const params = rawParams && typeof rawParams === "object" ? rawParams : {};
  if (!cfg?.clickSecret || !cfg?.clickServiceId) {
    return clickResponse(params, -8, "To'lov tizimi sozlanmagan");
  }
  if (!clickSignOk(cfg.clickSecret, params)) {
    return clickResponse(params, -1, "SIGN CHECK FAILED");
  }
  if (str(params.service_id) !== str(cfg.clickServiceId)) {
    return clickResponse(params, -8, "Error in request from click");
  }
  const action = String(params.action ?? "");
  if (action !== "0" && action !== "1") {
    return clickResponse(params, -3, "Action not found");
  }
  const orderId = str(params.merchant_trans_id);
  if (!orderId) return clickResponse(params, -6, "Transaction does not exist");
  try {
    return await repo.runOrder(orderId, ctx => applyClick(ctx, params, nowMs));
  } catch (err) {
    console.error("[click]", err);
    return clickResponse(params, -7, "Failed to update user");
  }
}

export function premiumWritePatch(prev, next, deleteSentinel) {
  const patch = {};
  for (const key of PREMIUM_USER_KEYS) {
    const before = prev?.[key] ?? null;
    const after = next?.[key] ?? null;
    if (before === after) continue;
    patch[key] = after == null ? deleteSentinel : after;
  }
  return patch;
}

function stripNulls(user) {
  if (!user) return user;
  const next = { ...user };
  for (const key of PREMIUM_USER_KEYS) {
    if (next[key] == null) delete next[key];
  }
  return next;
}

export function createMemoryPaymentRepo(initial = {}) {
  const orders = new Map();
  const users = new Map();
  for (const order of initial.orders || []) orders.set(order.orderId, structuredClone(order));
  for (const [uid, user] of Object.entries(initial.users || {})) {
    users.set(uid, structuredClone(user));
  }

  return {
    async findOrderByPaymeId(paymeId) {
      for (const order of orders.values()) {
        if (order.payme?.id === paymeId) return order.orderId;
      }
      return null;
    },
    async listPaymeCreatedBetween(from, to) {
      return [...orders.values()]
        .filter(order => {
          const created = Number(order.payme?.createTime);
          return Number.isFinite(created) && created >= from && created <= to;
        })
        .map(order => structuredClone(order));
    },
    async runOrder(orderId, worker) {
      const current = orders.get(orderId);
      const order = current ? structuredClone(current) : null;
      const uid = order?.uid || null;
      const user = uid && users.has(uid) ? structuredClone(users.get(uid)) : null;
      let nextOrder;
      let nextUser;
      let userSet = false;
      const response = await worker({
        order,
        user,
        setOrder(value) { nextOrder = value; },
        setUser(value) { nextUser = value; userSet = true; }
      });
      if (nextOrder) orders.set(nextOrder.orderId || orderId, structuredClone(nextOrder));
      if (userSet && uid) users.set(uid, stripNulls(structuredClone(nextUser)));
      return response;
    },
    dump() {
      return {
        orders: Object.fromEntries([...orders.entries()].map(([id, order]) => [id, structuredClone(order)])),
        users: Object.fromEntries([...users.entries()].map(([uid, user]) => [uid, structuredClone(user)]))
      };
    }
  };
}
