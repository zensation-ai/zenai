import type { EmailProvider, EmailProviderType, SyncResult, EmailDraft, SendResult, MessageMods } from './email-provider';
import type { AIContext } from '../../utils/database-context';

export class ImapProvider implements EmailProvider {
  readonly type: EmailProviderType = 'imap';

  async syncFull(_accountId: string, _context: AIContext): Promise<SyncResult> {
    // IMAP sync handled by existing imap-sync.ts scheduler
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async syncIncremental(_accountId: string, _context: AIContext): Promise<SyncResult> {
    return { newMessages: 0, updatedMessages: 0, deletedMessages: 0, newCursor: null, errors: [] };
  }
  async fetchMessageBody(_accountId: string, _providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    throw new Error('IMAP messages are fetched with full body during sync');
  }
  async sendMessage(_accountId: string, _draft: EmailDraft): Promise<SendResult> {
    throw new Error('IMAP send not implemented — use Resend');
  }
  async modifyMessage(_accountId: string, _providerMessageId: string, _mods: MessageMods): Promise<void> {
    throw new Error('IMAP message modification not supported');
  }
}
