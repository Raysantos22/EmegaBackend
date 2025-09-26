// pages/api/notifications/update-summary.js - Get update notifications
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
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    })
  }

  try {
    const { timeframe = '24h', limit = 10 } = req.query

    // Calculate time range
    const now = new Date()
    const timeRanges = {
      '1h': new Date(now.getTime() - 60 * 60 * 1000),
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const startTime = timeRanges[timeframe] || timeRanges['24h']

    // Get recent update batches
    const { data: batches, error: batchError } = await supabase
      .from('update_batches')
      .select('*')
      .gte('started_at', startTime.toISOString())
      .order('started_at', { ascending: false })
      .limit(parseInt(limit))

    if (batchError) throw batchError

    // Get CSV import sessions
    const { data: csvSessions, error: csvError } = await supabase
      .from('csv_import_sessions')
      .select('*')
      .gte('started_at', startTime.toISOString())
      .order('started_at', { ascending: false })
      .limit(parseInt(limit))

    if (csvError) throw csvError

    // Calculate summary statistics
    const summary = calculateSummaryStats(batches, csvSessions, startTime)

    // Format notifications
    const notifications = formatNotifications(batches, csvSessions)

    return res.status(200).json({
      success: true,
      timeframe,
      summary,
      notifications,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Notification API error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get notifications',
      message: error.message
    })
  }
}

function calculateSummaryStats(batches, csvSessions, startTime) {
  const completedBatches = batches.filter(b => b.status === 'completed')
  const completedImports = csvSessions.filter(s => s.status === 'completed')
  
  // Update batch statistics
  const totalProductsUpdated = completedBatches.reduce((sum, batch) => 
    sum + (batch.processed_products || 0), 0)
  const totalProductsChanged = completedBatches.reduce((sum, batch) => 
    sum + (batch.updated_products || 0), 0)
  const totalUpdateErrors = completedBatches.reduce((sum, batch) => 
    sum + (batch.failed_products || 0), 0)

  // CSV import statistics  
  const totalImportedProducts = completedImports.reduce((sum, session) => 
    sum + (session.imported_products || 0), 0)
  const totalUpdatedProducts = completedImports.reduce((sum, session) => 
    sum + (session.updated_products || 0), 0)
  const totalImportErrors = completedImports.reduce((sum, session) => 
    sum + (session.failed_skus || 0), 0)

  // Running processes
  const runningUpdates = batches.filter(b => b.status === 'running').length
  const runningImports = csvSessions.filter(s => s.status === 'running').length

  return {
    updates: {
      completedBatches: completedBatches.length,
      runningBatches: runningUpdates,
      totalProductsChecked: totalProductsUpdated,
      totalPriceChanges: totalProductsChanged,
      totalErrors: totalUpdateErrors,
      successRate: totalProductsUpdated > 0 ? 
        ((totalProductsUpdated - totalUpdateErrors) / totalProductsUpdated * 100).toFixed(1) : '0'
    },
    imports: {
      completedImports: completedImports.length,
      runningImports: runningImports,
      totalImported: totalImportedProducts,
      totalUpdated: totalUpdatedProducts,
      totalErrors: totalImportErrors,
      successRate: (totalImportedProducts + totalUpdatedProducts) > 0 ? 
        (((totalImportedProducts + totalUpdatedProducts) / 
          (totalImportedProducts + totalUpdatedProducts + totalImportErrors)) * 100).toFixed(1) : '0'
    },
    overall: {
      totalActivities: batches.length + csvSessions.length,
      totalProductsProcessed: totalProductsUpdated + totalImportedProducts + totalUpdatedProducts,
      totalErrors: totalUpdateErrors + totalImportErrors
    }
  }
}

function formatNotifications(batches, csvSessions) {
  const notifications = []

  // Format update batch notifications
  batches.forEach(batch => {
    const startTime = new Date(batch.started_at)
    const endTime = batch.completed_at ? new Date(batch.completed_at) : new Date()
    const duration = Math.round((endTime - startTime) / 1000 / 60) // minutes

    let message = ''
    let type = 'info'

    if (batch.status === 'running') {
      const progress = batch.total_products > 0 ? 
        Math.round((batch.processed_products || 0) / batch.total_products * 100) : 0
      message = `Hourly update in progress: ${batch.processed_products || 0}/${batch.total_products || 0} products (${progress}%)`
      type = 'info'
    } else if (batch.status === 'completed') {
      message = `Hourly update completed: ${batch.processed_products || 0} products checked, ${batch.updated_products || 0} updated in ${duration}min`
      type = 'success'
    } else if (batch.status === 'failed') {
      message = `Hourly update failed after ${duration}min: ${batch.error_message || 'Unknown error'}`
      type = 'error'
    }

    notifications.push({
      id: `batch_${batch.id}`,
      type,
      category: 'update',
      message,
      timestamp: batch.started_at,
      completed: batch.status !== 'running',
      details: {
        batchId: batch.id,
        totalProducts: batch.total_products,
        processed: batch.processed_products,
        updated: batch.updated_products,
        failed: batch.failed_products,
        duration: duration
      }
    })
  })

  // Format CSV import notifications
  csvSessions.forEach(session => {
    const startTime = new Date(session.started_at)
    const endTime = session.completed_at ? new Date(session.completed_at) : new Date()
    const duration = Math.round((endTime - startTime) / 1000 / 60) // minutes

    let message = ''
    let type = 'info'

    if (session.status === 'running') {
      const progress = session.total_skus > 0 ? 
        Math.round((session.processed_skus || 0) / session.total_skus * 100) : 0
      message = `CSV import in progress: ${session.processed_skus || 0}/${session.total_skus || 0} items (${progress}%)`
      type = 'info'
    } else if (session.status === 'completed') {
      message = `CSV import completed: ${session.imported_products || 0} imported, ${session.updated_products || 0} updated in ${duration}min`
      type = 'success'
    } else if (session.status === 'failed') {
      message = `CSV import failed after ${duration}min: ${session.error_message || 'Unknown error'}`
      type = 'error'
    }

    notifications.push({
      id: `import_${session.id}`,
      type,
      category: 'import',
      message,
      timestamp: session.started_at,
      completed: session.status !== 'running',
      details: {
        sessionId: session.id,
        totalSkus: session.total_skus,
        processed: session.processed_skus,
        imported: session.imported_products,
        updated: session.updated_products,
        failed: session.failed_skus,
        duration: duration
      }
    })
  })

  // Sort by timestamp (newest first)
  notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  return notifications
}

