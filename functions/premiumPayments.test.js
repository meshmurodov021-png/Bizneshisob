import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  PREMIUM_PERIOD_MS,
  PREMIUM_PRICE_TIYIN,
  PREMIUM_PRICE_UZS,
  PAYME_TX_TIMEOUT_MS,
  buildClickCheckoutUrl,
  buildPaymeCheckoutUrl,
  buildPremiumOrder,
  clickPrepareId,
  clickSignaturePayload,
  clickSign,
  createMemoryPaymentRepo,
  handleClickRequest,
  handlePaymeRpc,
  paymeAuthorized,
  paymeCheckoutToken,
  pickReusableOrder,
  premiumAccessActive,
  providerConfigured,
  readPaymentConfig
} from "./premiumPayments.js";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const PAYME_KEY = "test-payme-key";
const CLICK_SECRET = "click-secret";

function cfg(overrides = {}) {
  return readPaymentConfig({
    PAYME_MERCHANT_ID: "587f72c72cac0d162c722ae2",
    PAYME_KEY,
    CLICK_SERVICE_ID: "36",
    CLICK_MERCHANT_ID: "46",
    CLICK_SECRET_KEY: CLICK_SECRET,
    PAYMENTS_RETURN_URL: "https://bizneshisob.vercel.app/app?payment=return",
    ...overrides
  });
}

function order(partial = {}) {
  return {
    ...buildPremiumOrder({
      orderId: "order1",
      uid: "user1",
      provider: partial.provider || "payme",
      nowMs: NOW
    }),
    ...partial
  };
}

function authHeader(key = PAYME_KEY) {
  return `Basic ${Buffer.from(`Paycom:${key}`).toString("base64")}`;
}

async function payme(repo, method, params, { authorized = true, nowMs = NOW, id = 1 } = {}) {
  return handlePaymeRpc(repo, { id, method, params }, { authorized, nowMs });
}

function clickParams(action, extra = {}, secret = CLICK_SECRET) {
  const params = {
    click_trans_id: "555",
    service_id: "36",
    click_paydoc_id: "777",
    merchant_trans_id: "order1",
    amount: "29900.00",
    action: String(action),
    error: "0",
    error_note: "Ok",
    sign_time: "2026-10-01 00:00:00",
    ...extra
  };
  params.sign_string = clickSign(secret, params);
  return params;
}

describe("payment config and checkout URLs", () => {
  it("matches Payme's documented base64 checkout token", () => {
    const params = "m=587f72c72cac0d162c722ae2;ac.order_id=197;a=500";
    assert.equal(
      paymeCheckoutToken(params),
      "bT01ODdmNzJjNzJjYWMwZDE2MmM3MjJhZTI7YWMub3JkZXJfaWQ9MTk3O2E9NTAw"
    );
  });

  it("builds a Payme checkout URL with order, tiyin amount, and return URL", () => {
    const url = buildPaymeCheckoutUrl(cfg(), { orderId: "order1", lang: "uz" });
    assert.match(url, /^https:\/\/checkout\.paycom\.uz\/[A-Za-z0-9+/=]+$/);
    const token = url.split("/").pop();
    const decoded = Buffer.from(token, "base64").toString("utf8");
    assert.match(decoded, /m=587f72c72cac0d162c722ae2/);
    assert.match(decoded, /ac\.order_id=order1/);
    assert.match(decoded, new RegExp(`a=${PREMIUM_PRICE_TIYIN}`));
    assert.match(decoded, /payment=return/);
  });

  it("uses the Payme test checkout host in test mode", () => {
    const url = buildPaymeCheckoutUrl(cfg({ PAYMENTS_TEST_MODE: "true", PAYME_TEST_KEY: "sandbox" }), {
      orderId: "order1"
    });
    assert.match(url, /^https:\/\/test\.paycom\.uz\//);
  });

  it("builds a Click pay link for 29900.00 UZS", () => {
    const url = new URL(buildClickCheckoutUrl(cfg(), { orderId: "order1" }));
    assert.equal(url.origin + url.pathname, "https://my.click.uz/services/pay");
    assert.equal(url.searchParams.get("service_id"), "36");
    assert.equal(url.searchParams.get("merchant_id"), "46");
    assert.equal(url.searchParams.get("amount"), "29900.00");
    assert.equal(url.searchParams.get("transaction_param"), "order1");
    assert.equal(url.searchParams.get("merchant_user_id"), null);
  });

  it("reports providers missing until their env vars are set", () => {
    const empty = readPaymentConfig({});
    assert.equal(empty.paymeReady, false);
    assert.equal(empty.clickReady, false);
    assert.equal(providerConfigured(empty, "payme"), false);
    assert.equal(providerConfigured(cfg(), "click"), true);
  });

  it("authorizes Payme Basic Paycom credentials", () => {
    assert.equal(paymeAuthorized(authHeader(), PAYME_KEY), true);
    assert.equal(paymeAuthorized(authHeader("other"), PAYME_KEY), false);
    assert.equal(paymeAuthorized("Bearer nope", PAYME_KEY), false);
    assert.equal(paymeAuthorized(authHeader(), ""), false);
  });
});

describe("Payme merchant", () => {
  it("rejects missing credentials before it reads the order", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order()] });
    const response = await payme(repo, "CheckPerformTransaction", {
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    }, { authorized: false });
    assert.equal(response.error.code, -32504);
    assert.equal(repo.dump().orders.order1.status, "created");
  });

  it("allows the premium amount and rejects a different sum", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order()] });
    const ok = await payme(repo, "CheckPerformTransaction", {
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    assert.equal(ok.result.allow, true);

    const bad = await payme(repo, "CheckPerformTransaction", {
      amount: 100,
      account: { order_id: "order1" }
    });
    assert.equal(bad.error.code, -31001);

    const missing = await payme(repo, "CheckPerformTransaction", {
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "missing" }
    });
    assert.equal(missing.error.code, -31050);
    assert.equal(missing.error.data, "order_id");
  });

  it("creates, performs once, and extends premium by 30 days", async () => {
    const repo = createMemoryPaymentRepo({
      orders: [order()],
      users: { user1: { email: "a@b.uz", isPremium: false } }
    });
    const created = await payme(repo, "CreateTransaction", {
      id: "payme-tx-1",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    assert.equal(created.result.state, 1);
    assert.equal(created.result.transaction, "order1");

    const again = await payme(repo, "CreateTransaction", {
      id: "payme-tx-1",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    assert.equal(again.result.state, 1);
    assert.equal(again.result.create_time, NOW);

    const performed = await payme(repo, "PerformTransaction", { id: "payme-tx-1" }, { nowMs: NOW + 1000 });
    assert.equal(performed.result.state, 2);
    const user = repo.dump().users.user1;
    assert.equal(user.isPremium, true);
    assert.equal(user.premiumSource, "payme");
    assert.equal(user.premiumOrderId, "order1");
    assert.equal(Date.parse(user.premiumUntil) - (NOW + 1000), PREMIUM_PERIOD_MS);

    const repeat = await payme(repo, "PerformTransaction", { id: "payme-tx-1" }, { nowMs: NOW + 5000 });
    assert.equal(repeat.result.state, 2);
    assert.equal(repo.dump().users.user1.premiumUntil, user.premiumUntil);
    assert.equal(repo.dump().orders.order1.premiumGranted, true);
  });

  it("extends an existing premium period instead of replacing it", async () => {
    const existingUntil = new Date(NOW + 10 * 24 * 60 * 60 * 1000).toISOString();
    const repo = createMemoryPaymentRepo({
      orders: [order()],
      users: { user1: { isPremium: true, premiumUntil: existingUntil } }
    });
    await payme(repo, "CreateTransaction", {
      id: "payme-tx-2",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    await payme(repo, "PerformTransaction", { id: "payme-tx-2" });
    const until = Date.parse(repo.dump().users.user1.premiumUntil);
    assert.equal(until - Date.parse(existingUntil), PREMIUM_PERIOD_MS);
  });

  it("cancels an unpaid transaction and refunds a performed one", async () => {
    const repo = createMemoryPaymentRepo({
      orders: [order()],
      users: { user1: { isPremium: false, email: "a@b.uz" } }
    });
    await payme(repo, "CreateTransaction", {
      id: "payme-tx-3",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    const cancelled = await payme(repo, "CancelTransaction", { id: "payme-tx-3", reason: 3 });
    assert.equal(cancelled.result.state, -1);
    assert.equal(repo.dump().users.user1.isPremium, false);

    const fresh = createMemoryPaymentRepo({
      orders: [order({ orderId: "order2" })],
      users: { user1: { isPremium: true, premiumUntil: null } }
    });
    await payme(fresh, "CreateTransaction", {
      id: "payme-tx-4",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order2" }
    });
    await payme(fresh, "PerformTransaction", { id: "payme-tx-4" }, { nowMs: NOW + 10 });
    assert.equal(fresh.dump().users.user1.isPremium, true);
    const refunded = await payme(fresh, "CancelTransaction", { id: "payme-tx-4", reason: 5 }, { nowMs: NOW + 20 });
    assert.equal(refunded.result.state, -2);
    assert.equal(fresh.dump().users.user1.isPremium, true);
    assert.equal(fresh.dump().users.user1.premiumUntil, undefined);
  });

  it("times out a transaction that was never performed", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order()] });
    await payme(repo, "CreateTransaction", {
      id: "payme-tx-5",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    const late = NOW + PAYME_TX_TIMEOUT_MS + 1;
    const response = await payme(repo, "PerformTransaction", { id: "payme-tx-5" }, { nowMs: late });
    assert.equal(response.error.code, -31008);
    assert.equal(repo.dump().orders.order1.payme.state, -1);
    assert.equal(repo.dump().orders.order1.payme.reason, 4);
  });

  it("returns statement rows and stores fiscal data", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order()] });
    await payme(repo, "CreateTransaction", {
      id: "payme-tx-6",
      time: NOW,
      amount: PREMIUM_PRICE_TIYIN,
      account: { order_id: "order1" }
    });
    const statement = await payme(repo, "GetStatement", { from: NOW - 1, to: NOW + 1 });
    assert.equal(statement.result.transactions.length, 1);
    assert.equal(statement.result.transactions[0].id, "payme-tx-6");
    assert.equal(statement.result.transactions[0].amount, PREMIUM_PRICE_TIYIN);

    const fiscal = await payme(repo, "SetFiscalData", {
      id: "payme-tx-6",
      type: "PERFORM",
      fiscal_data: { receipt_id: 121 }
    });
    assert.equal(fiscal.result.success, true);
    assert.equal(repo.dump().orders.order1.fiscal.perform.receipt_id, 121);
  });
});

describe("Click merchant", () => {
  it("prepares and completes a payment for the signed amount", async () => {
    const repo = createMemoryPaymentRepo({
      orders: [order({ provider: "click" })],
      users: { user1: { isPremium: false } }
    });
    const config = cfg();
    const prepared = await handleClickRequest(repo, clickParams(0), config, NOW);
    assert.equal(prepared.error, 0);
    assert.equal(prepared.merchant_prepare_id, clickPrepareId("order1"));

    const completed = await handleClickRequest(
      repo,
      clickParams(1, { merchant_prepare_id: String(prepared.merchant_prepare_id) }),
      config,
      NOW + 1000
    );
    assert.equal(completed.error, 0);
    assert.equal(repo.dump().users.user1.isPremium, true);
    assert.equal(repo.dump().users.user1.premiumSource, "click");
    assert.equal(Date.parse(repo.dump().users.user1.premiumUntil) - (NOW + 1000), PREMIUM_PERIOD_MS);
    assert.equal(PREMIUM_PRICE_UZS, 29900);
  });

  it("rejects a bad signature and a wrong amount", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order({ provider: "click" })] });
    const config = cfg();
    const badSign = clickParams(0);
    badSign.sign_string = "deadbeef";
    const denied = await handleClickRequest(repo, badSign, config, NOW);
    assert.equal(denied.error, -1);

    const wrongAmount = clickParams(0, { amount: "100.00" });
    const amount = await handleClickRequest(repo, wrongAmount, config, NOW);
    assert.equal(amount.error, -2);
    assert.equal(repo.dump().orders.order1.status, "created");
  });

  it("is idempotent for the same Click transaction and blocks a second one", async () => {
    const repo = createMemoryPaymentRepo({
      orders: [order({ provider: "click" })],
      users: { user1: { isPremium: false } }
    });
    const config = cfg();
    const prepared = await handleClickRequest(repo, clickParams(0), config, NOW);
    const complete = clickParams(1, { merchant_prepare_id: String(prepared.merchant_prepare_id) });
    await handleClickRequest(repo, complete, config, NOW + 1000);
    const until = repo.dump().users.user1.premiumUntil;
    const again = await handleClickRequest(repo, complete, config, NOW + 9000);
    assert.equal(again.error, 0);
    assert.equal(repo.dump().users.user1.premiumUntil, until);

    const other = clickParams(1, {
      click_trans_id: "999",
      merchant_prepare_id: String(prepared.merchant_prepare_id)
    });
    const blocked = await handleClickRequest(repo, other, config, NOW + 9000);
    assert.equal(blocked.error, -4);
  });

  it("cancels when Click reports an error and fails closed without a secret", async () => {
    const repo = createMemoryPaymentRepo({ orders: [order({ provider: "click" })] });
    const config = cfg();
    const prepared = await handleClickRequest(repo, clickParams(0), config, NOW);
    const failed = await handleClickRequest(
      repo,
      clickParams(1, { merchant_prepare_id: String(prepared.merchant_prepare_id), error: "-1" }),
      config,
      NOW
    );
    assert.equal(failed.error, -9);
    assert.equal(repo.dump().orders.order1.status, "cancelled");

    const unconfigured = await handleClickRequest(repo, clickParams(0), readPaymentConfig({}), NOW);
    assert.equal(unconfigured.error, -8);
    assert.match(unconfigured.error_note, /sozlanmagan/);
  });

  it("signs prepare without merchant_prepare_id and complete with it", () => {
    const base = {
      click_trans_id: "1",
      service_id: "2",
      merchant_trans_id: "order",
      merchant_prepare_id: "prepare-id",
      amount: "29900.00",
      action: "0",
      sign_time: "2026-01-01 00:00:00"
    };
    const preparePayload = clickSignaturePayload(CLICK_SECRET, base);
    assert.equal(preparePayload.includes("prepare-id"), false);
    const completePayload = clickSignaturePayload(CLICK_SECRET, { ...base, action: "1" });
    assert.match(completePayload, /prepare-id/);
    assert.equal(
      clickSign(CLICK_SECRET, base),
      crypto.createHash("md5").update(`12${CLICK_SECRET}order29900.0002026-01-01 00:00:00`).digest("hex")
    );
  });

  it("removes premium after a refund when the user was not premium before", async () => {
    const repo = createMemoryPaymentRepo({
      orders: [order({ provider: "click" })],
      users: { user1: { isPremium: false } }
    });
    const config = cfg();
    const prepared = await handleClickRequest(repo, clickParams(0), config, NOW);
    await handleClickRequest(
      repo,
      clickParams(1, { merchant_prepare_id: String(prepared.merchant_prepare_id) }),
      config,
      NOW + 1000
    );
    assert.equal(repo.dump().users.user1.isPremium, true);
    const refundOrder = repo.dump().orders.order1;
    const paymeRepo = createMemoryPaymentRepo({
      orders: [{
        ...refundOrder,
        provider: "payme",
        payme: {
          id: "payme-refund",
          time: NOW,
          createTime: NOW,
          performTime: NOW + 1000,
          cancelTime: 0,
          state: 2,
          reason: null
        }
      }],
      users: { user1: repo.dump().users.user1 }
    });
    const refunded = await payme(paymeRepo, "CancelTransaction", { id: "payme-refund", reason: 5 }, { nowMs: NOW + 2000 });
    assert.equal(refunded.result.state, -2);
    assert.equal(paymeRepo.dump().users.user1.isPremium, false);
    assert.equal(paymeRepo.dump().users.user1.premiumUntil, undefined);
  });
});

describe("reusable orders and premium access", () => {
  it("reuses a fresh unpaid order and skips paid ones", () => {
    const fresh = order({ createdAt: new Date(NOW).toISOString(), status: "created" });
    const paid = order({ orderId: "paid", status: "paid", premiumGranted: true, createdAt: new Date(NOW).toISOString() });
    assert.equal(pickReusableOrder([paid, fresh], "payme", NOW)?.orderId, "order1");
    assert.equal(pickReusableOrder([paid], "payme", NOW), null);
  });

  it("treats legacy premium without an end date as active", () => {
    assert.equal(premiumAccessActive(true, null, NOW), true);
    assert.equal(premiumAccessActive(true, new Date(NOW + 1000).toISOString(), NOW), true);
    assert.equal(premiumAccessActive(true, new Date(NOW - 1000).toISOString(), NOW), false);
    assert.equal(premiumAccessActive(false, null, NOW), false);
  });
});
