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

module.exports = {
  getPayHereConfig,
  formatPayHereAmount,
  generatePaymentHash,
  verifyNotificationSignature,
  mapPayHereStatusCode
};
