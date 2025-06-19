const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function fixFlags() {
  try {
    // Update all activities to use proper flags
    const result = await prisma.activity.updateMany({
      data: { 
        isMock: false  // Set all activities to non-mock
      }
    });

    console.log(`Fixed mock flags for ${result.count} activities`);
  } catch (error) {
    console.error("Error fixing mock flags:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFlags();