// pages/api/amazon/csv-import-status.js - FIXED without range pagination
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

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

    // Query for session
    let query = supabaseAdmin
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
        },
        importDetails: []
      })
    }

    // ✅ Fix stuck sessions - if session has completion log but status is still 'running'
    if (session.status === 'running') {
      const { data: completionLog } = await supabaseAdmin
        .from('import_logs')
        .select('*')
        .eq('session_id', session.id)
        .eq('asin', 'SYSTEM')
        .eq('status', 'success')
        .ilike('message', 'Import completed%')
        .single()
      
      if (completionLog) {
        console.log(`[FIX] Session ${session.id} is stuck as 'running' but has completion log. Fixing...`)
        
        // Count actual results from logs
        const { data: allLogs } = await supabaseAdmin
          .from('import_logs')
          .select('status')
          .eq('session_id', session.id)
        
        const imported = allLogs?.filter(l => l.status === 'success' && l.asin !== 'SYSTEM').length || 0
        const skipped = allLogs?.filter(l => l.status === 'skipped').length || 0
        const failed = allLogs?.filter(l => l.status === 'error' && l.asin !== 'SYSTEM').length || 0
        const processed = imported + skipped + failed
        
        // Update session to completed with correct counts
        await supabaseAdmin
          .from('csv_import_sessions')
          .update({
            status: 'completed',
            processed_skus: processed,
            imported_products: imported,
            updated_products: skipped,
            failed_skus: failed,
            completed_at: completionLog.created_at
          })
          .eq('id', session.id)
        
        // Re-fetch updated session
        const { data: fixedSessions } = await supabaseAdmin
          .from('csv_import_sessions')
          .select('*')
          .eq('id', session.id)
          .single()
        
        if (fixedSessions) {
          Object.assign(session, fixedSessions)
          console.log(`[FIX] Session ${session.id} fixed: ${processed}/${session.total_skus}`)
        }
      }
    }

    // Calculate progress
    const progress = {
      processed: session.processed_skus || 0,
      imported: session.imported_products || 0,
      updated: session.updated_products || 0,
      failed: session.failed_skus || 0,
      total: session.total_skus || 0,
      percentage: session.total_skus > 0 
        ? Math.round((session.processed_skus || 0) / session.total_skus * 100) 
        : 0
    }

    // ✅ FETCH LOGS - Simple query without pagination (limit to reasonable amount)
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('import_logs')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(500) // Fetch up to 500 logs

    if (logsError) {
      console.error('Error fetching logs:', logsError)
    }

    // Format logs for frontend
    const importDetails = (logs || []).map(log => ({
      asin: log.asin,
      status: log.status,
      message: log.message,
      timestamp: log.created_at,
      details: log.details
    }))

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

    console.log(`[STATUS CHECK] Session ${session.id}: ${progress.processed}/${progress.total}, ${importDetails.length} logs`)

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