import { getOrders } from '../../../lib/spApiClient'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const data = await getOrders(7)
    
    return res.status(200).json({
      success: true,
      count: data.payload?.Orders?.length || 0,
      orders: data.payload?.Orders || [],
      nextToken: data.payload?.NextToken || null
    })

  } catch (error) {
    console.error('SP-API Error:', error.response?.data || error.message)
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    })
  }
}