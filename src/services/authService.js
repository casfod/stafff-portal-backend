const crypto = require("crypto");
const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");
const AppError = require("../utils/appError");
const Email = require("../utils/sendMail");
const createSendToken = require("../utils/createSendToken");

exports.signupUser = async (userData) => {
  const newUser = await User.create(userData);
  // const url = `${userData.protocol}://${userData.host}/me`;
  // await new Email(newUser, url).sendWelcome();
  return newUser;
};

exports.loginUser = async (email, password) => {
  if (!email || !password) {
    throw new AppError("Please provide email and password!", 400);
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.correctPassword(password, user.password))) {
    throw new AppError("Incorrect email or password", 401);
  }

  return user;
};

exports.protectRoute = async (token) => {
  if (!token) {
    throw new AppError(
      "You are not logged in! Please log in to get access.",
      401
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);

  if (!user) {
    throw new AppError(
      "The user belonging to this token no longer exists.",
      401
    );
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    throw new AppError(
      "User recently changed password! Please log in again.",
      401
    );
  }

  return user;
};

exports.checkUserRole = (user, roles) => {
  if (!roles.includes(user.role)) {
    throw new AppError(
      "You do not have permission to perform this action",
      403
    );
  }
};

exports.forgotPassword = async (email, protocol, host) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("There is no user with this email address.", 404);
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${protocol}://${host}/api/v1/users/resetPassword/${resetToken}`;
  await new Email(user, resetURL).sendPasswordReset();

  return resetToken;
};

exports.resetPassword = async (token, newPassword, confirmPassword) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Token is invalid or has expired", 400);
  }

  user.password = newPassword;
  user.passwordConfirm = confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return user;
};

exports.updatePassword = async (
  userId,
  currentPassword,
  newPassword,
  confirmPassword
) => {
  const user = await User.findById(userId).select("+password");

  if (!(await user.correctPassword(currentPassword, user.password))) {
    throw new AppError("Your current password is wrong.", 401);
  }

  user.password = newPassword;
  user.passwordConfirm = confirmPassword;
  await user.save();

  return user;
};
