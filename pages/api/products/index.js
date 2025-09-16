import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { page = 1, limit = 50, search, status } = req.query
      
      let query = supabase
        .from('products')
        .select('*')
        .order('modified_at', { ascending: false })
      
      // Add search filter
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
      }
      
      // Add status filter
      if (status) {
        query = query.eq('status', parseInt(status))
      }
      
      // Add pagination
      const from = (page - 1) * limit
      const to = from + limit - 1
      
      query = query.range(from, to)
      
      const { data, error, count } = await query
      
      if (error) {
        throw error
      }
      
      res.status(200).json({
        products: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      })
      
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}