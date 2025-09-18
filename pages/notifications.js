// pages/notifications.js - Enhanced Notification Management with Resend
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'

export default function NotificationManagement() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingNotification, setEditingNotification] = useState(null)
  const [session, setSession] = useState(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  })
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    target_type: 'all',
    target_users: [],
    image_url: '',
    action_type: 'none',
    action_value: '',
    scheduled_at: '',
    expires_at: '',
    send_immediately: false,
    resend_notification: false
  })

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
    }
  }, [router])

  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        sort_by: 'created_at',
        sort_order: 'desc'
      })

      const response = await fetch(`/api/notifications?${params}`)
      const result = await response.json()
      
      if (result.success) {
        setNotifications(result.notifications)
        setPagination(result.pagination)
      } else {
        console.error('Failed to fetch notifications:', result.error)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.limit])

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/analytics')
      const result = await response.json()
      
      if (result.success) {
        setAnalytics(result.analytics)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }, [])

  useEffect(() => {
    checkUser()
    fetchNotifications()
    fetchAnalytics()
  }, [checkUser, fetchNotifications, fetchAnalytics])

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      type: 'info',
      target_type: 'all',
      target_users: [],
      image_url: '',
      action_type: 'none',
      action_value: '',
      scheduled_at: '',
      expires_at: '',
      send_immediately: false,
      resend_notification: false
    })
    setEditingNotification(null)
    setShowModal(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitLoading(true)

    try {
      const url = editingNotification ? `/api/notifications/${editingNotification.id}` : '/api/notifications'
      const method = editingNotification ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        resetForm()
        fetchNotifications(pagination.page)
        fetchAnalytics()
        
        let message = 'Notification saved successfully!'
        if (result.action === 'sent') {
          message = 'Notification sent successfully!'
        } else if (result.action === 'resent') {
          message = 'Notification resent successfully!'
        }
        
        showNotification(message, 'success')
      } else {
        showNotification('Error saving notification: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error saving notification:', error)
      showNotification('Error saving notification: ' + error.message, 'error')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleEdit = (notification) => {
    setEditingNotification(notification)
    setFormData({
      title: notification.title || '',
      message: notification.message || '',
      type: notification.type || 'info',
      target_type: notification.target_type || 'all',
      target_users: notification.target_users || [],
      image_url: notification.image_url || '',
      action_type: notification.action_type || 'none',
      action_value: notification.action_value || '',
      scheduled_at: notification.scheduled_at ? notification.scheduled_at.split('T')[0] : '',
      expires_at: notification.expires_at ? notification.expires_at.split('T')[0] : '',
      send_immediately: false,
      resend_notification: false
    })
    setShowModal(true)
  }

  const handleDelete = async (notificationId) => {
    if (!confirm('Are you sure you want to delete this notification?')) return

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        fetchNotifications(pagination.page)
        fetchAnalytics()
        showNotification('Notification deleted successfully!', 'success')
      } else {
        showNotification('Error deleting notification: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
      showNotification('Error deleting notification: ' + error.message, 'error')
    }
  }

  const handleSendNow = async (notificationId) => {
    if (!confirm('Are you sure you want to send this notification now?')) return

    try {
      const response = await fetch(`/api/notifications/send/${notificationId}`, {
        method: 'POST',
      })

      const result = await response.json()

      if (result.success) {
        fetchNotifications(pagination.page)
        fetchAnalytics()
        showNotification('Notification sent successfully!', 'success')
      } else {
        showNotification('Error sending notification: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error sending notification:', error)
      showNotification('Error sending notification: ' + error.message, 'error')
    }
  }

  const handleResend = async (notification) => {
    const confirmMessage = `Are you sure you want to resend "${notification.title}"? This will send the notification again to all target users.`
    if (!confirm(confirmMessage)) return

    try {
      setSubmitLoading(true)
      
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...notification,
          resend_notification: true
        }),
      })

      const result = await response.json()

      if (result.success) {
        fetchNotifications(pagination.page)
        fetchAnalytics()
        showNotification('Notification resent successfully!', 'success')
      } else {
        showNotification('Error resending notification: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error resending notification:', error)
      showNotification('Error resending notification: ' + error.message, 'error')
    } finally {
      setSubmitLoading(false)
    }
  }

  const showNotification = (message, type) => {
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`
    notification.textContent = message
    document.body.appendChild(notification)
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification)
      }
    }, 3000)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800'
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'draft': return 'bg-gray-100 text-gray-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800'
      case 'warning': return 'bg-yellow-100 text-yellow-800'
      case 'error': return 'bg-red-100 text-red-800'
      case 'promotional': return 'bg-purple-100 text-purple-800'
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  if (loading && !notifications.length) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="notifications">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="notifications">
      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Sent</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.summary.sent || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Delivery Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.summary.delivery_rate || 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Open Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.summary.open_rate || 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Click Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.summary.click_rate || 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white shadow-lg rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Notification Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                Send push notifications and manage user communications
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Create Notification</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white shadow-lg rounded-lg">
        <div className="px-6 py-4">
          {notifications.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900">No notifications found</h3>
              <p className="mt-2 text-sm text-gray-500">Get started by creating your first notification.</p>
              <div className="mt-8">
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all duration-200"
                >
                  Create First Notification
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notification
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent/Scheduled
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stats
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <tr key={notification.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {notification.image_url ? (
                              <img
                                className="h-10 w-10 rounded-full object-cover"
                                src={notification.image_url}
                                alt="Notification"
                                onError={(e) => {
                                  e.target.src = 'https://via.placeholder.com/40x40/f0f0f0/999999?text=N'
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {notification.title}
                            </div>
                            <div className="text-sm text-gray-500 max-w-xs truncate">
                              {notification.message}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(notification.status)}`}>
                          {notification.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(notification.type)}`}>
                          {notification.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {notification.sent_at 
                          ? new Date(notification.sent_at).toLocaleDateString()
                          : notification.scheduled_at 
                            ? new Date(notification.scheduled_at).toLocaleDateString()
                            : 'Not scheduled'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="text-xs">
                          <div>Sent: {notification.total_sent || 0}</div>
                          <div>Delivered: {notification.total_delivered || 0}</div>
                          <div>Opened: {notification.total_opened || 0}</div>
                          <div>Clicked: {notification.total_clicked || 0}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex space-x-2">
                          {notification.status !== 'sent' && (
                            <button
                              onClick={() => handleSendNow(notification.id)}
                              className="text-green-600 hover:text-green-900 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                              title="Send Now"
                            >
                              Send
                            </button>
                          )}
                          {notification.status === 'sent' && (
                            <button
                              onClick={() => handleResend(notification)}
                              disabled={submitLoading}
                              className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                              title="Resend Notification"
                            >
                              {submitLoading ? 'Sending...' : 'Resend'}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(notification)}
                            className="text-red-600 hover:text-red-900 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="text-gray-600 hover:text-red-900 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-700">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total notifications)
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => fetchNotifications(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchNotifications(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingNotification ? 'Edit Notification' : 'Create New Notification'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Title *</label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      placeholder="Enter notification title"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Message *</label>
                    <textarea
                      required
                      rows="3"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                      placeholder="Enter notification message"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                    >
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="promotional">Promotional</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Target</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.target_type}
                      onChange={(e) => setFormData({...formData, target_type: e.target.value})}
                    >
                      <option value="all">All Users</option>
                      <option value="user">Specific Users</option>
                      <option value="segment">User Segment</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Image URL (Optional)</label>
                    <input
                      type="url"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.image_url}
                      onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Action Type</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.action_type}
                      onChange={(e) => setFormData({...formData, action_type: e.target.value})}
                    >
                      <option value="none">No Action</option>
                      <option value="url">Open URL</option>
                      <option value="screen">Open Screen</option>
                      <option value="product">View Product</option>
                      <option value="category">View Category</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Action Value</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.action_value}
                      onChange={(e) => setFormData({...formData, action_value: e.target.value})}
                      placeholder="URL, screen name, product ID, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Schedule Date (Optional)</label>
                    <input
                      type="datetime-local"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.scheduled_at}
                      onChange={(e) => setFormData({...formData, scheduled_at: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Expiry Date (Optional)</label>
                    <input
                      type="datetime-local"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                      value={formData.expires_at}
                      onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        checked={formData.send_immediately}
                        onChange={(e) => setFormData({...formData, send_immediately: e.target.checked})}
                      />
                      <span className="ml-2 text-sm text-gray-700">Send immediately after creation</span>
                    </label>
                  </div>

                  {editingNotification && editingNotification.status === 'sent' && (
                    <div className="md:col-span-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.resend_notification}
                          onChange={(e) => setFormData({...formData, resend_notification: e.target.checked})}
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Resend this notification (will send again to all target users)
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-4 mt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitLoading ? 'Processing...' : (editingNotification ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}