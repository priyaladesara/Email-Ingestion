import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { syncEmailAttachments } from '@/lib/email-services'

const prisma = new PrismaClient()

// Trigger manual sync for all active configurations
export async function POST(request: Request) {
  try {
    const activeConfigs = await prisma.emailIngestionConfig.findMany({
      where: { isActive: true }
    })
    
    const results = await Promise.allSettled(
      activeConfigs.map(config => syncEmailAttachments(config))
    )
    
    return NextResponse.json({
      success: true,
      results: results.map((result, index) => ({
        config: activeConfigs[index].emailAddress,
        status: result.status,
        value: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason : undefined
      }))
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync attachments' },
      { status: 500 }
    )
  }
}
