// pages/api/emega/search-tracking.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.query

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' })
  }

  try {
    console.log(`Attempting to search for: "${query}"`)
    
    // First, try the simple PHP search endpoint if it exists
    try {
      const phpSearchResponse = await fetch(
        `https://track.emega.com.au/api/emega/search-tracking-simple.php?query=${encodeURIComponent(query)}`
      )
      
      if (phpSearchResponse.ok) {
        const phpData = await phpSearchResponse.json()
        console.log(`PHP search returned ${phpData.count} results`)
        
        if (phpData.success) {
          return res.status(200).json(phpData)
        }
      }
    } catch (phpError) {
      console.log('PHP search endpoint not available, falling back to table-data method')
    }
    
    // Fallback: Use the table-data endpoint and filter client-side
    console.log('Using fallback method: fetching table data and filtering...')
    
    // Try to fetch a reasonable number of records
    // Start with page 1 and search through multiple pages if needed
    let allResults = []
    let page = 1
    const limit = 1000
    let totalScanned = 0
    
    // Search through up to 10 pages (10,000 records)
    while (page <= 100) {
      const response = await fetch(
        `https://track.emega.com.au/api/emega/table-data.php?table=emega_tracking&limit=${limit}&page=${page}`
      )
      
      if (!response.ok) {
        break
      }
      
      const tableData = await response.json()
      const rows = tableData.rows || []
      
      if (rows.length === 0) {
        break // No more data
      }
      
      totalScanned += rows.length
      
      // Filter the current page results
      const searchLower = query.toLowerCase().trim()
      const pageResults = rows.filter(row => {
        const orderIdMatch = row.orderID && (
          row.orderID.toLowerCase() === searchLower ||
          row.orderID.toLowerCase().includes(searchLower)
        )
        
        const emegaTrackingMatch = row.emega_tracking_num && (
          row.emega_tracking_num.toLowerCase() === searchLower ||
          row.emega_tracking_num.toLowerCase().includes(searchLower)
        )
        
        const originalTrackingMatch = row.original_tracking_num && (
          row.original_tracking_num.toLowerCase() === searchLower ||
          row.original_tracking_num.toLowerCase().includes(searchLower)
        )
        
        return orderIdMatch || emegaTrackingMatch || originalTrackingMatch
      })
      
      allResults = allResults.concat(pageResults)
      
      // If we found results, we can stop searching
      if (allResults.length > 0) {
        console.log(`Found ${allResults.length} results on page ${page}`)
        break
      }
      
      // Continue to next page if no results found yet
      page++
      
      // Add a small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Sort results by date_created (most recent first)
    const sortedResults = allResults.sort((a, b) => {
      if (a.date_created && b.date_created) {
        return new Date(b.date_created) - new Date(a.date_created)
      }
      return 0
    })
    
    console.log(`Scanned ${totalScanned} records, found ${sortedResults.length} matches`)
    
    res.status(200).json({
      success: true,
      results: sortedResults.slice(0, 100), // Return max 100 results
      count: sortedResults.length,
      query: query,
      totalScanned: totalScanned,
      message: sortedResults.length === 0 
        ? `No results found after scanning ${totalScanned} records. The record might be on a later page.`
        : sortedResults.length > 100 
          ? `Showing first 100 of ${sortedResults.length} results` 
          : null
    })
    
  } catch (error) {
    console.error('Search error:', error)
    res.status(500).json({ 
      error: 'Failed to search tracking data',
      message: error.message,
      query: query
    })
  }
}