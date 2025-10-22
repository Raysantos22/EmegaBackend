export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { table } = req.query

  if (!table) {
    return res.status(400).json({ error: 'Table name is required' })
  }

  try {
    const response = await fetch(
      `https://track.emega.com.au/api/emega/table-structure.php?table=${encodeURIComponent(table)}`
    )
    const data = await response.json()
    
    res.status(200).json(data)
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ 
      error: 'Failed to fetch table structure',
      message: error.message 
    })
  }
}