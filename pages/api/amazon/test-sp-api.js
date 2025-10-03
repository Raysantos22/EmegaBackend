import axios from 'axios'

export default async function handler(req, res) {
  try {
    // Get access token
    const tokenResponse = await axios.post('https://api.amazon.com/auth/o2/token', 
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.SP_API_REFRESH_TOKEN,
        client_id: process.env.SP_API_CLIENT_ID,
        client_secret: process.env.SP_API_CLIENT_SECRET
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )

    return res.status(200).json({
      success: true,
      message: 'SP-API authentication working',
      access_token: tokenResponse.data.access_token.substring(0, 20) + '...',
      expires_in: tokenResponse.data.expires_in
    })

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    })
  }
}