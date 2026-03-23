import type { EmailProvider, EmailProviderType, SyncResult, EmailDraft, SendResult, MessageMods } from './email-provider';
import type { AIContext } from '../../utils/database-context';

export class ResendProvider implements EmailProvider {
  readonly type: EmailProviderType = 'resend';

  async syncFull(_accountId: string, _context: AIContext): Promise<SyncResult> {
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async syncIncremental(_accountId: string, _context: AIContext): Promise<SyncResult> {
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async fetchMessageBody(_accountId: string, _providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    throw new Error('Resend does not support body fetch');
  }
  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    throw new Error('Resend send — use existing resend.ts service');
  }
  async modifyMessage(_accountId: string, _providerMessageId: string, _mods: MessageMods): Promise<void> {
    throw new Error('Resend does not support message modification');
  }
}
