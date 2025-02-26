import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ Fetch all email configurations, including associated PDF attachments
export async function GET() {
  try {
    const configs = await prisma.emailIngestionConfig.findMany({
      include: { attachments: true },
    });

    return NextResponse.json(configs, { status: 200 });
  } catch (error) {
    console.error('Error fetching email configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configurations' },
      { status: 500 }
    );
  }
}

// ✅ Create a new email configuration
export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Validate required fields
    if (
      !data.emailAddress ||
      !data.connectionType ||
      !data.username ||
      !data.password ||
      !data.host ||
      !data.port
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const config = await prisma.emailIngestionConfig.create({
      data: {
        emailAddress: data.emailAddress,
        connectionType: data.connectionType,
        username: data.username,
        password: data.password,
        host: data.host,
        port: Number(data.port), // Ensure port is a number
        token: data.token,
        isActive: data.isActive ?? true, // Default to active if not provided
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error('Error creating email configuration:', error);
    return NextResponse.json(
      { error: 'Failed to create configuration' },
      { status: 500 }
    );
  }
}
