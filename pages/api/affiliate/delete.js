import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id, userId } = req.body

    if (!id || !userId) {
      return res.status(400).json({
        success: false,
        error: 'id and userId required'
      })
    }

    const { error } = await supabase
      .from('affiliate_links')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error

    return res.status(200).json({
      success: true,
      message: 'Deleted successfully'
    })

  } catch (error) {
    console.error('[AFFILIATE-DELETE]:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}