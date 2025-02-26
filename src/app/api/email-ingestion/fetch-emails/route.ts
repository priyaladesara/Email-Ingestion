import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { EmailIngestionService } from '@/services/emailIngestion';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Fetch active email configurations from the database
    const configs = await prisma.emailIngestionConfig.findMany({
      where: { isActive: true },
    });

    if (configs.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No active email accounts found.',
      });
    }

    // Initialize Email Ingestion Service
    const emailService = EmailIngestionService.getInstance();
    
    // ✅ Explicitly Define `results` Type
    const results: { configId: string; status: string; error?: string }[] = [];

    for (const config of configs) {
      try {
        await emailService.checkEmails(config);
        results.push({ configId: config.id, status: 'Success' });
      } catch (err) {
        console.error(`Failed to fetch emails for ${config.emailAddress}:`, err);
        results.push({ configId: config.id, status: 'Failed', error: (err as Error).message });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Email fetching process completed.',
      results,
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}
