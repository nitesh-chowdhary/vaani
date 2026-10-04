import type { ErrorRequestHandler } from 'express';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res
      .status(400)
      .json({ error: { code: 'invalid_json', message: 'Invalid JSON body.' } });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'payload_too_large',
        message: 'Request body is too large.',
      },
    });
    return;
  }
  // Deliberately never serialize errors, request bodies, headers, or credentials.
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred.',
    },
  });
};
