import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_SENDS_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  generateOtpCode,
  hashOtp,
  newSalt,
  isWellFormedOtp,
  evaluateSend,
  buildSendRecord,
  evaluateVerify,
  maskEmail,
  buildOtpEmail
} from "./pinEmailOtp.js";

describe("PIN email OTP helpers", () => {
  it("generates a 6-digit numeric code", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      assert.match(code, /^\d{6}$/);
      assert.equal(isWellFormedOtp(code), true);
    }
  });

  it("hashes with salt/pepper and verifies server-side only", () => {
    const salt = newSalt();
    const pepper = "pepper";
    const code = "123456";
    const hash = hashOtp(code, salt, pepper);
    assert.notEqual(hash, code);
    assert.equal(hash, hashOtp("123456", salt, pepper));
    assert.notEqual(hash, hashOtp("123456", salt, "other"));
    assert.notEqual(hash, hashOtp("000000", salt, pepper));
  });

  it("accepts a matching code before expiry", () => {
    const now = 1_000_000;
    const rec = buildSendRecord(null, "654321", now, "p");
    const result = evaluateVerify(rec, "654321", now + 1000, "p");
    assert.equal(result.ok, true);
  });

  it("rejects expired, consumed, mismatched, and locked codes", () => {
    const now = 5_000_000;
    const rec = buildSendRecord(null, "111222", now, "p");

    assert.equal(evaluateVerify(rec, "111222", now + OTP_TTL_MS + 1, "p").reason, "expired");
    assert.equal(evaluateVerify({ ...rec, consumed: true }, "111222", now + 1, "p").reason, "not-found");
    const miss = evaluateVerify(rec, "000000", now + 1, "p");
    assert.equal(miss.ok, false);
    assert.equal(miss.reason, "mismatch");
    assert.equal(miss.attempts, 1);

    const locked = evaluateVerify({ ...rec, attempts: MAX_VERIFY_ATTEMPTS }, "111222", now + 1, "p");
    assert.equal(locked.reason, "locked");
  });

  it("rate-limits resends and hourly volume", () => {
    const now = 9_000_000;
    const first = buildSendRecord(null, "101010", now, "p");
    const cool = evaluateSend(first, now + RESEND_COOLDOWN_MS - 1);
    assert.equal(cool.ok, false);
    assert.equal(cool.reason, "cooldown");

    const afterCool = evaluateSend(first, now + RESEND_COOLDOWN_MS);
    assert.equal(afterCool.ok, true);

    let rec = first;
    let t = now;
    for (let i = 1; i < MAX_SENDS_PER_HOUR; i++) {
      t += RESEND_COOLDOWN_MS;
      rec = buildSendRecord(rec, "101010", t, "p");
    }
    const limited = evaluateSend(rec, t + RESEND_COOLDOWN_MS);
    assert.equal(limited.ok, false);
    assert.equal(limited.reason, "hourly-limit");
  });

  it("masks emails and builds locale copy", () => {
    assert.equal(maskEmail("ali@example.com"), "a***@example.com");
    const mail = buildOtpEmail("uz", "424242");
    assert.match(mail.subject, /424242/);
    assert.match(mail.text, /424242/);
  });
});
