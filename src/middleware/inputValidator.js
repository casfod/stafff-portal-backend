const Joi = require("joi");

const stationSchema = Joi.object({
  name: Joi.string()
    .min(3)
    // .regex(/^[A-Za-z\s]+$/) // Allows alphabetic characters and spaces
    .required()
    .messages({
      // "string.pattern.base":
      //   "Name must contain only alphabetic characters and spaces",
      "string.empty": "Name is required",
      "string.min": "Name should have at least 3 characters",
    }),
  email: Joi.string().email().required().messages({
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
  }),
  userName: Joi.string()
    .min(3)
    // .regex(/^[A-Za-z\s]+$/) // Allows alphabetic characters and spaces
    .required()
    .messages({
      // "string.pattern.base":
      //   "User Name must contain only alphabetic characters and spaces",
      "string.empty": "User Name is required",
      "string.min": "User Name should have at least 3 characters",
    }),
  station: Joi.string()
    .valid("63Kw-1446-2401", "63Oy-1446-2401")
    .required()
    .messages({
      "any.only": "Invalid station ID",
      "any.required": "Station is required",
    }),
  phone: Joi.string()
    .min(11)
    .regex(/^\d{11}$/) // Allows exactly 11 digits
    .required()
    .messages({
      "string.pattern.base": "Phone number must contain exactly 11 digits",
      "string.empty": "Phone number is required",
      "string.min": "Phone number should have exactly 11 digits",
    }),
  password: Joi.string().min(8).required().messages({
    "string.min": "Password should have at least 8 characters",
    "string.empty": "Password is required",
  }),
  passwordConfirm: Joi.any().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "any.required": "Confirm password is required",
  }),
});

exports.validateStation = (req, res, next) => {
  const { error } = stationSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      status: 400,
      message: error.details[0].message,
    });
  }

  next();
};
