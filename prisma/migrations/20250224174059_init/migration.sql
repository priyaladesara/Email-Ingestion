-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('IMAP', 'POP3', 'GMAIL_API', 'OUTLOOK_API');

-- CreateTable
CREATE TABLE "EmailIngestionConfig" (
    "id" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "connectionType" "ConnectionType" NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "host" TEXT NOT NULL DEFAULT 'N/A',
    "port" INTEGER DEFAULT 995,
    "token" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailIngestionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDFAttachment" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "fromAddress" TEXT,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PDFAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngestionConfig_emailAddress_key" ON "EmailIngestionConfig"("emailAddress");

-- CreateIndex
CREATE INDEX "EmailIngestionConfig_emailAddress_idx" ON "EmailIngestionConfig"("emailAddress");

-- CreateIndex
CREATE INDEX "EmailIngestionConfig_connectionType_isActive_idx" ON "EmailIngestionConfig"("connectionType", "isActive");

-- CreateIndex
CREATE INDEX "PDFAttachment_configId_idx" ON "PDFAttachment"("configId");

-- CreateIndex
CREATE INDEX "PDFAttachment_processed_idx" ON "PDFAttachment"("processed");

-- AddForeignKey
ALTER TABLE "PDFAttachment" ADD CONSTRAINT "PDFAttachment_configId_fkey" FOREIGN KEY ("configId") REFERENCES "EmailIngestionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
