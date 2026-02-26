const crypto = require("crypto");
const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");
const AppError = require("../utils/appError");
const sendMail = require("../utils/sendMail");
const catchAsync = require("../utils/catchAsync");
const generateResetToken = require("../utils/generateResetToken");

const SUPERVISOR_POPULATE = {
  path: "employmentInfo.jobDetails.supervisorId",
  select: "first_name last_name email position",
};

const seedSuperUserService = catchAsync(async (req, res, next) => {
  // Check if a SUPER-ADMIN user already exists
  const existingSuperUser = await User.findOne({ role: "SUPER-ADMIN" });

  if (!existingSuperUser) {
    await User.create({
      first_name: "Charles",
      last_name: "Yaya",
      email: "calebcharles343@gmail.com",
      role: "SUPER-ADMIN",
      password: "11111111",
      passwordConfirm: "11111111",
    });
  } else {
    // console.log("Super admin already exists");
  }
});

const addUserService = async (userData) => {
  const newUser = await User.create(userData);

  return newUser;
};

const loginUserService = async (email, password) => {
  if (!email || !password) {
    throw new AppError("Please provide email and password!", 400);
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.correctPassword(password, user.password))) {
    throw new AppError("Incorrect email or password", 401);
  }

  if (user.isDeleted) {
    throw new AppError("This account is no longer active", 401);
  }

  return user;
};

const protectRoute = async (token) => {
  if (!token) {
    throw new AppError(
      "You are not logged in! Please log in to get access.",
      401
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).populate(SUPERVISOR_POPULATE);

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

const sendResetEmail = async (user, resetToken, req) => {
  const resetURL = `${process.env.BASE_URL}/reset-password/${resetToken}`;

  await sendMail({
    userMail: user.email,
    resetURL,
  });
};

const forgotPasswordService = async (email, req) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(
      `There is no user registered with the email: ${email}`,
      404
    );
  }

  const { resetToken, hashedToken, resetExpires } = generateResetToken();
  await User.updateOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: resetExpires,
  });

  try {
    await sendResetEmail(user, resetToken, req);
  } catch (err) {
    await User.updateOne({
      passwordResetToken: null,
      passwordResetExpires: null,
    });
    throw new AppError(
      "There was an error sending the email. Please try again later.",
      500
    );
  }
};

const resetPasswordService = async (token, newPassword, confirmPassword) => {
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

const updatePasswordService = async (
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
  await user.populate(SUPERVISOR_POPULATE);

  return user;
};

module.exports = {
  seedSuperUserService,
  addUserService,
  loginUserService,
  resetPasswordService,
  forgotPasswordService,
  updatePasswordService,
};
