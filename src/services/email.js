const nodemailer = require('nodemailer');

let transporter;

/** Built lazily so a server that never sends email doesn't need SMTP configured to boot. */
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in the environment.'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

async function sendResetCodeEmail(to, name, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await getTransporter().sendMail({
    from,
    to,
    subject: 'Your SplitIt password reset code',
    text: `Hi ${name},\n\nYour SplitIt password reset code is ${code}. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore this email.`,
    html: `
      <p>Hi ${name},</p>
      <p>Your SplitIt password reset code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:0.3em">${code}</p>
      <p>It expires in 10 minutes. If you did not ask for this, you can ignore this email.</p>
    `
  });

  // A no-op against a real provider — only a throwaway service like Ethereal returns
  // a preview URL here, which is what makes this useful for testing without an inbox.
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`Password reset email preview: ${preview}`);
}

module.exports = { sendResetCodeEmail };
