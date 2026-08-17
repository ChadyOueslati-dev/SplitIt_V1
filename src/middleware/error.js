function notFound(req, res, next) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(err);

  if (err.code === 11000) {
    return res.status(409).json({ error: 'That record already exists' });
  }

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on our side' : err.message
  });
}

/** Wraps async controllers so rejected promises reach the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { notFound, errorHandler, asyncHandler, httpError };
