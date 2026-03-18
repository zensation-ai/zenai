import { successResponse, errorResponse } from '../../../types/api-response';

describe('ApiResponse helpers', () => {
  test('successResponse wraps data correctly', () => {
    const result = successResponse({ name: 'test' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });
  test('errorResponse includes code', () => {
    const result = errorResponse('Not found', 'NOT_FOUND');
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });
  test('successResponse with requestId', () => {
    const result = successResponse('data', 'req-123');
    expect(result.requestId).toBe('req-123');
  });
});
