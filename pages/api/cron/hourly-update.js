// pages/api/cron/hourly-update.js - Cron job for automated updates
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  }
)

export default async function handler(req, res) {
  // Verify this is being called from a cron service
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('Cron: Starting automated hourly update...')

    // Check if there's already a running update
    const { data: existingBatch } = await supabase
      .from('update_batches')
      .select('*')
      .eq('status', 'running')
      .single()

    if (existingBatch) {
      console.log('Cron: Update already in progress, skipping')
      return res.status(200).json({
        success: true,
        message: 'Update already in progress',
        skipped: true
      })
    }

    // Trigger the update by calling the main update API
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/amazon/update-hourly`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()

    if (result.success) {
      console.log('Cron: Successfully started hourly update')
      return res.status(200).json({
        success: true,
        message: 'Automated hourly update started',
        batchId: result.batchId
      })
    } else {
      throw new Error(result.message || 'Failed to start update')
    }

  } catch (error) {
    console.error('Cron: Hourly update error:', error)
    return res.status(500).json({
      success: false,
      error: 'Automated update failed',
      message: error.message
    })
  }
}