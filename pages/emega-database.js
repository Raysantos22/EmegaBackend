// pages/emega-database.js
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/router'
import DashboardLayout from '../components/DashboardLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function EmegaDatabasePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [tableData, setTableData] = useState([])
  const [tableStructure, setTableStructure] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [trackingSearchTerm, setTrackingSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [itemsPerPage] = useState(10)
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState('asc')
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [isTrackingSearch, setIsTrackingSearch] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [showTrackingModal, setShowTrackingModal] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchTables()
  }, [])

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setSession(session)
      }
    } catch (error) {
      console.error('Auth error:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTables() {
    try {
      const response = await fetch('/api/emega/get-tables')
      if (response.ok) {
        const data = await response.json()
        setTables(data.tables || [])
      } else {
        const phpResponse = await fetch('https://track.emega.com.au/api/emega/get-tables.php')
        if (phpResponse.ok) {
          const phpData = await phpResponse.json()
          setTables(phpData.tables || [])
        } else {
          setError('Failed to fetch tables')
        }
      }
    } catch (error) {
      console.error('Error fetching tables:', error)
      setError('Failed to fetch database tables')
    }
  }

  async function fetchTableData(tableName) {
    if (!tableName) return
    
    setIsLoadingData(true)
    setError('')
    
    try {
      let structureData, tableDataResponse
      
      try {
        const structureResponse = await fetch(
          `/api/emega/table-structure?table=${encodeURIComponent(tableName)}`
        )
        if (structureResponse.ok) {
          structureData = await structureResponse.json()
        }
      } catch {
        const phpStructureResponse = await fetch(
          `https://track.emega.com.au/api/emega/table-structure.php?table=${encodeURIComponent(tableName)}`
        )
        if (phpStructureResponse.ok) {
          structureData = await phpStructureResponse.json()
        }
      }
      
      if (structureData) {
        setTableStructure(structureData.structure || [])
      }

      try {
        const dataResponse = await fetch(
          `/api/emega/table-data?table=${encodeURIComponent(tableName)}&page=${currentPage}&limit=${itemsPerPage}`
        )
        if (dataResponse.ok) {
          tableDataResponse = await dataResponse.json()
        }
      } catch {
        const phpDataResponse = await fetch(
          `https://track.emega.com.au/api/emega/table-data.php?table=${encodeURIComponent(tableName)}&page=${currentPage}&limit=${itemsPerPage}`
        )
        if (phpDataResponse.ok) {
          tableDataResponse = await phpDataResponse.json()
        }
      }
      
      if (tableDataResponse) {
        setTableData(tableDataResponse.rows || [])
        setTotalRecords(tableDataResponse.totalRecords || 0)
        setIsTrackingSearch(false)
      }
    } catch (error) {
      console.error('Error fetching table data:', error)
      setError('Failed to fetch table data')
    } finally {
      setIsLoadingData(false)
    }
  }

  async function handleTrackingSearch() {
    if (!trackingSearchTerm.trim()) {
      setError('Please enter an Order ID or Tracking Number')
      return
    }

    setIsLoadingData(true)
    setError('')
    setIsTrackingSearch(true)
    
    try {
      if (tableStructure.length === 0 || selectedTable !== 'emega_tracking') {
        try {
          const structureResponse = await fetch(
            `/api/emega/table-structure?table=emega_tracking`
          )
          if (structureResponse.ok) {
            const structureData = await structureResponse.json()
            setTableStructure(structureData.structure || [])
          }
        } catch {
          const phpStructureResponse = await fetch(
            `https://track.emega.com.au/api/emega/table-structure.php?table=emega_tracking`
          )
          if (phpStructureResponse.ok) {
            const structureData = await phpStructureResponse.json()
            setTableStructure(structureData.structure || [])
          }
        }
      }

      const response = await fetch(
        `/api/emega/search-tracking?query=${encodeURIComponent(trackingSearchTerm.trim())}`
      )
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.success) {
          setTableData(data.results || [])
          setTotalRecords(data.count || 0)
          setSelectedTable('emega_tracking')
          
          if (data.count === 0) {
            setError(`No results found for &quot;${trackingSearchTerm}&quot;. Try searching with a different ID or tracking number.`)
          }
        } else {
          setError('Search failed. Please try again.')
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to search tracking data')
      }
    } catch (error) {
      console.error('Search error:', error)
      setError('Failed to search. Please check your connection and try again.')
    } finally {
      setIsLoadingData(false)
    }
  }

  function openTrackingModal(record) {
    setSelectedRecord(record)
    setShowTrackingModal(true)
  }

  useEffect(() => {
    if (selectedTable && !isTrackingSearch) {
      fetchTableData(selectedTable)
    }
  }, [selectedTable, currentPage])

  const filteredData = tableData.filter(row => {
    if (!searchTerm) return true
    return Object.values(row).some(value => 
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortField) return 0
    
    const aVal = a[sortField]
    const bVal = b[sortField]
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function getStatusBadge(row) {
    if (selectedTable !== 'emega_tracking') return null
    
    if (row.delivered === 1) {
      return { text: 'Delivered', color: 'bg-green-100 text-green-800' }
    } else if (row.forcedelivered === 1) {
      return { text: 'Force Delivered', color: 'bg-yellow-100 text-yellow-800' }
    } else if (row.adddelivered === 1) {
      return { text: 'Add. Delivered', color: 'bg-blue-100 text-blue-800' }
    } else if (row.isreturn === 1) {
      return { text: 'Return', color: 'bg-red-100 text-red-800' }
    } else {
      return { text: 'In Transit', color: 'bg-gray-100 text-gray-800' }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-red-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="emega-database">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Emega Database Viewer</h1>
              <p className="text-gray-500 mt-1">Browse and search your database tables</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <select
                value={selectedTable}
                onChange={(e) => {
                  setSelectedTable(e.target.value)
                  setCurrentPage(1)
                  setSearchTerm('')
                  setTrackingSearchTerm('')
                  setIsTrackingSearch(false)
                }}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
              >
                <option value="">Select a table</option>
                {tables.map(table => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>

              {selectedTable && (
                <input
                  type="text"
                  placeholder="Search in table..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 min-w-[200px]"
                />
              )}
            </div>
          </div>
        </div>

        {selectedTable === 'emega_tracking' && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-100 rounded-2xl shadow-lg p-6 border border-blue-200">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick Search by Order ID or Tracking Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., 22-13629-04676, EM0000000004, or DP221362904676"
                  value={trackingSearchTerm}
                  onChange={(e) => setTrackingSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleTrackingSearch()}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>
              <button
                onClick={handleTrackingSearch}
                disabled={isLoadingData || !trackingSearchTerm.trim()}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg flex items-center"
              >
                {isLoadingData ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </>
                )}
              </button>
              {isTrackingSearch && (
                <button
                  onClick={() => {
                    setTrackingSearchTerm('')
                    setIsTrackingSearch(false)
                    setError('')
                    fetchTableData('emega_tracking')
                  }}
                  className="px-6 py-2.5 bg-gray-500 text-white font-medium rounded-xl hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
                >
                  Clear Search
                </button>
              )}
            </div>
            {isTrackingSearch && totalRecords > 0 && (
              <p className="mt-3 text-sm text-blue-700">
                Found <span className="font-semibold">{totalRecords}</span> result{totalRecords !== 1 ? 's' : ''} for: <span className="font-semibold">&quot;{trackingSearchTerm}&quot;</span>
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {selectedTable && !isLoadingData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-sm font-medium">
                    {isTrackingSearch ? 'Search Results' : 'Total Records'}
                  </p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{totalRecords}</p>
                </div>
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 text-sm font-medium">Columns</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">{tableStructure.length}</p>
                </div>
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-600 text-sm font-medium">Current Table</p>
                  <p className="text-lg font-bold text-purple-900 mt-1 truncate">{selectedTable}</p>
                </div>
                <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {selectedTable && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
            {isLoadingData ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-red-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading table data...</p>
              </div>
            ) : sortedData.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <tr>
                        {tableStructure.map((column, index) => (
                          <th
                            key={index}
                            onClick={() => handleSort(column.Field)}
                            className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors duration-150"
                          >
                            <div className="flex items-center space-x-1">
                              <span>{column.Field}</span>
                              {sortField === column.Field && (
                                <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 font-normal">{column.Type}</span>
                          </th>
                        ))}
                        {selectedTable === 'emega_tracking' && (
                          <>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                              Actions
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sortedData.map((row, rowIndex) => {
                        const status = getStatusBadge(row)
                        return (
                          <tr key={rowIndex} className="hover:bg-gray-50 transition-colors duration-150">
                            {tableStructure.map((column, colIndex) => (
                              <td key={colIndex} className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                                {row[column.Field] !== null && row[column.Field] !== undefined ? String(row[column.Field]) : 
                                 <span className="text-gray-400 italic">NULL</span>}
                              </td>
                            ))}
                            {selectedTable === 'emega_tracking' && (
                              <>
                                <td className="px-6 py-4">
                                  {status && (
                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>
                                      {status.text}
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  {row.tracking_events ? (
                                    <button
                                      onClick={() => openTrackingModal(row)}
                                      className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                                    >
                                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      View Tracking
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 text-sm italic flex items-center">
                                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      No tracking data
                                    </span>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      {isTrackingSearch ? (
                        <span>Found {totalRecords} matching record(s)</span>
                      ) : (
                        <span>Showing page {currentPage} • Total: {totalRecords} records</span>
                      )}
                    </div>
                    {!isTrackingSearch && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={sortedData.length < itemsPerPage}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center">
                <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-4 text-gray-500">
                  {searchTerm ? 'No results found for your search' : 
                   isTrackingSearch ? 'No tracking records found for this query' : 
                   'No data found in this table'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tracking Status Modal */}
        {showTrackingModal && selectedRecord && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <h2 className="text-xl font-bold text-white">Tracking Status</h2>
                    <p className="text-yellow-100 text-sm">{selectedRecord.original_tracking_num || selectedRecord.emega_tracking_num}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="text-white hover:bg-yellow-600 rounded-lg p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Order Information */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Order Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Order ID</p>
                      <p className="font-medium text-gray-900">{selectedRecord.orderID || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Emega Tracking</p>
                      <p className="font-medium text-gray-900">{selectedRecord.emega_tracking_num || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Original Tracking</p>
                      <p className="font-medium text-gray-900">{selectedRecord.original_tracking_num || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Carrier</p>
                      <p className="font-medium text-gray-900">{selectedRecord.carrier || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Tracking Events */}
                {selectedRecord.tracking_events && selectedRecord.tracking_events.length > 0 ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Tracking History
                    </h3>
                    <div className="space-y-4">
                      {selectedRecord.tracking_events.map((event, index) => (
                        <div key={index} className="flex">
                          <div className="flex flex-col items-center mr-4">
                            <div className={`w-4 h-4 rounded-full ${index === 0 ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                            {index !== selectedRecord.tracking_events.length - 1 && (
                              <div className="w-0.5 h-full bg-gray-300 my-1"></div>
                            )}
                          </div>
                          <div className="flex-1 pb-6">
                            <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-gray-900">{event.description || 'Status Update'}</h4>
                                {index === 0 && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                                    Latest
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600 space-y-1 sm:space-y-0">
                                <div className="flex items-center">
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  {event.depot || 'Unknown Location'}
                                </div>
                                <div className="flex items-center">
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {event.time ? new Date(event.time).toLocaleString() : 'Unknown Time'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500">No tracking events available for this shipment</p>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="px-6 py-2.5 bg-gray-600 text-white font-medium rounded-xl hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}