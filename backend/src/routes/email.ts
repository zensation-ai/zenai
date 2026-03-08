/**
 * Email Routes - Phase 38
 *
 * Context-aware email API: /api/:context/emails/*
 * Supports CRUD, sending, replying, forwarding, starring, batch actions,
 * account management, labels, and AI features.
 */

import { Router } from 'express';
import {
  getEmails, getEmail, getThread, createDraft, updateDraft,
  sendEmailById, sendNewEmail, replyToEmail, forwardEmail,
  updateEmailStatus, markAsRead, toggleStar, batchUpdateStatus,
  moveToTrash, getEmailStats,
  getAccounts, getAccount, createAccount, createImapAccount, updateAccount, deleteAccount,
  getLabels, createLabel, updateLabel, deleteLabel,
  EmailStatus, EmailDirection,
} from '../services/email';
import { testImapConnection, syncAccount, ImapAccount } from '../services/imap-sync';
import { encrypt } from '../utils/encryption';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { logger } from '../utils/logger';

export const emailRouter = Router();

const VALID_STATUSES: EmailStatus[] = ['received', 'read', 'draft', 'sending', 'sent', 'failed', 'archived', 'trash'];
const VALID_FOLDERS = ['inbox', 'sent', 'drafts', 'archived', 'trash', 'starred'];

// ============================================================
// GET /api/:context/emails/stats
// ============================================================

emailRouter.get('/:context/emails/stats', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const stats = await getEmailStats(context);

  res.json({ success: true, data: stats });
}));

// ============================================================
// GET /api/:context/emails/accounts
// ============================================================

emailRouter.get('/:context/emails/accounts', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const accounts = await getAccounts(context);

  res.json({ success: true, data: accounts, count: accounts.length });
}));

// ============================================================
// POST /api/:context/emails/accounts
// ============================================================

emailRouter.post('/:context/emails/accounts', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { email_address, display_name, domain, is_default, signature_html, signature_text } = req.body;

  if (!email_address || !domain) {
    throw new ValidationError('email_address and domain are required');
  }

  const account = await createAccount(context, { email_address, display_name, domain, is_default, signature_html, signature_text });

  res.status(201).json({ success: true, data: account });
}));

// ============================================================
// PUT /api/:context/emails/accounts/:id
// ============================================================

emailRouter.put('/:context/emails/accounts/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid account ID');

  const updated = await updateAccount(context, id, req.body);
  if (!updated) throw new NotFoundError('Email account');

  res.json({ success: true, data: updated });
}));

// ============================================================
// DELETE /api/:context/emails/accounts/:id
// ============================================================

emailRouter.delete('/:context/emails/accounts/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid account ID');

  await deleteAccount(context, id);
  res.json({ success: true, message: 'Account deleted' });
}));

// ============================================================
// GET /api/:context/emails/labels
// ============================================================

emailRouter.get('/:context/emails/labels', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const labels = await getLabels(context);

  res.json({ success: true, data: labels, count: labels.length });
}));

// ============================================================
// POST /api/:context/emails/labels
// ============================================================

emailRouter.post('/:context/emails/labels', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { name, color, icon } = req.body;

  if (!name) throw new ValidationError('Label name is required');

  const label = await createLabel(context, { name, color, icon });
  res.status(201).json({ success: true, data: label });
}));

// ============================================================
// PUT /api/:context/emails/labels/:id
// ============================================================

emailRouter.put('/:context/emails/labels/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid label ID');

  const updated = await updateLabel(context, id, req.body);
  if (!updated) throw new NotFoundError('Label');

  res.json({ success: true, data: updated });
}));

// ============================================================
// DELETE /api/:context/emails/labels/:id
// ============================================================

emailRouter.delete('/:context/emails/labels/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid label ID');

  await deleteLabel(context, id);
  res.json({ success: true, message: 'Label deleted' });
}));

// ============================================================
// POST /api/:context/emails/send  (compose & send new email)
// ============================================================

emailRouter.post('/:context/emails/send', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, account_id } = req.body;

  if (!to_addresses || !Array.isArray(to_addresses) || to_addresses.length === 0) {
    throw new ValidationError('At least one recipient is required');
  }

  const email = await sendNewEmail(context, { to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, account_id });

  res.status(201).json({ success: true, data: email });
}));

// ============================================================
// POST /api/:context/emails/batch  (bulk status update)
// ============================================================

emailRouter.post('/:context/emails/batch', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { ids, status } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('ids must be a non-empty array');
  }
  if (ids.length > 100) {
    throw new ValidationError('Batch operations are limited to 100 items at a time');
  }
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  for (const id of ids) {
    if (!isValidUUID(id)) throw new ValidationError('All ids must be valid UUIDs');
  }

  const count = await batchUpdateStatus(context, ids, status);
  res.json({ success: true, message: `${count} emails updated`, count });
}));

// ============================================================
// GET /api/:context/emails  (list)
// ============================================================

emailRouter.get('/:context/emails', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const folder = req.query.folder as string | undefined;
  if (folder && !VALID_FOLDERS.includes(folder)) {
    throw new ValidationError(`folder must be one of: ${VALID_FOLDERS.join(', ')}`);
  }

  const filters = {
    folder,
    status: req.query.status as EmailStatus | undefined,
    direction: req.query.direction as EmailDirection | undefined,
    category: req.query.category as string | undefined,
    account_id: req.query.account_id as string | undefined,
    is_starred: req.query.is_starred === 'true' ? true : req.query.is_starred === 'false' ? false : undefined,
    search: req.query.search as string | undefined,
    from: req.query.from as string | undefined,
    thread_id: req.query.thread_id as string | undefined,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 50, 200),
    offset: parseInt(req.query.offset as string, 10) || 0,
  };

  const { emails, total } = await getEmails(context, filters);

  res.json({ success: true, data: emails, total, count: emails.length });
}));

// ============================================================
// GET /api/:context/emails/:id  (get single email, auto-mark read)
// ============================================================

emailRouter.get('/:context/emails/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  let email = await getEmail(context, id);
  if (!email) throw new NotFoundError('Email');

  // Auto-mark as read
  if (email.status === 'received') {
    const updated = await markAsRead(context, id);
    if (updated) email = updated;
  }

  res.json({ success: true, data: email });
}));

// ============================================================
// GET /api/:context/emails/:id/thread
// ============================================================

emailRouter.get('/:context/emails/:id/thread', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const email = await getEmail(context, id);
  if (!email) throw new NotFoundError('Email');

  const thread = await getThread(context, email.thread_id || id);

  res.json({ success: true, data: thread, count: thread.length });
}));

// ============================================================
// POST /api/:context/emails  (create draft)
// ============================================================

emailRouter.post('/:context/emails', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, account_id, reply_to_id, labels } = req.body;

  if (!to_addresses || !Array.isArray(to_addresses) || to_addresses.length === 0) {
    throw new ValidationError('At least one recipient is required');
  }

  const draft = await createDraft(context, { to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, account_id, reply_to_id, labels });

  res.status(201).json({ success: true, data: draft });
}));

// ============================================================
// PUT /api/:context/emails/:id  (update draft)
// ============================================================

emailRouter.put('/:context/emails/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const updated = await updateDraft(context, id, req.body);
  if (!updated) throw new NotFoundError('Draft');

  res.json({ success: true, data: updated });
}));

// ============================================================
// POST /api/:context/emails/:id/send  (send draft)
// ============================================================

emailRouter.post('/:context/emails/:id/send', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const sent = await sendEmailById(context, id);
  if (!sent) throw new NotFoundError('Email');

  res.json({ success: true, data: sent });
}));

// ============================================================
// POST /api/:context/emails/:id/reply
// ============================================================

emailRouter.post('/:context/emails/:id/reply', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const { body_html, body_text, cc, account_id } = req.body;

  const reply = await replyToEmail(context, id, { html: body_html, text: body_text }, { cc, account_id });

  res.status(201).json({ success: true, data: reply });
}));

// ============================================================
// POST /api/:context/emails/:id/forward
// ============================================================

emailRouter.post('/:context/emails/:id/forward', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const { to_addresses, body_html, body_text, account_id } = req.body;

  if (!to_addresses || !Array.isArray(to_addresses) || to_addresses.length === 0) {
    throw new ValidationError('At least one recipient is required for forwarding');
  }

  const forwarded = await forwardEmail(context, id, to_addresses, { html: body_html, text: body_text }, { account_id });

  res.status(201).json({ success: true, data: forwarded });
}));

// ============================================================
// PATCH /api/:context/emails/:id/status
// ============================================================

emailRouter.patch('/:context/emails/:id/status', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const updated = await updateEmailStatus(context, id, status);
  if (!updated) throw new NotFoundError('Email');

  res.json({ success: true, data: updated });
}));

// ============================================================
// PATCH /api/:context/emails/:id/star
// ============================================================

emailRouter.patch('/:context/emails/:id/star', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const updated = await toggleStar(context, id);
  if (!updated) throw new NotFoundError('Email');

  res.json({ success: true, data: updated });
}));

// ============================================================
// DELETE /api/:context/emails/:id  (move to trash)
// ============================================================

emailRouter.delete('/:context/emails/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const trashed = await moveToTrash(context, id);
  if (!trashed) throw new NotFoundError('Email');

  res.json({ success: true, data: trashed, message: 'Email moved to trash' });
}));

// ============================================================
// AI Endpoints (Phase 38.3)
// ============================================================

emailRouter.post('/:context/emails/:id/ai/process', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const email = await getEmail(context, id);
  if (!email) throw new NotFoundError('Email');

  try {
    const { processEmailWithAI } = await import('../services/email-ai');
    await processEmailWithAI(context, id);
    const updated = await getEmail(context, id);
    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('AI processing failed', err instanceof Error ? err : undefined, { emailId: id, operation: 'processEmailWithAI' });
    throw new ValidationError('AI processing failed. Please try again later.');
  }
}));

emailRouter.get('/:context/emails/:id/ai/reply-suggestions', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const email = await getEmail(context, id);
  if (!email) throw new NotFoundError('Email');

  // Return cached suggestions if available
  if (email.ai_reply_suggestions && email.ai_reply_suggestions.length > 0) {
    return res.json({ success: true, data: email.ai_reply_suggestions });
  }

  try {
    const { generateReplySuggestions } = await import('../services/email-ai');
    const suggestions = await generateReplySuggestions(context, id);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    logger.error('Reply suggestions failed', err instanceof Error ? err : undefined, { emailId: id, operation: 'generateReplySuggestions' });
    throw new ValidationError('Reply suggestions failed. Please try again later.');
  }
}));

emailRouter.get('/:context/emails/:id/thread/ai/summary', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid email ID');

  const email = await getEmail(context, id);
  if (!email) throw new NotFoundError('Email');

  try {
    const { summarizeThread } = await import('../services/email-ai');
    const summary = await summarizeThread(context, email.thread_id || id);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    logger.error('Thread summary failed', err instanceof Error ? err : undefined, { emailId: id, operation: 'summarizeThread' });
    throw new ValidationError('Thread summary failed. Please try again later.');
  }
}));

// ============================================================
// IMAP Sync Endpoints (Phase 39)
// ============================================================

emailRouter.post('/:context/emails/accounts/imap/test', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const { host, port, user, password, tls } = req.body;

  if (!host || !user || !password) {
    throw new ValidationError('host, user, and password are required');
  }

  try {
    const result = await testImapConnection(host, port || 993, user, password, tls !== false);
    res.json({ success: true, data: result });
  } catch (err) {
    const message = (err as Error).message || 'IMAP connection failed';
    res.status(400).json({ success: false, error: message });
  }
}));

emailRouter.post('/:context/emails/accounts/imap', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { email_address, display_name, imap_host, imap_port, imap_user, imap_password, imap_tls, sync_folder } = req.body;

  if (!email_address || !imap_host || !imap_user || !imap_password) {
    throw new ValidationError('email_address, imap_host, imap_user, and imap_password are required');
  }

  const domain = email_address.split('@')[1];
  if (!domain) throw new ValidationError('Invalid email address');

  // Encrypt the password before storing
  const encryptedPassword = encrypt(imap_password);

  const account = await createImapAccount(context, {
    email_address,
    display_name,
    domain,
    imap_host,
    imap_port: imap_port || 993,
    imap_user,
    imap_password_encrypted: encryptedPassword,
    imap_tls: imap_tls !== false,
    sync_folder: sync_folder || 'INBOX',
  });

  res.status(201).json({ success: true, data: account });
}));

emailRouter.post('/:context/emails/accounts/:id/sync', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) throw new ValidationError('Invalid account ID');

  const account = await getAccount(context, id);
  if (!account) throw new NotFoundError('Account');

  if (!account.imap_enabled || !account.imap_host) {
    throw new ValidationError('Account is not IMAP-enabled');
  }

  try {
    const result = await syncAccount(context, account as unknown as ImapAccount);
    res.json({ success: true, data: result });
  } catch (err) {
    const message = (err as Error).message || 'Sync failed';
    res.status(400).json({ success: false, error: message });
  }
}));
