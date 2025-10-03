import axios from 'axios'

const SP_API_CONFIG = {
  sandbox: true,
  endpoint: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
  marketplace_id: 'A39IBJ37TRP1C6'
}

async function getAccessToken() {
  const response = await axios.post('https://api.amazon.com/auth/o2/token', 
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
  
  return response.data.access_token
}

export async function getOrders(daysBack = 30) {
  const accessToken = await getAccessToken()
  
  const createdAfter = new Date()
  createdAfter.setDate(createdAfter.getDate() - daysBack)
  
  const response = await axios.get(
    `${SP_API_CONFIG.endpoint}/orders/v0/orders`,
    {
      headers: {
        'x-amz-access-token': accessToken
      },
      params: {
        MarketplaceIds: SP_API_CONFIG.marketplace_id,
        CreatedAfter: createdAfter.toISOString()
      }
    }
  )
  
  return response.data
}