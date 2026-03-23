import { getEmailProvider, EmailProviderType } from '../../../../services/email/email-provider';

describe('EmailProviderFactory', () => {
  describe('getEmailProvider', () => {
    it('should return GmailProvider for gmail type', () => {
      const provider = getEmailProvider('gmail');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('gmail');
    });

    it('should return ImapProvider for imap type', () => {
      const provider = getEmailProvider('imap');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('imap');
    });

    it('should return ResendProvider for resend type', () => {
      const provider = getEmailProvider('resend');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('resend');
    });

    it('should throw for unknown provider type', () => {
      expect(() => getEmailProvider('unknown' as EmailProviderType))
        .toThrow('Unknown email provider: unknown');
    });

    it('should return same instance on repeated calls (singleton)', () => {
      const p1 = getEmailProvider('imap');
      const p2 = getEmailProvider('imap');
      expect(p1).toBe(p2);
    });
  });
});
