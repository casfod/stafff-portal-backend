const { promisify } = require("util");
const catchAsync = require("../utils/catchAsync");
const jwt = require("jsonwebtoken");

const User = require("../models/UserModel.js");
const handleResponse = require("./handleResponse");

const protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and checking if it exists
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return handleResponse(
      res,
      401,
      "You are not logged in! Please log in to get access."
    );
  }

  // 2) Verifying the token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return handleResponse(
      res,
      401,
      "Token verification failed! Please log in agains."
    );
  }

  // 3) Checking if the S still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return handleResponse(res, 401, "User no longer exists");
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError("User recently changed password! Please log in again.", 401)
    );
  }
  // console.log(currentUser);

  // Granting access to the protected route
  req.User = currentUser;

  next();
});

module.exports = protect;
