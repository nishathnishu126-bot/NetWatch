function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(error, req, res, next) {
  console.error(error);
  if (res.headersSent) return next(error);

  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    error: status === 500 ? 'An unexpected server error occurred.' : error.message,
  });
}

module.exports = { notFound, errorHandler };
