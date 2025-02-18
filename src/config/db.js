const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { seedSuperUser } = require("../services/authService");

dotenv.config({ path: "./config.env" });

const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

const connectDB = async () => {
  try {
    await mongoose
      .connect(DB, {})
      .then(() => console.log("DB connection successful!"));

    await seedSuperUser();
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
