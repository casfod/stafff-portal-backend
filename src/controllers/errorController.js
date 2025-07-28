const AppError = require("./../utils/appError");

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  // Extract the key-value pair from the error response
  const keyValue = err.errorResponse.keyValue;

  // Get the first key and its value from the keyValue object
  const key = Object.keys(keyValue)[0]; // e.g., "email"
  // const value = keyValue[key]; // e.g., "test@example.com"

  // Construct the error message dynamically
  const message = `This ${key} already exists`;

  // Return a new AppError with the custom message and status code
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("Invalid token. Please log in again!", 401);

const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please log in again.", 401);

const sendErrorDev = (err, req, res) => {
  // A) API
  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // B) RENDERED WEBSITE
  console.error("ERROR 💥", err);

  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  const showFullError = process.env.SHOW_FULL_ERRORS === "true"; // add this env var in .env for temporary debugging

  if (req.originalUrl.startsWith("/api")) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }

    console.error("ERROR 💥💥", err);

    // Show full error only if explicitly enabled
    if (showFullError) {
      return res.status(err.statusCode || 500).json({
        status: "error",
        message: err.message,
        error: err,
        stack: err.stack,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Something went wrong.",
    });
  }

  // For rendered websites
  if (err.isOperational) {
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      msg: err.message,
    });
  }

  console.error("ERROR 💥💥💥", err);

  return res.status(err.statusCode || 500).render("error", {
    title: "Something went wrong!",
    msg: showFullError ? err.message : "Please try again later.",
  });
};

module.exports = (err, req, res, next) => {
  // console.log(err.stack);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV.trim() === "production") {
    let error = { ...err };
    error.message = err.message;

    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
