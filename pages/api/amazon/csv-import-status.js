// pages/api/amazon/csv-import-status.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    })
  }

  try {
    const { userId, sessionId } = req.query

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'userId required' 
      })
    }

    console.log(`Checking CSV import status for user: ${userId}, session: ${sessionId || 'latest'}`)

    // Build query based on whether sessionId is provided
    let query = supabase
      .from('csv_import_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })

    if (sessionId) {
      query = query.eq('id', sessionId).limit(1)
    } else {
      query = query.limit(1)
    }

    const { data: sessions, error } = await query

    if (error) {
      console.error('Database query error:', error)
      throw error
    }

    const session = sessions?.[0]
    
    if (!session) {
      return res.status(200).json({
        success: true,
        status: 'none',
        message: 'No import sessions found',
        session: null,
        progress: {
          processed: 0,
          imported: 0,
          updated: 0,
          failed: 0,
          total: 0,
          percentage: 0
        }
      })
    }

    // Calculate progress
    const progress = {
      processed: session.processed_skus || 0,
      imported: session.imported_products || 0,
      updated: session.updated_products || 0,
      failed: session.failed_skus || 0,
      total: session.total_skus || 0,
      percentage: session.total_skus > 0 ? 
        Math.round((session.processed_skus || 0) / session.total_skus * 100) : 0
    }

    // Calculate processing rate and ETA for running imports
    let processingStats = null
    if (session.status === 'running' && session.started_at && progress.processed > 0) {
      const startTime = new Date(session.started_at).getTime()
      const currentTime = Date.now()
      const elapsedSeconds = (currentTime - startTime) / 1000
      const processingRate = progress.processed / elapsedSeconds // items per second
      const remaining = progress.total - progress.processed
      const etaSeconds = remaining / Math.max(processingRate, 0.1) // Avoid division by zero
      
      processingStats = {
        elapsedSeconds: Math.round(elapsedSeconds),
        processingRate: parseFloat(processingRate.toFixed(2)),
        etaSeconds: Math.round(etaSeconds),
        etaMinutes: Math.round(etaSeconds / 60)
      }
    }

    // Format session data for response
    const sessionData = {
      id: session.id,
      status: session.status,
      total_skus: session.total_skus,
      processed_skus: session.processed_skus,
      imported_products: session.imported_products,
      updated_products: session.updated_products,
      failed_skus: session.failed_skus,
      error_message: session.error_message,
      started_at: session.started_at,
      completed_at: session.completed_at,
      processing_stats: processingStats
    }

    console.log(`CSV import status: ${session.status}, progress: ${progress.percentage}%`)

    return res.status(200).json({
      success: true,
      session: sessionData,
      progress,
      status: session.status
    })

  } catch (error) {
    console.error('CSV status error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get CSV import status',
      message: error.message
    })
  }
}