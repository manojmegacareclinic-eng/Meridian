export interface MailMessage {
  subject: string;
  text: string;
}

export interface MailTransport {
  send(to: string, message: MailMessage): Promise<void>;
}

/**
 * Console transport is the default: on this network external hosts (SMTP)
 * are unreachable, and it still exercises the full verification flow. Switch
 * to SMTP by adding SMTP_* env vars.
 */
export const consoleMail: MailTransport = {
  async send(to, message) {
    console.info("\n[Mail:console]");
    console.info(`  to: ${to}`);
    console.info(`  subject: ${message.subject}`);
    console.info(`  body:\n${message.text}`);
    console.info("[End mail]\n");
  },
};

let smtp: MailTransport | null = null;

export function getMailTransport(): MailTransport {
  if (process.env.SMTP_HOST) {
    if (!smtp) smtp = createSmtpTransport();
    return smtp;
  }
  return consoleMail;
}

function createSmtpTransport(): MailTransport {
  const nodemailer = require("nodemailer") as typeof import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  const from = process.env.SMTP_FROM ?? '"Meridian" <no-reply@meridian.local>';
  return {
    async send(to, message) {
      await transport.sendMail({ from, to, subject: message.subject, text: message.text });
    },
  };
}