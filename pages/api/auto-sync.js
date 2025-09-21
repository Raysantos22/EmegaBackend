// pages/api/auto-sync.js - Automated sync endpoint for cron jobs
import { createSyncLog } from '../../utils/syncHelpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify cron job authentication (optional but recommended)
  const cronSecret = req.headers['x-cron-secret']
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('Starting automated sync...')
    
    // Determine the base URL for internal API calls
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers.host
    const baseUrl = process.env.NEXTJS_URL || `${protocol}://${host}`
    
    console.log(`Making sync request to: ${baseUrl}/api/sync-products`)
    
    // Call the main sync function
    const syncResponse = await fetch(`${baseUrl}/api/sync-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Auto-Sync/1.0'
      },
    })
    
    if (!syncResponse.ok) {
      throw new Error(`Sync API returned ${syncResponse.status}: ${syncResponse.statusText}`)
    }
    
    const syncResult = await syncResponse.json()
    
    // Log the result
    console.log('Automated sync completed:', {
      success: syncResult.success,
      total_fetched: syncResult.total_fetched,
      active_synced: syncResult.active_synced,
      zero_qty_removed: syncResult.zero_qty_removed,
      obsolete_removed: syncResult.obsolete_removed
    })
    
    // Store sync log (with error handling)
    try {
      await createSyncLog('automated', syncResult, syncResult.success ? 'success' : 'error')
    } catch (logError) {
      console.error('Failed to create sync log:', logError)
      // Don't fail the entire operation if logging fails
    }
    
    res.status(200).json({
      success: true,
      message: 'Automated sync completed',
      result: syncResult,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Automated sync error:', error)
    
    const errorResult = {
      success: false,
      error: 'Automated sync failed', 
      message: error.message,
      timestamp: new Date().toISOString()
    }
    
    // Try to log the error (with error handling)
    try {
      await createSyncLog('automated', errorResult, 'error')
    } catch (logError) {
      console.error('Failed to create error log:', logError)
    }
    
    res.status(500).json(errorResult)
  }
}