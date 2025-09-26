// pages/api/sync-logs.js - API endpoint for viewing sync history
import { supabase } from '../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { page = 1, limit = 20 } = req.query
    
    const from = (parseInt(page) - 1) * parseInt(limit)
    const to = from + parseInt(limit) - 1
    
    const { data: logs, error, count } = await supabase
      .from('sync_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    
    if (error) {
      throw error
    }
    
    res.status(200).json({
      success: true,
      logs: logs || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    })
    
  } catch (error) {
    console.error('Error fetching sync logs:', error)
    res.status(500).json({ 
      error: 'Failed to fetch sync logs', 
      message: error.message 
    })
  }
}
