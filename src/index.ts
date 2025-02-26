import { testEmailConnection, syncEmailAttachments } from './lib/email-services';

import { EmailIngestionConfig, ConnectionType } from '@prisma/client';

const testConfig: EmailIngestionConfig = {
  id: '1', // Should be a string
  emailAddress: 'test@example.com', // Required field
  username: process.env.IMAP_USERNAME || null,
  password: process.env.IMAP_PASSWORD || null,
  host: process.env.IMAP_HOST || "N/A", // Ensure host is always a string
  port: process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 995, // Default port
  token: process.env.GMAIL_ACCESS_TOKEN || null,
  connectionType: 'IMAP' as ConnectionType, // Explicitly cast type
  isActive: true, // Required field
  lastChecked: null, // Nullable field, so set to null initially
  errorMessage: null, // Nullable field, so set to null initially
  createdAt: new Date(), // Temporary value for testing
  updatedAt: new Date(), // Temporary value for testing
};



async function runTests() {
  console.log('Testing email connection...');
  const isConnected = await testEmailConnection(testConfig);
  console.log('Connection successful:', isConnected);

  if (isConnected) {
    console.log('Syncing email attachments...');
    const attachments = await syncEmailAttachments(testConfig);
    console.log('Downloaded Attachments:', attachments);
  }
}

runTests().catch(console.error);
