const crypto = require('crypto');

/**
 * Mock payment gateway. It mimics the shape of a real sandbox (Stripe-style):
 * an async call that returns a reference and either succeeds or fails. Cards
 * ending in 0000 always fail, which makes the failure path demonstrable.
 */
function reference() {
  return `stl_${crypto.randomBytes(8).toString('hex')}`;
}

async function charge({ amountCents, currency, cardNumber = '4242424242424242' }) {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const digits = String(cardNumber).replace(/\s+/g, '');
  if (digits.length < 12) {
    return { ok: false, reference: reference(), reason: 'Card number is too short' };
  }
  if (digits.endsWith('0000')) {
    return { ok: false, reference: reference(), reason: 'Card declined by issuer' };
  }
  if (amountCents <= 0) {
    return { ok: false, reference: reference(), reason: 'Amount must be greater than zero' };
  }

  return { ok: true, reference: reference(), amountCents, currency };
}

module.exports = { charge, reference };
