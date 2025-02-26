import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ Update an existing email configuration
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id; // Ensure ID is properly accessed
    const data = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
    }

    // Check if the email config exists before updating
    const existingConfig = await prisma.emailIngestionConfig.findUnique({
      where: { id },
    });

    if (!existingConfig) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    const updatedConfig = await prisma.emailIngestionConfig.update({
      where: { id },
      data: {
        emailAddress: data.emailAddress,
        connectionType: data.connectionType,
        username: data.username,
        password: data.password,
        host: data.host,
        port: data.port,
        token: data.token,
        isActive: data.isActive ?? true, // Default to true if not provided
      },
    });

    return NextResponse.json(updatedConfig, { status: 200 });
  } catch (error) {
    console.error('Error updating email configuration:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}

// ✅ Delete an email configuration
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
    }

    // Check if the email config exists before deleting
    const existingConfig = await prisma.emailIngestionConfig.findUnique({
      where: { id },
    });

    if (!existingConfig) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    // First, delete associated PDF attachments
    await prisma.pDFAttachment.deleteMany({
      where: { configId: id },
    });

    // Then, delete the email configuration
    await prisma.emailIngestionConfig.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting email configuration:', error);
    return NextResponse.json(
      { error: 'Failed to delete configuration' },
      { status: 500 }
    );
  }
}
