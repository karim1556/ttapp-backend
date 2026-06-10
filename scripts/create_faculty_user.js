const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('=== Link Faculty and User Accounts ===');

  const facultyId = 40;
  const facultyEmail = 'manisha@ttapp.com';
  const facultyPassword = 'teacher123';

  // 1. Check/Create Faculty User
  let facultyUser = await prisma.user.findFirst({
    where: { email: facultyEmail }
  });

  if (!facultyUser) {
    console.log(`Creating user for ${facultyEmail}...`);
    const hashedPassword = await bcrypt.hash(facultyPassword, 10);
    facultyUser = await prisma.user.create({
      data: {
        email: facultyEmail,
        password: hashedPassword,
        user_type: 2 // Faculty
      }
    });
    console.log(`Created user with uid: ${facultyUser.uid}`);
  } else {
    console.log(`User ${facultyEmail} already exists with uid: ${facultyUser.uid}`);
  }

  // 2. Link Faculty table row 40
  const faculty = await prisma.faculty.findUnique({
    where: { faculty_id: facultyId }
  });

  if (!faculty) {
    console.error(`Faculty with ID ${facultyId} not found in database! Make sure you seeded the DB.`);
  } else {
    console.log(`Found faculty: ${faculty.name}. Current uid: ${faculty.uid}, email: ${faculty.email}`);
    await prisma.faculty.update({
      where: { faculty_id: facultyId },
      data: {
        uid: facultyUser.uid,
        email: facultyEmail
      }
    });
    console.log(`Linked faculty ID ${facultyId} (${faculty.name}) to User uid ${facultyUser.uid}`);
  }

  // 3. Ensure Admin User exists for testing
  const adminEmail = 'admin@ttapp.com';
  const adminPassword = 'admin123';
  let adminUser = await prisma.user.findFirst({
    where: { email: adminEmail }
  });

  if (!adminUser) {
    console.log(`Creating admin user ${adminEmail}...`);
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedAdminPassword,
        user_type: 1 // Admin
      }
    });
    console.log(`Created admin user with uid: ${adminUser.uid}`);
  } else {
    console.log(`Admin user ${adminEmail} already exists with uid: ${adminUser.uid}`);
  }

  console.log('=== Done ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
