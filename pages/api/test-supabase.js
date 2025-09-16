import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  try {
    console.log('Testing Supabase connection...')
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Service Key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    // Test connection
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(1)
    
    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({
        error: 'Supabase connection failed',
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
    }
    
    res.status(200).json({
      success: true,
      message: 'Supabase connection successful!',
      data: data,
      rowCount: data?.length || 0
    })
    
  } catch (error) {
    console.error('Test error:', error)
    res.status(500).json({
      error: 'Test failed',
      message: error.message
    })
  }
}