export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await fetch('https://track.emega.com.au/api/emega/get-tables.php')
    const data = await response.json()
    
    res.status(200).json(data)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ 
      error: 'Failed to fetch tables',
      message: error.message 
    })
  }
}