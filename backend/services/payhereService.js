// backend/services/payhereService.js
const crypto = require("crypto");

/**
 * PayHere Payment Gateway Service
 * 
 * Supports Sri Lankan hospitality payment processing through PayHere:
 * - Sandbox and Live mode support
 * - Secure MD5 signature/hash generation on backend
 * - Server-side webhook (notify_url) verification
 * - Currency and amount formatting conforming to PayHere specifications
 * - No credentials exposed to browser
 */

const getPayHereConfig = () => {
  const merchantId = process.env.PAYHERE_MERCHANT_ID || "1211111"; // Standard PayHere Sandbox test merchant ID
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || "SerendibSanctuarySandboxSecretKey2026!";
  const mode = (process.env.PAYHERE_MODE || "sandbox").toLowerCase();
  const isSandbox = mode === "sandbox";
  const checkoutUrl = isSandbox
    ? "https://sandbox.payhere.lk/pay/checkout"
    : "https://www.payhere.lk/pay/checkout";

  const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const backendBaseUrl = process.env.BACKEND_URL || "http://localhost:5000";

  return {
    merchantId,
    merchantSecret,
    mode,
    isSandbox,
    checkoutUrl,
    frontendBaseUrl,
    backendBaseUrl
  };
};

/**
 * Format amount as PayHere requires: 2 decimal places with '.' separator e.g., "1500.00"
 */
const formatPayHereAmount = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
};

/**
 * Generate MD5 hash of a string
 */
const md5 = (string) => {
  return crypto.createHash("md5").update(String(string)).digest("hex").toUpperCase();
};

/**
 * Generate PayHere payment checkout hash
 * Specification:
 * hash = strtoupper(md5(merchant_id + order_id + amountFormatted + currency + strtoupper(md5(merchant_secret))))
 */
const generatePaymentHash = (orderId, amount, currency = "LKR") => {
  const config = getPayHereConfig();
  const formattedAmount = formatPayHereAmount(amount);
  const secretHash = md5(config.merchantSecret);
  const rawString = `${config.merchantId}${orderId}${formattedAmount}${currency.toUpperCase()}${secretHash}`;
  return md5(rawString);
};

/**
 * Verify PayHere webhook callback signature (md5sig)
 * Specification:
 * local_md5sig = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
 */
const verifyNotificationSignature = ({
  merchantId,
  orderId,
  payhereAmount,
  payhereCurrency,
  statusCode,
  receivedMd5sig
}) => {
  const config = getPayHereConfig();

  // If merchantId received doesn't match configured merchantId
  if (String(merchantId) !== String(config.merchantId)) {
    return false;
  }

  const secretHash = md5(config.merchantSecret);
  const rawString = `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`;
  const calculatedMd5sig = md5(rawString);

  return calculatedMd5sig.toUpperCase() === String(receivedMd5sig).toUpperCase();
};

/**
 * Map PayHere status_code to internal payment status
 * PayHere Status Codes:
 *  2: Success / Paid
 *  0: Pending (Offline methods like bank deposit / pending card clearance)
 * -1: Canceled by user
 * -2: Failed
 * -3: Chargedback
 */
const mapPayHereStatusCode = (statusCode) => {
  const code = Number(statusCode);
  switch (code) {
    case 2:
      return "completed";
    case 0:
      return "pending";
    case -1:
      return "cancelled";
    case -2:
      return "failed";
    case -3:
      return "refunded";
    default:
      return "failed";
  }
};

async function buildPayHereCheckout(payment, sessionUser, title, purpose, targetId) {
  const User = require("../models/User");
  const { amount: payableAmount, currency } = payment;
  // Retrieve user contact details for checkout
  const currentUser = await User.findById(sessionUser.id);
  const firstName = currentUser?.name?.split(" ")[0] || "Valued";
  const lastName = currentUser?.name?.split(" ").slice(1).join(" ") || "Guest";
  const email = currentUser?.email || sessionUser.email || "";
  const phone = currentUser?.phone || sessionUser.phone || "0770000000";
  const address = currentUser?.address || "Serendib Guest Residence";

  const config = getPayHereConfig();
  const orderId = payment.paymentReference;
  const hash = generatePaymentHash(orderId, payableAmount, currency);

  // PayHere checkout payload
  const payHereParams = {
    sandbox: config.isSandbox,
    merchant_id: config.merchantId,
    return_url: `${config.frontendBaseUrl}/payment/success?ref=${orderId}`,
    cancel_url: `${config.frontendBaseUrl}/payment/cancel?ref=${orderId}`,
    notify_url: `${config.backendBaseUrl}/api/payments/payhere/notify`,
    order_id: orderId,
    items: title,
    amount: formatPayHereAmount(payableAmount),
    currency: currency.toUpperCase(),
    hash: hash,
    first_name: firstName,
    last_name: lastName,
    email: email,
    phone: phone,
    address: address,
    city: "Colombo",
    country: "Sri Lanka",
    custom_1: purpose,
    custom_2: String(targetId)
  };

  return {
    success: true,
    paymentId: payment._id,
    paymentReference: payment.paymentReference,
    amount: payableAmount,
    currency,
    checkoutUrl: config.checkoutUrl,
    payHereParams
  };
}

module.exports = {
  getPayHereConfig,
  formatPayHereAmount,
  generatePaymentHash,
  verifyNotificationSignature,
  mapPayHereStatusCode,
  buildPayHereCheckout
};
