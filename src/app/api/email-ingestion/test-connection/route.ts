// src/app/api/email-ingestion/test-connection/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testEmailConnection } from '@/lib/email-services';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    // Parse JSON request body
    const config = await request.json();

    // Validate required fields before testing connection
    if (!config.emailAddress || !config.connectionType) {
      return NextResponse.json(
        { error: 'Missing required fields: emailAddress or connectionType' },
        { status: 400 }
      );
    }

    // Test email connection
    const connectionResult = await testEmailConnection(config);

    return NextResponse.json({
      success: connectionResult,
      message: connectionResult ? 'Connection successful' : 'Connection failed',
    });
  } catch (error) {
    console.error('Error testing email connection:', error);

    return NextResponse.json(
      { error: 'Failed to test connection', details: (error as Error).message },
      { status: 500 }
    );
  }
}
