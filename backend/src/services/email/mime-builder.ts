/**
 * Phase 3B: MIME Message Builder
 *
 * Uses nodemailer's MailComposer for RFC 2822 MIME construction.
 * Handles multipart/alternative (text+html), multipart/mixed (attachments),
 * threading headers, and unicode subject encoding.
 */

// MailComposer is not part of nodemailer's public API but is the standard
// pattern for raw MIME construction with Gmail API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MailComposer = require('nodemailer/lib/mail-composer');

export interface MimeOptions {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType: string;
  }>;
}

/**
 * Build a raw MIME message ready for Gmail API send.
 * Returns a Buffer of the complete RFC 2822 message.
 */
export async function buildMimeMessage(options: MimeOptions): Promise<Buffer> {
  const mailOptions: Record<string, unknown> = {
    from: options.from,
    to: options.to.join(', '),
    subject: options.subject,
  };

  if (options.cc && options.cc.length > 0) {
    mailOptions.cc = options.cc.join(', ');
  }
  if (options.bcc && options.bcc.length > 0) {
    mailOptions.bcc = options.bcc.join(', ');
  }
  if (options.text) {
    mailOptions.text = options.text;
  }
  if (options.html) {
    mailOptions.html = options.html;
  }

  // Threading headers
  const headers: Record<string, string> = {};
  if (options.inReplyTo) {
    headers['In-Reply-To'] = options.inReplyTo;
  }
  if (options.references) {
    headers['References'] = options.references;
  }
  if (Object.keys(headers).length > 0) {
    mailOptions.headers = headers;
  }

  // Attachments
  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    }));
  }

  const composer = new MailComposer(mailOptions);

  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(message);
      }
    });
  });
}
