import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

// Get specific attachment details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const attachment = await prisma.pDFAttachment.findUnique({
      where: { id: params.id },
      include: { config: true }
    })
    
    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(attachment)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch attachment' },
      { status: 500 }
    )
  }
}
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
  ) {
    try {
      const attachment = await prisma.pDFAttachment.findUnique({
        where: { id: params.id }
      })
      
      if (!attachment) {
        return NextResponse.json(
          { error: 'Attachment not found' },
          { status: 404 }
        )
      }
      
      // Delete file from local storage
      try {
        fs.unlinkSync(attachment.localPath)
      } catch (error) {
        console.error('Failed to delete file:', error)
      }
      
      // Delete from database
      await prisma.pDFAttachment.delete({
        where: { id: params.id }
      })
      
      return NextResponse.json({ success: true })
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to delete attachment' },
        { status: 500 }
      )
    }
  }
  