// Central error middleware: guarantees the browser never sees a raw stack trace.
function errorHandler(err, req, res, next) {
  if (err && err.code === 'ENOSPC') {
    console.error(`[Error 507] ${req.method} ${req.originalUrl}: Disk full (ENOSPC)`);
    return res.status(507).json({
      error: {
        code: 'DISK_FULL',
        message:
          'Your disk is full (not enough free storage space to save audio files). Please free up disk space and try again.',
      },
    });
  }

  const statusCode = err.statusCode || 500;
  const userMessage =
    err.userMessage || 'An unexpected error occurred on the local server.';

  // Log the technical message locally for the developer console only
  console.error(`[Error ${statusCode}] ${req.method} ${req.originalUrl}:`, err.message);

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: userMessage,
    },
  });
}

module.exports = errorHandler;
