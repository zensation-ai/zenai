import { buildMimeMessage } from '../../../../services/email/mime-builder';

describe('MimeBuilder', () => {
  describe('buildMimeMessage', () => {
    it('should build a plain text email', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        text: 'Hello plain text',
      });

      expect(raw).toBeInstanceOf(Buffer);
      const mimeStr = raw.toString();
      expect(mimeStr).toContain('From: sender@gmail.com');
      expect(mimeStr).toContain('To: recipient@example.com');
      expect(mimeStr).toContain('Subject: Test Subject');
    });

    it('should build an HTML email with text fallback', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'HTML Test',
        text: 'Fallback text',
        html: '<p>Hello <b>HTML</b></p>',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('multipart/alternative');
      expect(mimeStr).toContain('text/plain');
      expect(mimeStr).toContain('text/html');
    });

    it('should include attachments as multipart/mixed', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'With Attachment',
        text: 'See attached',
        attachments: [{
          filename: 'test.txt',
          content: Buffer.from('file content'),
          contentType: 'text/plain',
        }],
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('test.txt');
      expect(mimeStr).toContain('multipart/mixed');
    });

    it('should include In-Reply-To and References headers for threading', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Re: Original',
        text: 'My reply',
        inReplyTo: '<original-msg-id@example.com>',
        references: '<original-msg-id@example.com>',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('In-Reply-To: <original-msg-id@example.com>');
      expect(mimeStr).toContain('References: <original-msg-id@example.com>');
    });

    it('should handle unicode subjects', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Ünïcödé Sübjéct 日本語',
        text: 'Body',
      });

      expect(raw).toBeInstanceOf(Buffer);
      expect(raw.length).toBeGreaterThan(0);
    });

    it('should handle multiple recipients in to, cc, bcc', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['a@example.com', 'b@example.com'],
        cc: ['c@example.com'],
        bcc: ['d@example.com'],
        subject: 'Multi-recipient',
        text: 'Hello all',
      });

      const mimeStr = raw.toString();
      expect(mimeStr).toContain('a@example.com');
      expect(mimeStr).toContain('b@example.com');
      expect(mimeStr).toContain('c@example.com');
      // BCC should NOT appear in headers
      expect(mimeStr).not.toContain('d@example.com');
    });

    it('should handle empty body gracefully', async () => {
      const raw = await buildMimeMessage({
        from: 'sender@gmail.com',
        to: ['recipient@example.com'],
        subject: 'Empty body',
      });

      expect(raw).toBeInstanceOf(Buffer);
      expect(raw.length).toBeGreaterThan(0);
    });
  });
});
