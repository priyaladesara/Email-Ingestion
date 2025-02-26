# Email Ingestion System

A Next.js application for automatically downloading PDF attachments from configured email accounts and storing them in a local directory with metadata in a PostgreSQL database.

## Project Overview

This application allows you to:
- Configure multiple email accounts (Gmail supported)
- Automatically fetch emails and download PDF attachments
- Store attachment metadata in a PostgreSQL database and also in Local Storage.
- View and manage downloaded PDFs through a simple web interface

## Project Structure

```bash
├── .env                  # Environment variables
├── .next                 # Next.js build directory
├── prisma                # Prisma database configuration
│   ├── migrations        # Database migration files
│   ├── schema.prisma     # Prisma schema definition
│   └── seed.ts           # Database seeding script
├── pdfs                  # Downloaded PDF storage directory
├── src                   # Source code
│   ├── app               # Next.js application
│   │   ├── api           # API routes
│   │   │   └── email-ingestion  # Email ingestion endpoints
│   │   │       ├── attachments  # Attachment handling
│   │   │       ├── check        # Email checking
│   │   │       ├── fetch-emails # Email fetching
│   │   │       └── test-connection # Connection testing
│   ├── lib               # Utility libraries
│   │   └── email-services.ts # Email service functions
│   └── services          # Service layer
│       └── emailIngestion.ts # Email ingestion business logic
├── public                # Static files
├── package.json          # Project dependencies
└── README.md             # This documentation
```
## Prerequisites

- Node.js 16.x or higher
- PostgreSQL database
- Gmail account with OAuth credentials
- Basic understanding of Next.js and TypeScript

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd email-ingestion
npm install
```


# Database Connection
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<database_name>"

# Gmail OAuth Credentials
- GMAIL_CLIENT_ID="your-client-id-from-google-cloud-console"
- GMAIL_CLIENT_SECRET="your-client-secret-from-google-cloud-console"
- GMAIL_REDIRECT_URI="https://developers.google.com/oauthplayground"
- GMAIL_REFRESH_TOKEN="your-refresh-token-from-oauth-playground"


##To obtain Gmail OAuth credentials:

- Go to Google Cloud Console
- Create a new project
- Enable the Gmail API
- Create OAuth 2.0 credentials
- Use OAuth Playground to get refresh token


## Database Setup
Initialize your database with Prisma:

```bash
npx prisma migrate dev
```
This will:

Apply all migrations in the prisma/migrations directory
Create necessary tables for email accounts and attachments
Generate Prisma client

## Start Development Server
```bash
npm run dev
```

Open http://localhost:3000 in your browser.
Usage Guide
Setting Up Email Accounts

Navigate to the email configuration page
Add a new email account with the following details:

Email address
Connection type (currently only Gmail supported with different Configurations IMAP , POP3 , GMAIL_API)
Any specific folder to monitor (default: inbox)



## Testing Email Ingestion

Send a test email with PDF attachment to your configured email account
Click "Check Inbox" button on the dashboard
The system will:

## Connect to your email account
Download new PDF attachments
Store them in the pdfs/ directory
Record metadata in the database



## Verification
To verify the system is working:

- Check the pdfs/ directory for downloaded files
- Check the database for new attachment records
- View the attachment listing in the web interface

## Troubleshooting
Common Issues

- Connection errors: Verify your Gmail credentials and refresh token
- Permission denied: Ensure the application has write permissions to the pdfs/ directory
- Database connection failures: Check your PostgreSQL connection string and credentials

## API documentation
```bash
https://documenter.getpostman.com/view/40381972/2sAYdfpWRx
```

## Logs
- Check the console logs for detailed error information. The application logs connection attempts, email fetching, and attachment downloading operations.
Security Considerations

- This application stores email credentials in plain text in the .env file
- For production use, consider implementing proper secret management
= Restrict access to the application and database to authorized personnel only



