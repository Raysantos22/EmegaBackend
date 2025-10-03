import axios from 'axios'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { code, marketplace = 'au' } = req.body

    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' })
    }

    const tokenEndpoint = marketplace === 'au' 
      ? 'https://api.amazon.com/auth/o2/token'
      : 'https://api.amazon.com/auth/o2/token'

    const response = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.SP_API_CLIENT_ID,
        client_secret: process.env.SP_API_CLIENT_SECRET,
        redirect_uri: 'http://localhost:3000/api/amazon/sp-callback'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )

    return res.status(200).json({
      success: true,
      refresh_token: response.data.refresh_token,
      access_token: response.data.access_token,
      expires_in: response.data.expires_in
    })

  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message)
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })
  }
}