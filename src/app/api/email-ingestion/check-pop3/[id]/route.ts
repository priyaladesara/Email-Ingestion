import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testPop3Connection, syncPop3Attachments } from '@/lib/email-services';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const id = context.params.id;

    if (!id) {
      return NextResponse.json({ error: 'Missing email config ID' }, { status: 400 });
    }

    // Get the email config
    const config = await prisma.emailIngestionConfig.findUnique({
      where: { id },
    });

    if (!config) {
      return NextResponse.json({ error: 'Email configuration not found' }, { status: 404 });
    }

    console.log(`🔍 Testing POP3 connection for ${config.emailAddress}`);

    // Test POP3 connection first
    const connectionTest = await testPop3Connection(config);
    
    if (!connectionTest) {
      return NextResponse.json({ 
        success: false, 
        message: 'POP3 connection test failed' 
      }, { status: 400 });
    }

    // If connection test passes, sync attachments
    const results = await syncPop3Attachments(config);

    // Return results
    return NextResponse.json({
      success: true,
      message: `Successfully processed ${results.length} attachments via POP3`,
      count: results.length,
      files: results,
    });
  } catch (error) {
    console.error('Error in POP3 email check API:', error);
    return NextResponse.json(
      { error: `Failed to process emails: ${error}` },
      { status: 500 }
    );
  }
}