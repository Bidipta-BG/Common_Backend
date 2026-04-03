const crypto = require('crypto');
const supabase = require('../lib/supabase');
const razorpay = require('../lib/razorpay');

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;

const paymentController = {
  createSubscription: async (req, res) => {
    try {
      const { plan } = req.body;
      const userId = req.userId;

      if (!plan || !['starter', 'pro'].includes(plan)) {
        return res.status(400).json({ error: 'Valid plan (starter or pro) is required' });
      }

      const planIdEnvVar = plan === 'pro' ? 'RAZORPAY_PRO_PLAN_ID' : 'RAZORPAY_STARTER_PLAN_ID';
      const rzpPlanId = process.env[planIdEnvVar];

      if (!rzpPlanId) {
        return res.status(500).json({ error: `Razorpay plan ID not configured for \${plan}. Add \${planIdEnvVar} to .env.` });
      }

      // Standard Razorpay subscription configuration bindings 
      const subscriptionData = {
        plan_id: rzpPlanId,
        customer_notify: 1,
        total_count: 120, // Example interval ceiling
        notes: {
          user_id: userId
        }
      };

      const subscription = await razorpay.subscriptions.create(subscriptionData);

      // Supply raw gateway payload to allow direct frontend verification checkout flow
      res.status(200).json({
        subscription_id: subscription.id,
        razorpay_key: RAZORPAY_KEY_ID
      });
    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Internal server error while initializing checkout flow.' });
    }
  },

  handleWebhook: async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      
      if (!signature || !RAZORPAY_WEBHOOK_SECRET) {
        return res.status(400).send('Webhook signature missing or secret not configured');
      }

      // Verify RSA signature via SHA256 against raw hook body 
      const bodyString = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');

      if (expectedSignature !== signature) {
        return res.status(400).send('Invalid signature');
      }

      const event = req.body.event;
      const payload = req.body.payload;

      if (event === 'subscription.activated') {
        const sub = payload.subscription.entity;
        const customerEmail = payload.payment?.entity?.email;
        
        // Use attached Notes mappings cleanly supplied in \`createSubscription\`, bounding fallback to registered Email lookup
        const userEmail = customerEmail || sub.notes?.email;
        const planType = (sub.plan_id === process.env.RAZORPAY_PRO_PLAN_ID) ? 'pro' : 'starter';

        if (sub.notes && sub.notes.user_id) {
           await supabase
            .from('profiles')
            .update({ 
               plan: planType, 
               razorpay_subscription_id: sub.id 
            })
            .eq('id', sub.notes.user_id);
        } else if (userEmail) {
           // Fallback to match by email
           await supabase
            .from('profiles')
            .update({ 
               plan: planType, 
               razorpay_subscription_id: sub.id 
            })
            .eq('email', userEmail);
        }
      } else if (event === 'subscription.cancelled' || event === 'subscription.halted') {
        const sub = payload.subscription.entity;
        
        await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('razorpay_subscription_id', sub.id);
      } else if (event === 'payment.failed') {
        console.warn('Razorpay payment failed:', payload.payment?.entity);
      }

      // Always reliably return 200 payload acknowledgment to ensure gateway halts active retries to the endpoint structure
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling webhook processing structure:', error);
      res.status(500).send('Internal server error');
    }
  }
};

module.exports = paymentController;