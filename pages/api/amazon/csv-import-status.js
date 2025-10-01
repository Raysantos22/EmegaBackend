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

    const progress = {
      processed: session.processed_skus || 0,
      imported: session.imported_products || 0,
      updated: session.updated_products || 0,
      failed: session.failed_skus || 0,
      total: session.total_skus || 0,
      percentage: session.total_skus > 0 ? 
        Math.round((session.processed_skus || 0) / session.total_skus * 100) : 0
    }

    // Parse activity logs from error_details JSONB
    let importDetails = []
    if (session.error_details && Array.isArray(session.error_details)) {
      importDetails = session.error_details
        .filter(item => item.asin) // Only items with ASIN (activity logs)
        .slice(-50) // Last 50 activities
    }

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
      completed_at: session.completed_at
    }

    return res.status(200).json({
      success: true,
      session: sessionData,
      progress,
      status: session.status,
      importDetails: importDetails
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