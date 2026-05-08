/**
 * Sprint 1.10 — Moderation Middleware Factory tests
 *
 * Locks in the contract that the 3 moderated routes (chat, email, social)
 * rely on:
 *   - allow → next() runs, no response written;
 *   - block → default handler returns HTTP 422 with appeal token;
 *   - extractContent returns undefined → next() runs, service never called;
 *   - onBlock override → default 422 path is skipped;
 *   - fail-open on service exception — next() still runs.
 *
 * Also smoke-tests `extractFromFields` for the first-non-empty-string rule.
 */

import type { Request, Response, NextFunction } from 'express';

const mockModerateContent = jest.fn();
jest.mock('../../../services/content-moderation', () => ({
  moderateContent: (...args: unknown[]) => mockModerateContent(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  createModerationMiddleware,
  extractFromFields,
} from '../../../middleware/moderation-factory';

function makeReqRes(body: Record<string, unknown> = {}): {
  req: Request;
  res: Response;
  jsonMock: jest.Mock;
  statusMock: jest.Mock;
  next: jest.Mock<NextFunction>;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const req = { body } as Request;
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  const next = jest.fn();
  return { req, res, jsonMock, statusMock, next };
}

describe('createModerationMiddleware', () => {
  beforeEach(() => {
    mockModerateContent.mockReset();
  });

  it('calls next() and never hits the service when extractContent returns undefined', async () => {
    const mw = createModerationMiddleware({
      domain: 'chat',
      extractContent: () => undefined,
    });
    const { req, res, next, statusMock } = makeReqRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockModerateContent).not.toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('calls next() on allow and annotates req.moderation', async () => {
    mockModerateContent.mockResolvedValueOnce({
      decision: 'allow',
      tier: 'regex',
      categories: [],
      score: 0,
      appealToken: null,
      decisionId: 'dec-1',
      reason: null,
    });

    const mw = createModerationMiddleware({
      domain: 'email',
      extractContent: () => 'hello world',
    });
    const { req, res, next, statusMock } = makeReqRes();

    await mw(req, res, next);

    expect(mockModerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello world', surface: 'email' }),
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
    expect(req.moderation).toEqual(
      expect.objectContaining({ decision: 'allow', decisionId: 'dec-1' }),
    );
  });

  it('blocks with HTTP 422 + appeal endpoint by default', async () => {
    mockModerateContent.mockResolvedValueOnce({
      decision: 'block',
      tier: 'regex',
      categories: ['ldnoobw'],
      score: 1,
      appealToken: 'tok_abc',
      decisionId: 'dec-2',
      reason: 'LDNOOBW block',
    });

    const mw = createModerationMiddleware({
      domain: 'social',
      extractContent: () => 'kill yourself',
    });
    const { req, res, next, statusMock, jsonMock } = makeReqRes();

    await mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(422);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'CONTENT_BLOCKED',
        details: expect.objectContaining({
          appeal_token: 'tok_abc',
          appeal_endpoint: '/api/moderation/appeals/tok_abc',
          categories: ['ldnoobw'],
          tier: 'regex',
        }),
      }),
    );
  });

  it('invokes onBlock instead of the default 422 when provided', async () => {
    mockModerateContent.mockResolvedValueOnce({
      decision: 'block',
      tier: 'openai',
      categories: ['hate'],
      score: 0.9,
      appealToken: 'tok_custom',
      decisionId: 'dec-3',
      reason: 'AI flagged',
    });

    const onBlock = jest.fn((_req, res, _result) => {
      (res as Response).status(403).json({ custom: true });
    });
    const mw = createModerationMiddleware({
      domain: 'chat',
      extractContent: () => 'bad content',
      onBlock,
    });
    const { req, res, next, statusMock, jsonMock } = makeReqRes();

    await mw(req, res, next);

    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({ custom: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('fails open if moderateContent throws', async () => {
    mockModerateContent.mockRejectedValueOnce(new Error('openai down'));

    const mw = createModerationMiddleware({
      domain: 'chat',
      extractContent: () => 'whatever',
    });
    const { req, res, next, statusMock } = makeReqRes();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('forwards jwtUser.id as the audit user when present', async () => {
    mockModerateContent.mockResolvedValueOnce({
      decision: 'allow',
      tier: 'regex',
      categories: [],
      score: 0,
      appealToken: null,
      decisionId: 'dec-4',
      reason: null,
    });
    const mw = createModerationMiddleware({
      domain: 'chat',
      extractContent: () => 'ok content',
    });
    const { req, res, next } = makeReqRes();
    (req as Request & { jwtUser?: { id: string } }).jwtUser = { id: 'user-42' };

    await mw(req, res, next);

    expect(mockModerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-42' }),
    );
  });
});

describe('extractFromFields', () => {
  it('returns the first non-empty string by priority', () => {
    const extract = extractFromFields(['subject', 'body_text', 'body']);
    const req = {
      body: { subject: '   ', body_text: 'real content', body: 'fallback' },
    } as Request;
    expect(extract(req)).toBe('real content');
  });

  it('ignores non-string values', () => {
    const extract = extractFromFields(['content']);
    const req = { body: { content: { nested: 'not-a-string' } } } as Request;
    expect(extract(req)).toBeUndefined();
  });

  it('walks dot-notation paths', () => {
    const extract = extractFromFields(['message.text']);
    const req = { body: { message: { text: 'hello' } } } as Request;
    expect(extract(req)).toBe('hello');
  });

  it('returns undefined when no field matches', () => {
    const extract = extractFromFields(['message', 'content']);
    const req = { body: {} } as Request;
    expect(extract(req)).toBeUndefined();
  });
});
