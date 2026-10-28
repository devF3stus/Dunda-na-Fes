/**
 * Custom error class for predictable, human-readable API errors.
 * Every API failure throws an AppError so our errorHandler middleware
 * can send a clean JSON response without exposing raw stack traces.
 */
class AppError extends Error {
  constructor(code, userMessage, statusCode = 400, technicalDetails = '') {
    super(technicalDetails || userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
  }
}

module.exports = { AppError };
