const Razorpay = require('razorpay');

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;

if (!key_id || !key_secret) {
  console.warn('Missing Razorpay environment variables: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
}

const razorpay = new Razorpay({
  key_id: key_id || 'dummy_key_id',
  key_secret: key_secret || 'dummy_key_secret',
});

module.exports = razorpay;
