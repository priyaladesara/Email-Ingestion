import { PrismaClient, ConnectionType, EmailIngestionConfig } from '@prisma/client';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import * as PopLib from 'poplib';

const prisma = new PrismaClient();

// Improved helper function for Gmail auth with better error handling
async function getAuthClient(config: EmailIngestionConfig) {
  if (!config.token) {
    throw new Error('❌ Refresh Token is missing in the database!');
  }
  
  // Check if environment variables are set
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    throw new Error('❌ Gmail API credentials missing in environment variables!');
  }

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  // Set refresh token
  auth.setCredentials({ 
    refresh_token: config.token 
  });

  try {
    // Get a new Access Token using the Refresh Token - with improved error handling
    const tokenResponse = await auth.getAccessToken();
    
    // Check if the response is valid and contains a token
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('❌ Failed to retrieve new Access Token!');
    }

    auth.setCredentials({ access_token: tokenResponse.token });
    return auth;
  } catch (error: unknown) {
    // Enhanced error handling with more details
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown authentication error';
    
    console.error('❌ Gmail authentication error:', error);
    
    // Check if the token might be expired or invalid
    if (error instanceof Error && 
        (error.message.includes('401') || error.toString().includes('status: 401'))) {
      console.error('❌ Token appears to be expired or invalid. User may need to reauthorize.');
      
      // Update the config to mark it as needing reauthorization
      try {
        await prisma.emailIngestionConfig.update({
          where: { id: config.id },
          data: { isActive: false, errorMessage: 'Auth token expired - requires reauthorization' }
        });
        console.log(`✅ Marked config ${config.id} as inactive due to expired token`);
      } catch (dbError) {
        console.error('❌ Failed to update config status:', dbError);
      }
    }
    
    throw new Error(`Gmail authentication failed: ${errorMessage}`);
  }
}

export class EmailIngestionService {
  private static instance: EmailIngestionService;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startChecking();
  }

  static getInstance(): EmailIngestionService {
    if (!EmailIngestionService.instance) {
      EmailIngestionService.instance = new EmailIngestionService();
    }
    return EmailIngestionService.instance;
  }

  private async startChecking() {
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(async () => {
      try {
        const configs = await prisma.emailIngestionConfig.findMany({
          where: { isActive: true },
        });

        console.log(`🔍 Found ${configs.length} active email configurations to check`);
        
        for (const config of configs) {
          try {
            await this.checkEmails(config);
          } catch (configError) {
            console.error(`❌ Error processing config ${config.id}:`, configError);
            
            // Update the config with the error
            try {
              await prisma.emailIngestionConfig.update({
                where: { id: config.id },
                data: { 
                  errorMessage: configError instanceof Error ? configError.message : String(configError),
                  lastChecked: new Date()
                }
              });
            } catch (dbError) {
              console.error('❌ Failed to update config with error:', dbError);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error in email checking interval:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Email checking service started');
  }

  // Utility function to save attachments
  private async saveAttachment(fileName: string, content: Buffer | string): Promise<[string, number]> {
    try {
      const pdfDirectory = path.join(process.cwd(), 'pdfs');
      
      // Sanitize filename
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const filePath = path.join(pdfDirectory, sanitizedFileName);

      await fs.mkdir(pdfDirectory, { recursive: true });
      
      // Convert string to buffer if needed
      const contentBuffer = typeof content === 'string' 
        ? Buffer.from(content, 'base64') 
        : content;
        
      await fs.writeFile(filePath, contentBuffer);
      
      // Get file size
      const fileSize = contentBuffer.length;

      console.log(`📄 Saved attachment: ${filePath} (${fileSize} bytes)`);
      return [filePath, fileSize];
    } catch (error) {
      console.error('❌ Error saving attachment:', error);
      throw error;
    }
  }

  // Changed to public so API can call it
  public async checkEmails(config: EmailIngestionConfig) {
    if (!config.isActive) {
      console.log(`⚠️ Skipping inactive config for ${config.emailAddress}`);
      return;
    }
    
    try {
      console.log(`🔍 Checking emails for ${config.emailAddress} via ${config.connectionType}...`);

      switch (config.connectionType) {
        case ConnectionType.IMAP:
          await this.checkImapEmails(config);
          break;
        case ConnectionType.GMAIL_API:  
          await this.checkGmailEmails(config);
          break;
        case ConnectionType.OUTLOOK_API:
          await this.checkOutlookEmails(config);
          break;
        case ConnectionType.POP3:
          await this.checkPop3Emails(config);
          break;
        default:
          console.warn(`⚠️ Unsupported connection type: ${config.connectionType}`);
      }
      
      // Update last checked timestamp
      await prisma.emailIngestionConfig.update({
        where: { id: config.id },
        data: { 
          lastChecked: new Date(),
          errorMessage: null
        }
      });
    } catch (error) {
      console.error(`❌ Error checking emails for ${config.emailAddress}:`, error);
      
      // Update config with error info
      try {
        await prisma.emailIngestionConfig.update({
          where: { id: config.id },
          data: { 
            errorMessage: error instanceof Error ? error.message : String(error),
            lastChecked: new Date()
          }
        });
      } catch (dbError) {
        console.error('❌ Failed to update config with error:', dbError);
      }
      
      throw error; // Re-throw to be handled by caller
    }
  }

  // IMAP Email Handling - MODIFIED to fix authentication & certificate errors
  private async checkImapEmails(config: EmailIngestionConfig) {
    // Check for required fields with explicit type validation
    if (!config.host || !config.username || !config.password) {
      throw new Error('❌ Missing IMAP connection details');
    }
    
    const imap = new Imap({
      user: config.username,         // TypeScript will accept this now with validation above
      password: config.password,     // TypeScript will accept this now with validation above
      host: config.host,            // TypeScript will accept this now with validation above
      port: config.port ?? 993,     // Default IMAP port
      tls: true,
      tlsOptions: { 
        rejectUnauthorized: false,  // Accept self-signed certificates
        secureProtocol: 'TLSv1_2_method'  // Specify TLS version for compatibility
      },
      authTimeout: 30000,           // Longer timeout for auth
      connTimeout: 30000            // Longer timeout for connection
    });

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        try {
          imap.end();
        } catch (err) {
          console.error('❌ Error closing IMAP connection:', err);
        }
      };
      
      imap.once('ready', async () => {
        try {
          await new Promise<void>((resolveOpen, rejectOpen) => {
            imap.openBox('INBOX', false, (err) => {
              if (err) rejectOpen(err);
              else resolveOpen();
            });
          });
          
          const search = promisify(imap.search.bind(imap));
          const results = await search(['UNSEEN']);
          
          console.log(`📨 Found ${results.length} unread emails for ${config.emailAddress}`);
          
          if (results.length === 0) {
            cleanup();
            resolve();
            return;
          }
          
          let processedCount = 0;
          const messagesToProcess = results.length;
          
          for (const msgId of results) {
            const fetch = imap.fetch(msgId, { bodies: '' });
            
            fetch.on('message', (msg) => {
              let buffer: Buffer[] = [];
              
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => buffer.push(chunk));
                
                stream.once('end', async () => {
                  try {
                    const parsed: ParsedMail = await simpleParser(Buffer.concat(buffer));
                    
                    // Mark as seen after processing
                    imap.addFlags(msgId, ['\\Seen'], (flagErr) => {
                      if (flagErr) console.error('❌ Error marking message as read:', flagErr);
                    });
                    
                    if (parsed.attachments && parsed.attachments.length > 0) {
                      for (const attachment of parsed.attachments) {
                        if (attachment.contentType === 'application/pdf' && attachment.content) {
                          const fileName = attachment.filename || `unnamed-${Date.now()}.pdf`;
                          const [filePath, fileSize] = await this.saveAttachment(fileName, attachment.content);
                          
                          await prisma.pDFAttachment.create({
                            data: {
                              configId: config.id,
                              fromAddress: parsed.from?.text ?? '',
                              dateReceived: parsed.date ?? new Date(),
                              subject: parsed.subject ?? '',
                              fileName,
                              localPath: filePath,
                              fileSize,
                              processed: false,
                              processingError: null
                            },
                          });
                          
                          console.log(`✅ Saved PDF: ${fileName} from ${parsed.from?.text}`);
                        }
                      }
                    }
                    
                    processedCount++;
                    if (processedCount >= messagesToProcess) {
                      cleanup();
                      resolve();
                    }
                  } catch (parseError) {
                    console.error('❌ Error parsing IMAP email:', parseError);
                    processedCount++;
                    if (processedCount >= messagesToProcess) {
                      cleanup();
                      resolve();
                    }
                  }
                });
              });
              
              msg.once('error', (err) => {
                console.error('❌ Error processing message:', err);
                processedCount++;
                if (processedCount >= messagesToProcess) {
                  cleanup();
                  resolve();
                }
              });
            });
            
            fetch.once('error', (err) => {
              console.error('❌ Error fetching message:', err);
              processedCount++;
              if (processedCount >= messagesToProcess) {
                cleanup();
                resolve();
              }
            });
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
      
      imap.once('error', (err) => {
        console.error('❌ IMAP connection error:', err);
        cleanup();
        reject(err);
      });
      
      imap.once('end', () => {
        console.log('📤 IMAP connection ended');
      });
      
      // Connect after setting up all event handlers
      imap.connect();
    });
  }

  // POP3 Email Handling - MODIFIED to fix certificate errors
  private async checkPop3Emails(config: EmailIngestionConfig) {
    // Check for required fields with explicit type validation
    if (!config.host || !config.username || !config.password) {
      throw new Error('❌ Missing POP3 connection details');
    }
    
    return new Promise<void>((resolve, reject) => {
      const port = config.port ?? 995; // Default POP3 SSL port
      
      // Modified POP3 client initialization with better SSL options
      const client = new PopLib(port, config.host, {
        tlserrs: false,     // Already set to ignore TLS errors
        enabletls: true,    // Use TLS
        debug: false,       // Set to true for troubleshooting
        ssl: true,          // Force SSL
        ignoretlserrs: true // Additional option to ignore TLS errors
      });
      
      // Some PopLib implementations support this additional SSL configuration
      // If your specific PopLib version supports it, you can uncomment this:
      // client.setTLSOptions({ rejectUnauthorized: false });
      
      client.on('error', (err) => {
        console.error('❌ POP3 connection error:', err);
        client.quit();
        reject(err);
      });
      
      client.on('connect', () => {
        console.log(`🔗 Connected to POP3 server for ${config.emailAddress}`);
        
        // Validate credentials are not null before login
        if (config.username && config.password) {
          client.login(config.username, config.password);
        } else {
          client.quit();
          reject(new Error('Username or password is missing for POP3 login'));
        }
      });
      
      client.on('login', (status, rawData) => {
        if (status) {
          console.log(`✅ POP3 login successful for ${config.emailAddress}`);
          client.list();
        } else {
          console.error('❌ POP3 login failed:', rawData);
          client.quit();
          reject(new Error(`POP3 login failed: ${rawData}`));
        }
      });
      
      client.on('list', (status, msgCount, msgList) => {
        if (status) {
          console.log(`📨 POP3: ${msgCount} messages found`);
          
          if (msgCount === 0) {
            client.quit();
            resolve();
            return;
          }
          
          // Track processed messages
          let processedCount = 0;
          const totalMessages = msgCount;
          
          // Process each message
          for (let i = 1; i <= msgCount; i++) {
            client.retr(i);
          }
        } else {
          console.error('❌ POP3 list command failed');
          client.quit();
          reject(new Error('POP3 list command failed'));
        }
      });
      
      client.on('retr', async (status, msgNumber, data) => {
        if (status) {
          try {
            // Parse the email
            const message = Buffer.from(data.join('\r\n'));
            const parsed = await simpleParser(message);
            
            // Process attachments
            if (parsed.attachments && parsed.attachments.length > 0) {
              for (const attachment of parsed.attachments) {
                if (attachment.contentType === 'application/pdf' && attachment.content) {
                  const fileName = attachment.filename || `pop3-${Date.now()}.pdf`;
                  const [filePath, fileSize] = await this.saveAttachment(fileName, attachment.content);
                  
                  await prisma.pDFAttachment.create({
                    data: {
                      configId: config.id,
                      fromAddress: parsed.from?.text ?? '',
                      dateReceived: parsed.date ?? new Date(),
                      subject: parsed.subject ?? '',
                      fileName,
                      localPath: filePath,
                      fileSize,
                      processed: false,
                      processingError: null
                    },
                  });
                  
                  console.log(`✅ POP3 PDF saved: ${fileName} from ${parsed.from?.text}`);
                }
              }
            }
            
            // Optionally delete the message
            // client.dele(msgNumber);
          } catch (parseError) {
            console.error(`❌ Error parsing POP3 email #${msgNumber}:`, parseError);
          }
        } else {
          console.error(`❌ Failed to retrieve message #${msgNumber}`);
        }
        
        // Check if we're done
        if (msgNumber === 1) {
          client.quit();
          resolve();
        }
      });
      
      client.on('quit', () => {
        console.log('📤 POP3 connection closed');
      });
    });
  }

  // Gmail API Email Handling
  private async checkGmailEmails(config: EmailIngestionConfig) {
    try {
      // Get Auth Client with refreshed Access Token
      const auth = await getAuthClient(config);
      const gmail = google.gmail({ version: 'v1', auth });
  
      // Fetch emails with attachments that are unread
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment is:unread',
        maxResults: 10 // Limit to avoid processing too many at once
      });
  
      if (!response.data.messages || response.data.messages.length === 0) {
        console.log("📭 No new emails with attachments for Gmail account.");
        return;
      }
  
      console.log(`📨 Found ${response.data.messages.length} unread Gmail messages with attachments`);
      
      for (const message of response.data.messages) {
        try {
          if (!message.id) continue;
          
          const messageDetails = await gmail.users.messages.get({
            userId: 'me',
            id: message.id
          });
          
          // Get needed headers
          const headers = messageDetails.data.payload?.headers || [];
          const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
          const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
          
          const fromAddress = fromHeader?.value || '';
          const subject = subjectHeader?.value || '';
          const receivedDate = new Date(parseInt(messageDetails.data.internalDate || '0'));
          
          let foundPDF = false;
          
          // Process attachments
          if (messageDetails.data.payload?.parts) {
            for (const part of messageDetails.data.payload.parts) {
              if (part.filename && 
                  part.mimeType?.toLowerCase() === 'application/pdf' && 
                  part.body?.attachmentId) {
                try {
                  // Fetch the attachment
                  const attachment = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: message.id,
                    id: part.body.attachmentId
                  });
                  
                  if (attachment.data?.data) {
                    // Save attachment and store metadata
                    const [filePath, fileSize] = await this.saveAttachment(
                      part.filename,
                      attachment.data.data
                    );
                    
                    await prisma.pDFAttachment.create({
                      data: {
                        configId: config.id,
                        fromAddress,
                        dateReceived: receivedDate,
                        subject,
                        fileName: part.filename,
                        localPath: filePath,
                        fileSize,
                        processed: false,
                        processingError: null
                      },
                    });
                    
                    console.log(`✅ Gmail PDF saved: ${part.filename} from ${fromAddress}`);
                    foundPDF = true;
                  }
                } catch (attachmentError) {
                  console.error(`❌ Error processing Gmail attachment ${part.filename}:`, attachmentError);
                }
              }
            }
          }
          
          // Mark message as read if we processed a PDF
          if (foundPDF) {
            await gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                removeLabelIds: ['UNREAD']
              }
            });
          }
        } catch (messageError) {
          console.error(`❌ Error processing Gmail message:`, messageError);
        }
      }
    } catch (error) {
      console.error('❌ Error checking Gmail emails:', error);
      throw error; // Re-throw for the main error handler
    }
  }

  // Outlook API Email Handling
  private async checkOutlookEmails(config: EmailIngestionConfig) {
    if (!config.token) {
      throw new Error('❌ Missing Outlook API token');
    }
    
    try {
      // Initialize Microsoft Graph client
      const client = Client.init({
        authProvider: (done) => {
          done(null, config.token!);
        },
      });

      // Get unread messages with attachments
      const response = await client
        .api('/me/messages')
        .filter('hasAttachments eq true and isRead eq false')
        .top(10)
        .get();

      if (!response.value || response.value.length === 0) {
        console.log("📭 No new Outlook emails with attachments.");
        return;
      }
      
      console.log(`📨 Found ${response.value.length} unread Outlook messages with attachments`);

      for (const message of response.value) {
        try {
          // Get message attachments
          const attachmentsResponse = await client
            .api(`/me/messages/${message.id}/attachments`)
            .get();
            
          let foundPDF = false;
          
          for (const attachment of attachmentsResponse.value) {
            // Check if it's a PDF
            if (attachment.contentType === 'application/pdf' && attachment.contentBytes) {
              const fileName = attachment.name || `outlook-${Date.now()}.pdf`;
              const [filePath, fileSize] = await this.saveAttachment(fileName, attachment.contentBytes);
              
              await prisma.pDFAttachment.create({
                data: {
                  configId: config.id,
                  fromAddress: message.sender?.emailAddress?.address || '',
                  dateReceived: new Date(message.receivedDateTime),
                  subject: message.subject || '',
                  fileName,
                  localPath: filePath,
                  fileSize,
                  processed: false,
                  processingError: null
                },
              });
              
              console.log(`✅ Outlook PDF saved: ${fileName}`);
              foundPDF = true;
            }
          }
          
          // Mark as read if we found and processed a PDF
          if (foundPDF) {
            await client
              .api(`/me/messages/${message.id}`)
              .update({ isRead: true });
          }
        } catch (messageError) {
          console.error('❌ Error processing Outlook message:', messageError);
        }
      }
    } catch (error) {
      console.error('❌ Error checking Outlook emails:', error);
      throw error; // Re-throw for main error handler
    }
  }
  
  // Method to stop the service
  public stopService() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('✅ Email checking service stopped');
    }
  }
  
  // Method to restart the service
  public restartService() {
    this.stopService();
    this.startChecking();
  }
}