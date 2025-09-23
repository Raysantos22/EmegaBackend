// pages/api/autods-token.js - Fixed API to manage AutoDS refresh token
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getTokenStatus(req, res)
      case 'POST':
        return await updateToken(req, res)
      case 'DELETE':
        return await clearToken(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Token management error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getTokenStatus(req, res) {
  try {
    // Check if we have a token stored in database
    const { data: tokenData, error } = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'autods_refresh_token')
      .single()

    const hasToken = !error && tokenData?.value
    const envToken = process.env.AUTODS_REFRESH_TOKEN

    return res.status(200).json({
      success: true,
      has_database_token: hasToken,
      has_env_token: !!envToken,
      token_source: hasToken ? 'database' : (envToken ? 'environment' : 'none'),
      last_updated: tokenData?.updated_at || null,
      token_preview: hasToken 
        ? `${tokenData.value.substring(0, 10)}...${tokenData.value.substring(tokenData.value.length - 10)}`
        : null
    })
  } catch (error) {
    return res.status(200).json({
      success: true,
      has_database_token: false,
      has_env_token: !!process.env.AUTODS_REFRESH_TOKEN,
      token_source: process.env.AUTODS_REFRESH_TOKEN ? 'environment' : 'none',
      error: 'Could not check database token storage'
    })
  }
}

async function updateToken(req, res) {
  const { refresh_token } = req.body

  if (!refresh_token || typeof refresh_token !== 'string' || refresh_token.trim().length < 10) {
    return res.status(400).json({ 
      error: 'Invalid refresh token', 
      message: 'Refresh token must be a string with at least 10 characters' 
    })
  }

  try {
    // First, ensure the app_settings table exists
    await ensureAppSettingsTable()

    // Store the token in database
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'autods_refresh_token',
        value: refresh_token.trim(),
        updated_at: new Date().toISOString()
      })
      .select()

    if (error) {
      console.error('Error storing token:', error)
      throw error
    }

    return res.status(200).json({
      success: true,
      message: 'AutoDS refresh token updated successfully',
      token_preview: `${refresh_token.substring(0, 10)}...${refresh_token.substring(refresh_token.length - 10)}`
    })
  } catch (error) {
    console.error('Token update error:', error)
    return res.status(500).json({
      error: 'Failed to update token',
      message: error.message
    })
  }
}

async function clearToken(req, res) {
  try {
    const { error } = await supabase
      .from('app_settings')
      .delete()
      .eq('key', 'autods_refresh_token')

    if (error) {
      throw error
    }

    return res.status(200).json({
      success: true,
      message: 'AutoDS refresh token cleared successfully'
    })
  } catch (error) {
    console.error('Token clear error:', error)
    return res.status(500).json({
      error: 'Failed to clear token',
      message: error.message
    })
  }
}

async function ensureAppSettingsTable() {
  try {
    // Try to insert a test record to check if table exists
    const { error: testError } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)

    if (testError && testError.code === 'PGRST106') {
      // Table doesn't exist, but we can't create it due to permissions
      console.warn('app_settings table does not exist and cannot be created due to permissions')
      console.warn('Please run the SQL commands manually in Supabase SQL editor')
      throw new Error('app_settings table not found. Please create it manually using the provided SQL commands.')
    }
  } catch (error) {
    if (error.message.includes('app_settings table not found')) {
      throw error
    }
    console.warn('Table check failed, but continuing:', error.message)
  }
}