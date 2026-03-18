export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiError = {
  success: false;
  error: string;
  code: string;
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function successResponse<T>(data: T, requestId?: string): ApiSuccess<T> {
  return { success: true, data, ...(requestId ? { requestId } : {}) };
}

export function errorResponse(error: string, code: string, requestId?: string): ApiError {
  return { success: false, error, code, ...(requestId ? { requestId } : {}) };
}
