import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { EmailIngestionService } from '@/services/emailIngestion';

const prisma = new PrismaClient();

export async function POST(request: Request, context: { params: { id?: string } }) {
  try {
    const { id } = await context.params;
    
    if (!id) {
      return NextResponse.json({ error: 'Missing email config ID' }, { status: 400 });
    }

    const config = await prisma.emailIngestionConfig.findUnique({ 
      where: { id },
      include: { attachments: true } // Include attachments if needed
    });

    if (!config) {
      return NextResponse.json({ error: 'Email config not found' }, { status: 404 });
    }

    if (!config.isActive) {
      return NextResponse.json({ error: 'Email config is inactive' }, { status: 403 });
    }

    const emailService = EmailIngestionService.getInstance();
    await emailService.checkEmails(config);

    await prisma.emailIngestionConfig.update({
      where: { id },
      data: { lastChecked: new Date() }
    });

    return NextResponse.json({ message: `Email sync started for ${config.emailAddress}` });
  } catch (error) {
    console.error(`❌ Error checking emails:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
