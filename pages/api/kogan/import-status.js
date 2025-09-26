// pages/api/kogan/import-status.js - Check import status (separate file)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId, sessionId } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'userId required' })
    }

    // Get latest import session
    let query = supabase
      .from('import_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })

    if (sessionId) {
      query = query.eq('id', sessionId)
    }

    const { data: sessions, error } = await query.limit(1)

    if (error) {
      console.error('Session query error:', error)
      throw error
    }

    const session = sessions?.[0]
    if (!session) {
      return res.status(200).json({
        success: true,
        status: 'none',
        message: 'No import sessions found'
      })
    }

    // Get current product count
    const { count: totalProducts } = await supabase
      .from('kogan_products')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('monitoring_enabled', true)

    res.status(200).json({
      success: true,
      session,
      currentProductCount: totalProducts || 0,
      status: session.status,
      progress: {
        processed: session.products_processed || 0,
        added: session.products_added || 0,
        updated: session.products_updated || 0,
        errors: session.errors || 0,
        maxProducts: session.max_products || 0
      }
    })

  } catch (error) {
    console.error('Status check error:', error)
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    })
  }
}