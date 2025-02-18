const { promisify } = require("util");
const handleResponse = require("./handleResponse");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const userByToken = async (req, res) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return handleResponse(res, 401, "Invalid Token");
  }

  // 2) Verifying the token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return handleResponse(res, 401, "Token verification failed");
  }

  // 3) Checking if the user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return handleResponse(res, 401, "User no longer exists");
  }

  return currentUser;
};

module.exports = userByToken;
