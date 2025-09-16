import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query
  
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('autods_id', id)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Product not found' })
        }
        throw error
      }
      
      res.status(200).json(data)
      
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}