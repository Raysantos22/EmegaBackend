// pages/api/amazon/update-status.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, sessionId } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    let query = supabase
      .from('update_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)

    if (sessionId) {
      query = supabase
        .from('update_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
    }

    const { data, error } = await query

    if (error && sessionId) {
      return res.status(404).json({ success: false, error: 'Session not found' })
    }

    const session = sessionId ? data : (data && data.length > 0 ? data[0] : null)

    if (!session) {
      return res.status(200).json({
        success: true,
        session: null,
        progress: { processed: 0, updated: 0, failed: 0, total: 0, percentage: 0 }
      })
    }

    const progress = {
      processed: session.processed_products || 0,
      updated: session.updated_products || 0,
      failed: session.failed_products || 0,
      total: session.total_products || 0,
      percentage: session.total_products > 0 
        ? Math.round((session.processed_products / session.total_products) * 100)
        : 0
    }

    return res.status(200).json({
      success: true,
      session: session,
      progress: progress
    })

  } catch (error) {
    console.error('[UPDATE-STATUS] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get update status',
      message: error.message
    })
  }
}