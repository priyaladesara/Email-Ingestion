// src/app/api/email-ingestion/attachments/route.ts
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Get all PDF attachments
export async function GET(request: Request) {
  try {
    const attachments = await prisma.pDFAttachment.findMany({
      include: {
        config: true
      }
    })
    return NextResponse.json(attachments)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch attachments' },
      { status: 500 }
    )
  }
}