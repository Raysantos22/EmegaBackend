// pages/api/notifications/analytics.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get overall statistics
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')

    if (notificationsError) {
      throw notificationsError
    }

    // Process status counts
    const statusSummary = notifications.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    // Calculate overall stats
    const totalSent = notifications.filter(n => n.status === 'sent').length
    const totalDelivered = notifications.reduce((sum, n) => sum + (n.total_delivered || 0), 0)
    const totalOpened = notifications.reduce((sum, n) => sum + (n.total_opened || 0), 0)
    const totalClicked = notifications.reduce((sum, n) => sum + (n.total_clicked || 0), 0)
    const totalNotificationsSent = notifications.reduce((sum, n) => sum + (n.total_sent || 0), 0)

    // Calculate rates
    const deliveryRate = totalNotificationsSent > 0 ? ((totalDelivered / totalNotificationsSent) * 100).toFixed(2) : 0
    const openRate = totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(2) : 0
    const clickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(2) : 0

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentActivity = notifications.filter(n => 
      new Date(n.created_at) >= thirtyDaysAgo
    ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // Get detailed stats for sent notifications
    const detailedStats = notifications
      .filter(n => n.status === 'sent')
      .map(n => ({
        id: n.id,
        title: n.title,
        type: n.type,
        status: n.status,
        created_at: n.created_at,
        sent_at: n.sent_at,
        total_sent: n.total_sent || 0,
        total_delivered: n.total_delivered || 0,
        total_opened: n.total_opened || 0,
        total_clicked: n.total_clicked || 0,
        delivery_rate: n.total_sent > 0 ? ((n.total_delivered / n.total_sent) * 100).toFixed(2) : 0,
        open_rate: n.total_delivered > 0 ? ((n.total_opened / n.total_delivered) * 100).toFixed(2) : 0,
        click_rate: n.total_opened > 0 ? ((n.total_clicked / n.total_opened) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return res.status(200).json({
      success: true,
      analytics: {
        summary: {
          ...statusSummary,
          total_notifications: notifications.length,
          total_sent: totalSent,
          total_delivered: totalDelivered,
          total_opened: totalOpened,
          total_clicked: totalClicked,
          delivery_rate: parseFloat(deliveryRate),
          open_rate: parseFloat(openRate),
          click_rate: parseFloat(clickRate)
        },
        detailed_stats: detailedStats,
        recent_activity: recentActivity.slice(0, 20) // Last 20 activities
      }
    })

  } catch (error) {
    console.error('Analytics error:', error)
    return res.status(500).json({ 
      error: 'Failed to get analytics',
      message: error.message 
    })
  }
}