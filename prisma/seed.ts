import { PrismaClient, ConnectionType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️ Dropping existing data...');
  await prisma.pDFAttachment.deleteMany({});
  await prisma.emailIngestionConfig.deleteMany({});
  console.log('✅ Old data removed.');

  console.log('🌱 Seeding database...');

  // ✅ Step 1: Insert Multiple Configurations for the Same Email
  const emailConfigs = await prisma.emailIngestionConfig.createMany({
    data: [
      {
        emailAddress: 'adesarapriyal544@gmail.com',
        connectionType: ConnectionType.GMAIL_API,
        username: null,
        password: null,
        host: 'imap.gmail.com',
        port: 993,
        token: '1//04JNgHlbkiLNzCgYIARAAGAQSNwF-L9Ir8ARNjQy0OwfCbx4RGBX-Lg5E8u3G-g-mjh_3B4LI5gDBT9oKqSPoi7CUmIaei0EkjN4',
        isActive: true,
        lastChecked: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        emailAddress: 'adesarapriyal544@gmail.com',
        connectionType: ConnectionType.IMAP,
        username: 'adesarapriyal544',
        password: 'imap_secure_password',
        host: 'imap.gmail.com',
        port: 993,
        token: null,
        isActive: true,
        lastChecked: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        emailAddress: 'adesarapriyal544@gmail.com',
        connectionType: ConnectionType.POP3,
        username: 'adesarapriyal544',
        password: 'pop3_secure_password',
        host: 'pop.gmail.com',
        port: 995,
        token: null,
        isActive: true,
        lastChecked: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  console.log('✅ Email configurations added.');

  // ✅ Step 2: Fetch all inserted configurations
  const configs = await prisma.emailIngestionConfig.findMany({
    where: { emailAddress: 'adesarapriyal544@gmail.com' },
  });

  console.log(`🔍 Found ${configs.length} configurations for adesarapriyal544@gmail.com.`);

  if (configs.length !== 3) {
    throw new Error('❌ Error: Not all email configurations were inserted correctly.');
  }

  // ✅ Step 3: Insert PDF attachments for each configuration
  await prisma.pDFAttachment.createMany({
    data: configs.map((config, index) => ({
      configId: config.id,
      fromAddress: `sender${index + 1}@example.com`,
      dateReceived: new Date(),
      subject: `Test Email Subject ${index + 1}`,
      fileName: `test_file_${index + 1}.pdf`,
      localPath: `./pdfs/test_file_${index + 1}.pdf`,
      fileSize: 1024 * (index + 1),
      processed: false,
      processingError: null,
      createdAt: new Date(),
    })),
  });

  console.log('✅ PDF attachments added.');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
