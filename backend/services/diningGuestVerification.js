const crypto = require("node:crypto");
const Reservation = require("../models/Reservation");

const normalizeEmail = value => typeof value === "string" ? value.trim().toLowerCase() : "";

function normalizePhone(value) {
  if (typeof value !== "string" || !/^[+\d().\s-]+$/.test(value)) return "";
  const digits = value.replace(/\D/g, "").replace(/^(?:0094|94)(?=\d{9}$)/, "0");
  return /^\d{7,15}$/.test(digits) ? digits : "";
}

function matchesContact(record, identity) {
  const email = normalizeEmail(identity.email);
  const phone = normalizePhone(identity.phone);
  return !!email && !!phone && normalizeEmail(record?.email) === email && normalizePhone(record?.phone) === phone;
}

async function findVerifiedStay(property, selector, identity) {
  if (!property) return null;
  const stay = await Reservation.findOne({
    ...selector, property, status: { $in: ["Confirmed", "Checked-In"] }
  }).populate("guest", "email phone").populate("room", "roomNumber").lean();
  if (!stay || !matchesContact(stay.guest, identity)) return null;
  if (identity.roomNumber && (typeof identity.roomNumber !== "string" ||
      identity.roomNumber.trim() !== String(stay.room?.roomNumber || ""))) return null;
  return stay;
}

function hashGuestToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createGuestToken() {
  return crypto.randomBytes(32).toString("hex");
}

function verifyGuestToken(token, hash) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) &&
    typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) &&
    crypto.timingSafeEqual(Buffer.from(hashGuestToken(token), "hex"), Buffer.from(hash, "hex"));
}

module.exports = { findVerifiedStay, matchesContact, hashGuestToken, createGuestToken, verifyGuestToken };
