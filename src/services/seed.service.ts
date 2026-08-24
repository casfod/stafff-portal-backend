import { User } from "../models";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export const seedSuperUser = async (): Promise<void> => {
  // Skip seeding if not enabled
  if (!env.SEED_SUPER_ADMIN) {
    logger.info("ℹ️ Super admin seeding is disabled");
    return;
  }

  try {
    // Check if a SUPER-ADMIN user already exists
    const existingSuperUser = await User.findOne({ 
      role: env.SUPER_ADMIN_ROLE 
    });

    if (!existingSuperUser) {
      await User.create({
        firstName: env.SUPER_ADMIN_FIRST_NAME,
        lastName: env.SUPER_ADMIN_LAST_NAME,
        email: env.SUPER_ADMIN_EMAIL,
        role: env.SUPER_ADMIN_ROLE,
        password: env.SUPER_ADMIN_PASSWORD,
        // passwordConfirm: env.SUPER_ADMIN_PASSWORD,
        isActive: true,
      });
      
      logger.info(`✅ Super admin seeded successfully: ${env.SUPER_ADMIN_EMAIL}`);
    } else {
      logger.info(`ℹ️ Super admin already exists: ${existingSuperUser.email}`);
    }
  } catch (error) {
    logger.error("❌ Failed to seed super admin:", error);
    // Don't throw - we don't want to crash the app if seeding fails
  }
};

// Export a combined seeding function if you have multiple seeders
export const runAllSeeders = async (): Promise<void> => {
  await seedSuperUser();
  // Add other seeders here as needed
  // await seedRoomTypes();
  // await seedAmenities();
  // etc.
};