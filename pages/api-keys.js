// pages/api-keys.js
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function ApiKeysPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null)
  
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
      await loadApiKeys(session.user.id)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  const loadApiKeys = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setApiKeys(data || [])
    } catch (error) {
      console.error('Error loading API keys:', error)
      addNotification('Failed to load API keys', 'error')
    }
  }

  const generateApiKey = () => {
    return 'emega_' + [...Array(32)].map(() => 
      Math.random().toString(36)[2]).join('')
  }

  const handleCreateKey = async (e) => {
    e.preventDefault()
    
    try {
      const newKey = generateApiKey()
      
      const { error } = await supabase
        .from('api_keys')
        .insert({
          user_id: session.user.id,
          key: newKey,
          name: keyName
        })

      if (error) throw error

      setNewlyCreatedKey(newKey)
      setKeyName('')
      addNotification('API key created successfully', 'success')
      await loadApiKeys(session.user.id)
    } catch (error) {
      addNotification('Failed to create API key', 'error')
    }
  }

  const handleDeleteKey = async (id) => {
    if (!confirm('Delete this API key? This cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      addNotification('API key deleted', 'success')
      await loadApiKeys(session.user.id)
    } catch (error) {
      addNotification('Failed to delete API key', 'error')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    addNotification('Copied to clipboard', 'success')
  }

  const addNotification = (message, type = 'info') => {
    const notification = { id: Date.now(), message, type }
    setNotifications(prev => [notification, ...prev.slice(0, 4)])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="api-keys">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="api-keys">
      <div className="h-full bg-gray-50">
        {/* Toast Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div key={notification.id} className={`p-3 rounded-lg shadow-lg border ${
                notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">API Keys</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Manage API keys for accessing your affiliate products
                </p>
              </div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Create API Key
              </button>
            </div>
          </div>

          {/* API Documentation */}
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">API Endpoint</h3>
            <code className="text-sm text-blue-800 bg-blue-100 px-3 py-1 rounded block">
              GET {window.location.origin}/api/public/affiliate-products
            </code>
            <div className="mt-3 text-sm text-blue-800">
              <p className="font-medium mb-1">Query Parameters:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><code>apiKey</code> (required) - Your API key</li>
                <li><code>storeName</code> (optional) - Filter by store name</li>
                <li><code>sku</code> (optional) - Filter by product SKU</li>
              </ul>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium text-blue-900 mb-1">Example:</p>
              <code className="text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded block break-all">
                {window.location.origin}/api/public/affiliate-products?apiKey=YOUR_KEY&storeName=Petacular
              </code>
            </div>
          </div>

          {/* API Keys List */}
          <div className="p-6">
            {apiKeys.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <p className="text-sm text-gray-500">No API keys created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-gray-900">{key.name}</h3>
                          {key.is_active ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
                            {key.key.substring(0, 20)}...
                          </code>
                          <button
                            onClick={() => copyToClipboard(key.key)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Created {new Date(key.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Key Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Create API Key</h3>
              </div>
              {newlyCreatedKey ? (
                <div className="p-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800 font-medium mb-2">
                      Save this key now! You won't be able to see it again.
                    </p>
                    <code className="text-sm bg-white px-3 py-2 rounded block break-all border border-yellow-300">
                      {newlyCreatedKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      className="mt-3 w-full px-4 py-2 text-sm font-medium text-yellow-700 bg-yellow-100 rounded hover:bg-yellow-200"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateModal(false)
                      setNewlyCreatedKey(null)
                    }}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateKey} className="p-6">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Key Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g., Website Integration"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                    >
                      Create Key
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}