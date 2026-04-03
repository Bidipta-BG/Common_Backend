const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
const resend = new Resend(resendApiKey || 're_dummy');

const FROM_EMAIL = 'Phesa <hello@phesa.com>'; // Update with verified domain
const BRAND_COLOR = '#0f3460';
const FOOTER_TEXT = 'Phesa — Built for Indian Creators';

const wrapHtmlWithBrand = (content) => `
  <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eee;">
      <h2 style="color: ${BRAND_COLOR}; margin: 0;">Phesa</h2>
    </div>
    <div style="padding: 20px 0; line-height: 1.6;">
      ${content}
    </div>
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
      ${FOOTER_TEXT}
    </div>
  </div>
`;

const sendEmail = async (to, subject, html) => {
  try {
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY missing, skipping email to:', to);
      return { success: true, dummy: true };
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html
    });

    if (error) {
      console.error('Resend Error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Unhandled Resend Exception:', error);
    return { success: false, error }; // never throws
  }
};

const sendNewTestimonialEmail = async (ownerEmail, reviewerName, formTitle) => {
  const subject = `New testimonial from ${reviewerName} is waiting for your review`;
  const content = `
    <h3 style="color: ${BRAND_COLOR};">New Testimonial Received</h3>
    <p>Hi there,</p>
    <p>You have just received a new testimonial from <strong>${reviewerName}</strong> on your form "<strong>${formTitle}</strong>".</p>
    <p>It is currently <strong>waiting for review</strong>. You can approve or reject it from your dashboard.</p>
    <p style="text-align: center; margin-top: 30px;">
      <a href="https://phesa.com/dashboard" style="background-color: ${BRAND_COLOR}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Go to Dashboard</a>
    </p>
  `;
  return sendEmail(ownerEmail, subject, wrapHtmlWithBrand(content));
};

const sendWelcomeEmail = async (userEmail, userName) => {
  const subject = 'Welcome to Phesa!';
  const nameDisplay = userName ? userName : 'Creator';
  const content = `
    <h3 style="color: ${BRAND_COLOR};">Welcome to Phesa, ${nameDisplay}!</h3>
    <p>We're thrilled to have you on board.</p>
    <p>Phesa helps you collect amazing video and text testimonials from your customers and display them beautifully.</p>
    <p>Ready to get started? Build your first form and share it with your audience.</p>
    <p style="text-align: center; margin-top: 30px;">
      <a href="https://phesa.com/dashboard" style="background-color: ${BRAND_COLOR}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Create a Form</a>
    </p>
  `;
  return sendEmail(userEmail, subject, wrapHtmlWithBrand(content));
};

module.exports = {
  sendEmail,
  sendNewTestimonialEmail,
  sendWelcomeEmail
};
