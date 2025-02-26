import { EmailIngestionConfig, ConnectionType } from '@prisma/client'
import Imap from 'imap'
import { simpleParser, ParsedMail } from 'mailparser';
import { google } from 'googleapis'
import { Client } from '@microsoft/microsoft-graph-client'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import Poplib from 'poplib';



const prisma = new PrismaClient()
const PDF_STORAGE_PATH = process.env.PDF_STORAGE_PATH || './pdfs'

// Ensure PDF storage directory exists
if (!fs.existsSync(PDF_STORAGE_PATH)) {
  fs.mkdirSync(PDF_STORAGE_PATH, { recursive: true })
}



// 🟢 Function to Test IMAP Connection
async function testImapConnection(config: EmailIngestionConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.username!,
      password: config.password!,
      host: config.host!,
      port: config.port!,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },  
    });
    

    imap.once('ready', () => {
      imap.end();
      resolve(true);
    });

    imap.once('error', (err: Error) => {
      console.error('IMAP Connection Error:', err);
      reject(false);
    });

    imap.connect();
  });
}

// 🟢 Function to Sync IMAP Attachments
async function syncImapAttachments(config: EmailIngestionConfig): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.username!,
      password: config.password!,
      host: config.host!,
      port: config.port!,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },  // Ignore SSL certificate issues
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, async (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        imap.search(['SINCE', yesterday.toUTCString()], async (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          const processed: string[] = [];

          if (!results || results.length === 0) {
            console.log("📭 No new emails found.");
            imap.end();
            return resolve(processed);
          }

          console.log(`📩 Found ${results.length} new emails.`);

          const fetch = imap.fetch(results, { bodies: '', struct: true });

          fetch.on('message', (msg, seqno) => {
            msg.on('body', (stream) => {
              let mailData = '';

              stream.on('data', (chunk) => {
                mailData += chunk.toString('utf8');
              });

              stream.on('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(mailData);
                  console.log(`📨 Email #${seqno}: From ${parsed.from?.text}, Subject: ${parsed.subject}`);

                  if (parsed.attachments?.length) {
                    console.log(`📂 Found ${parsed.attachments.length} attachments in email #${seqno}.`);

                    for (const attachment of parsed.attachments) {
                      if (attachment.contentType === 'application/pdf') {
                        console.log(`✅ Saving PDF: ${attachment.filename}`);

                        const fileName = `${Date.now()}-${attachment.filename}`;
                        const filePath = path.join(PDF_STORAGE_PATH, fileName);

                        fs.writeFileSync(filePath, attachment.content);

                        await prisma.pDFAttachment.create({
                          data: {
                            configId: config.id,
                            fromAddress: parsed.from?.text || '',
                            dateReceived: parsed.date || new Date(),
                            subject: parsed.subject || '',
                            fileName: attachment.filename || '',
                            localPath: filePath,
                          },
                        });

                        processed.push(fileName);
                      }
                    }
                  } else {
                    console.log(`⚠️ No attachments found in email #${seqno}.`);
                  }
                } catch (parseErr) {
                  console.error('❌ Error parsing email:', parseErr);
                }
              });
            });
          });

          fetch.once('end', () => {
            imap.end();
            console.log(`✅ Processed ${processed.length} PDFs.`);
            resolve(processed);
          });
        });
      });``
    });

    imap.once('error', (err: Error) => {
      console.error('IMAP error:', err);
      reject(err);
    });

    imap.connect();
  });
}


// 🟢 Gmail API Functions
async function testGmailConnection(config: EmailIngestionConfig): Promise<boolean> {
  try {
    const auth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
    auth.setCredentials({ access_token: config.token });

    const gmail = google.gmail({ version: 'v1', auth });
    await gmail.users.getProfile({ userId: 'me' });

    return true;
  } catch (error) {
    return false;
  }
}

async function syncGmailAttachments(config: EmailIngestionConfig): Promise<string[]> {
  const auth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  auth.setCredentials({ access_token: config.token });

  const gmail = google.gmail({ version: 'v1', auth });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${Math.floor(yesterday.getTime() / 1000)} has:attachment`,
    });

    const processed: string[] = [];

    for (const message of response.data.messages || []) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });

      const attachments = msg.data.payload?.parts?.filter((part) => part.mimeType === 'application/pdf');

      for (const attachment of attachments || []) {
        if (attachment.body?.attachmentId) {
          const att = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: message.id!,
            id: attachment.body.attachmentId,
          });

          const fileName = `${Date.now()}-${attachment.filename}`;
          const filePath = path.join(PDF_STORAGE_PATH, fileName);

          fs.writeFileSync(filePath, Buffer.from(att.data.data!, 'base64'));

          await prisma.pDFAttachment.create({
            data: {
              configId: config.id,
              fromAddress: msg.data.payload?.headers?.find((h) => h.name === 'From')?.value || '',
              dateReceived: new Date(parseInt(msg.data.internalDate!)),
              subject: msg.data.payload?.headers?.find((h) => h.name === 'Subject')?.value || '',
              fileName: attachment.filename || '',
              localPath: filePath,
            },
          });

          processed.push(fileName);
        }
      }
    }

    return processed;
  } catch (error) {
    throw new Error(`Failed to sync Gmail attachments: ${error}`);
  }
}

// 🟢 Outlook API Functions
async function testOutlookConnection(config: EmailIngestionConfig): Promise<boolean> {
  try {
    const client = Client.init({
      authProvider: (done) => {
        done(null, config.token!);
      },
    });

    await client.api('/me').get();
    return true;
  } catch (error) {
    return false;
  }
}

async function syncOutlookAttachments(config: EmailIngestionConfig) {
  const client = Client.init({
    authProvider: (done) => {
      done(null, config.token!)
    }
  })

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  try {
    const response = await client.api('/me/messages')
      .filter(`receivedDateTime ge ${yesterday.toISOString()} and hasAttachments eq true`)
      .select('id,subject,from,receivedDateTime,attachments')
      .expand('attachments')
      .get()

    const processed: string[] = []; 

    for (const message of response.value) {
      const pdfAttachments = message.attachments.filter(
        (att: any) => att.contentType === 'application/pdf'
      )

      for (const attachment of pdfAttachments) {
        const fileName = `${Date.now()}-${attachment.name}`
        const filePath = path.join(PDF_STORAGE_PATH, fileName)

        // Get attachment content
        const content = await client.api(`/me/messages/${message.id}/attachments/${attachment.id}/$value`)
          .get()

        // Save attachment to file
        fs.writeFileSync(filePath, content)

        // Save metadata to database
        await prisma.pDFAttachment.create({
          data: {
            configId: config.id,
            fromAddress: message.from.emailAddress.address,
            dateReceived: new Date(message.receivedDateTime),
            subject: message.subject,
            fileName: attachment.name,
            localPath: filePath
          }
        })

        processed.push(fileName)
      }
    }

    return processed
  } catch (error) {
    throw new Error(`Failed to sync Outlook attachments: ${error}`)
  }
}

// 🟢 POP3 Functions
import MailPop3 from 'mailpop3';

async function connectToPop3(config: EmailIngestionConfig) {
  if (!config.host || typeof config.host !== 'string') {
    throw new Error(`❌ Invalid POP3 host for ${config.emailAddress}: ${config.host}`);
  }

  return new Promise<void>((resolve, reject) => {
    const client = new MailPop3({
      user: config.username ?? '',
      password: config.password ?? '',
      host: config.host,
      port: config.port ?? 110, // Default POP3 port
      tls: true,
    });

    client.connect((err) => {
      if (err) {
        console.error(`❌ POP3 error for ${config.emailAddress}:`, err);
        reject(err);
      } else {
        console.log(`✅ Connected to POP3: ${config.emailAddress}`);
        resolve();
      }
    });
  });
}

async function testPop3Connection(config: EmailIngestionConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.log(`📩 Testing POP3 connection for ${config.emailAddress}...`);

    const client = new Poplib(config.port!, config.host!, {
      user: config.username!,
      password: config.password!,
      tls: true,
      debug: false, // Set to true if you want more detailed logs
    });

    client.on('connect', () => {
      console.log(`✅ POP3 authentication successful for ${config.emailAddress}`);
      client.quit();
      resolve(true);
    });

    client.on('error', (error) => {
      console.error(`❌ POP3 authentication failed:`, error);
      reject(false);
    });

    client.connect();
  });
}

async function syncPop3Attachments(config: EmailIngestionConfig): Promise<string[]> {
  return new Promise((resolve, reject) => {
    console.log(`📩 Connecting to POP3 for ${config.emailAddress}...`);

    const client = new Poplib(config.port!, config.host!, {
      user: config.username!,
      password: config.password!,
      tls: true,
      debug: false, // Set to true for detailed logs
    });

    const processed: string[] = [];

    client.on('connect', async () => {
      console.log(`✅ Connected to POP3 for ${config.emailAddress}`);

      // ✅ Get the total number of emails
      client.list((err, messageList) => {
        if (err) {
          console.error(`❌ POP3 error while listing messages:`, err);
          client.quit();
          return reject(err);
        }

        const messageCount = messageList.length;
        console.log(`📨 Found ${messageCount} emails.`);

        if (messageCount === 0) {
          console.log(`📭 No new emails to process.`);
          client.quit();
          return resolve(processed);
        }

        // ✅ Fetch last 5 emails (or all if fewer)
        const messagesToFetch = messageList.slice(-5);

        let processedCount = 0;

        messagesToFetch.forEach((message, index) => {
          client.retr(message.number, async (err, emailData) => {
            if (err) {
              console.error(`❌ Error retrieving email #${message.number}:`, err);
            } else {
              try {
                const parsed = await simpleParser(emailData);
                console.log(`📨 Email #${message.number}: From ${parsed.from?.text}, Subject: ${parsed.subject}`);

                if (parsed.attachments?.length) {
                  console.log(`📂 Found ${parsed.attachments.length} attachments in email #${message.number}.`);

                  for (const attachment of parsed.attachments) {
                    if (attachment.contentType === 'application/pdf') {
                      console.log(`✅ Saving PDF: ${attachment.filename}`);

                      const fileName = `${Date.now()}-${attachment.filename}`;
                      const filePath = path.join(PDF_STORAGE_PATH, fileName);

                      fs.writeFileSync(filePath, attachment.content);

                      await prisma.pDFAttachment.create({
                        data: {
                          configId: config.id,
                          fromAddress: parsed.from?.text || '',
                          dateReceived: parsed.date || new Date(),
                          subject: parsed.subject || '',
                          fileName: attachment.filename || '',
                          localPath: filePath,
                        },
                      });

                      processed.push(fileName);
                    }
                  }
                } else {
                  console.log(`⚠️ No attachments found in email #${message.number}.`);
                }
              } catch (parseErr) {
                console.error(`❌ Error parsing email #${message.number}:`, parseErr);
              }
            }

            processedCount++;

            if (processedCount === messagesToFetch.length) {
              console.log(`✅ Processed ${processed.length} PDFs for ${config.emailAddress}`);
              client.quit();
              resolve(processed);
            }
          });
        });
      });
    });

    client.on('error', (error) => {
      console.error(`❌ POP3 error:`, error);
      reject(error);
    });

    client.connect();
  });
}

async function testEmailConnection(config: EmailIngestionConfig): Promise<boolean> {
  try {
    switch (config.connectionType) {
      case 'IMAP':
        return await testImapConnection(config);
      case 'GMAIL_API':
        return await testGmailConnection(config);
      case 'OUTLOOK_API':
        return await testOutlookConnection(config);
      case 'POP3':
        return await testPop3Connection(config);
      default:
        throw new Error('Unsupported email connection type.');
    }
  } catch (error) {
    console.error('Error testing email connection:', error);
    return false;
  }
}


async function syncEmailAttachments(config: EmailIngestionConfig): Promise<string[]> {
  try {
    console.log(`🔍 Email Connection Type: ${config.connectionType}`);

    switch (config.connectionType) {
      case 'IMAP':
        return await syncImapAttachments(config);
      case 'GMAIL_API':
        return await syncGmailAttachments(config);
      case 'OUTLOOK_API':
        return await syncOutlookAttachments(config);
      case 'POP3':
        return await syncPop3Attachments(config);  // ✅ Added POP3 support
      default:
        console.error(`❌ Unsupported email connection type: ${config.connectionType}`);
        return []; // Avoid crashing
    }
  } catch (error) {
    console.error(`❌ Error syncing email attachments for ${config.emailAddress}:`, error);
    return [];
  }
}

export {
  testEmailConnection,
  syncEmailAttachments,
  testImapConnection,
  testGmailConnection,
  testOutlookConnection,
  testPop3Connection,  // ✅ Added export for POP3 testing
  syncImapAttachments,
  syncGmailAttachments,
  syncOutlookAttachments,
  syncPop3Attachments  // ✅ Added export for POP3 sync
}