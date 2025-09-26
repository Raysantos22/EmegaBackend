// components/NotificationCenter.js - Real-time notification component
import { useState, useEffect } from 'react'

export default function NotificationCenter({ supabase, session }) {
  const [notifications, setNotifications] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('24h')

  useEffect(() => {
    if (session?.user?.id) {
      loadNotifications()
      
      // Refresh notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000)
      return () => clearInterval(interval)
    }
  }, [session?.user?.id, timeframe])

  const loadNotifications = async () => {
    try {
      const response = await fetch(`/api/notifications/update-summary?timeframe=${timeframe}&limit=20`)
      const data = await response.json()
      
      if (data.success) {
        setNotifications(data.notifications)
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const getNotificationIcon = (type, category) => {
    if (category === 'update') {
      return type === 'success' ? '✅' : type === 'error' ? '❌' : '🔄'
    } else if (category === 'import') {
      return type === 'success' ? '📥' : type === 'error' ? '❌' : '📤'
    }
    return '📋'
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.floor((now - date) / 1000 / 60)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Updates Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Product Updates</h3>
                <div className="mt-2 flex items-baseline">
                  <span className="text-2xl font-semibold text-gray-900">
                    {summary.updates.totalProductsChecked.toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">checked</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600">🔄</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <span className="text-green-600 font-medium">
                  {summary.updates.totalPriceChanges} updated
                </span>
                <span className="mx-2 text-gray-500">•</span>
                <span className="text-gray-600">
                  {summary.updates.successRate}% success rate
                </span>
              </div>
              {summary.updates.runningBatches > 0 && (
                <div className="mt-2 text-sm text-blue-600">
                  {summary.updates.runningBatches} update{summary.updates.runningBatches > 1 ? 's' : ''} running
                </div>
              )}
            </div>
          </div>

          {/* Imports Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-500">CSV Imports</h3>
                <div className="mt-2 flex items-baseline">
                  <span className="text-2xl font-semibold text-gray-900">
                    {(summary.imports.totalImported + summary.imports.totalUpdated).toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">products</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600">📥</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <span className="text-green-600 font-medium">
                  {summary.imports.totalImported} new
                </span>
                <span className="mx-2 text-gray-500">•</span>
                <span className="text-blue-600 font-medium">
                  {summary.imports.totalUpdated} updated
                </span>
              </div>
              {summary.imports.runningImports > 0 && (
                <div className="mt-2 text-sm text-blue-600">
                  {summary.imports.runningImports} import{summary.imports.runningImports > 1 ? 's' : ''} running
                </div>
              )}
            </div>
          </div>

          {/* Overall Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Total Activity</h3>
                <div className="mt-2 flex items-baseline">
                  <span className="text-2xl font-semibold text-gray-900">
                    {summary.overall.totalActivities}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">operations</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-purple-600">📊</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center text-sm">
                <span className="text-green-600 font-medium">
                  {summary.overall.totalProductsProcessed.toLocaleString()} processed
                </span>
                {summary.overall.totalErrors > 0 && (
                  <>
                    <span className="mx-2 text-gray-500">•</span>
                    <span className="text-red-600 font-medium">
                      {summary.overall.totalErrors} errors
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Panel */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1 bg-white"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last Week</option>
              <option value="30d">Last Month</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-gray-400">📋</span>
              </div>
              <p className="text-gray-500">No recent activity in the selected timeframe</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div key={notification.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className="text-lg">
                      {getNotificationIcon(notification.type, notification.category)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      notification.type === 'error' ? 'text-red-800' :
                      notification.type === 'success' ? 'text-green-800' :
                      'text-gray-800'
                    }`}>
                      {notification.message}
                    </p>
                    <div className="mt-1 flex items-center text-xs text-gray-500 space-x-4">
                      <span>{formatTimestamp(notification.timestamp)}</span>
                      {notification.details && (
                        <>
                          {notification.details.duration && (
                            <span>Duration: {notification.details.duration}min</span>
                          )}
                          {notification.category === 'update' && notification.details.updated > 0 && (
                            <span className="text-green-600">
                              {notification.details.updated} price changes
                            </span>
                          )}
                          {notification.category === 'import' && (
                            <span className="text-blue-600">
                              {notification.details.imported + notification.details.updated} products
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {!notification.completed && (
                    <div className="flex-shrink-0">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

