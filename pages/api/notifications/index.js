// pages/api/notifications/index.js
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET':
        return await getNotifications(req, res)
      case 'POST':
        return await createNotification(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Notifications API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getNotifications(req, res) {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    type,
    sort_by = 'created_at',
    sort_order = 'desc'
  } = req.query

  let query = supabase
    .from('notifications')
    .select(`
      *,
      total_sent,
      total_delivered,
      total_opened,
      total_clicked
    `, { count: 'exact' })

  // Add filters
  if (status) {
    query = query.eq('status', status)
  }

  if (type) {
    query = query.eq('type', type)
  }

  // Add sorting
  query = query.order(sort_by, { ascending: sort_order === 'asc' })

  // Add pagination
  const from = (parseInt(page) - 1) * parseInt(limit)
  const to = from + parseInt(limit) - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  return res.status(200).json({
    success: true,
    notifications: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      pages: Math.ceil((count || 0) / parseInt(limit))
    }
  })
}

async function createNotification(req, res) {
  const {
    title,
    message,
    type = 'info',
    target_type = 'all',
    target_users = [],
    image_url,
    action_type = 'none',
    action_value,
    scheduled_at,
    expires_at,
    send_immediately = false
  } = req.body

  if (!title || !message) {
    return res.status(400).json({ 
      error: 'Missing required fields', 
      required: ['title', 'message'] 
    })
  }

  // Validate type
  const validTypes = ['info', 'success', 'warning', 'error', 'promotional']
  if (!validTypes.includes(type)) {
    return res.status(400).json({ 
      error: 'Invalid notification type',
      valid_types: validTypes
    })
  }

  // Validate target_type
  const validTargetTypes = ['all', 'user', 'segment']
  if (!validTargetTypes.includes(target_type)) {
    return res.status(400).json({ 
      error: 'Invalid target type',
      valid_target_types: validTargetTypes
    })
  }

  try {
    const notificationData = {
      title,
      message,
      type,
      target_type,
      target_users: target_type === 'user' ? target_users : null,
      image_url,
      action_type,
      action_value,
      scheduled_at: scheduled_at || (send_immediately ? null : new Date().toISOString()),
      expires_at,
      status: send_immediately ? 'sent' : (scheduled_at ? 'scheduled' : 'draft'),
      created_by: 'admin',
      sent_at: send_immediately ? new Date().toISOString() : null
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([notificationData])
      .select()

    if (error) {
      throw error
    }

    const notification = data[0]

    // If sending immediately, process the notification
    if (send_immediately) {
      try {
        await processNotification(notification.id)
      } catch (processError) {
        console.error('Error processing immediate notification:', processError)
      }
    }

    return res.status(201).json({
      success: true,
      notification: notification,
      message: send_immediately ? 'Notification sent successfully' : 'Notification created successfully'
    })

  } catch (error) {
    console.error('Create notification error:', error)
    throw error
  }
}

// Function to process and send notifications
async function processNotification(notificationId) {
  try {
    // Get notification details
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (notificationError || !notification) {
      throw new Error('Notification not found')
    }

    // Get target users based on target_type
    let targetUserIds = []
    
    if (notification.target_type === 'all') {
      // Get all active device tokens (representing active users)
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('user_id')
        .eq('is_active', true)

      if (!devicesError && devices) {
        targetUserIds = [...new Set(devices.map(d => d.user_id))]
      }
    } else if (notification.target_type === 'user' && notification.target_users) {
      targetUserIds = notification.target_users
    }

    console.log(`Processing notification ${notificationId} for ${targetUserIds.length} users`)

    // Create user_notifications records
    const userNotifications = targetUserIds.map(userId => ({
      notification_id: notificationId,
      user_id: userId
    }))

    if (userNotifications.length > 0) {
      const { error: insertError } = await supabase
        .from('user_notifications')
        .insert(userNotifications)

      if (insertError) {
        console.error('Error creating user notifications:', insertError)
      }
    }

    // Update notification status and counts
    await supabase
      .from('notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        total_sent: targetUserIds.length
      })
      .eq('id', notificationId)

    // Trigger real-time notification to React Native apps
    await triggerRealTimeNotification(notification, targetUserIds)

    console.log(`Notification ${notificationId} processed successfully`)

  } catch (error) {
    console.error('Process notification error:', error)
    
    // Update notification status to indicate error
    await supabase
      .from('notifications')
      .update({
        status: 'draft'
      })
      .eq('id', notificationId)
    
    throw error
  }
}

// Function to trigger real-time notifications
async function triggerRealTimeNotification(notification, userIds) {
  try {
    // Use Supabase realtime to broadcast notification
    const { error } = await supabase
      .channel('notifications')
      .send({
        type: 'broadcast',
        event: 'new_notification',
        payload: {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          image_url: notification.image_url,
          action_type: notification.action_type,
          action_value: notification.action_value,
          target_users: userIds,
          sent_at: new Date().toISOString()
        }
      })

    if (error) {
      console.error('Real-time broadcast error:', error)
    } else {
      console.log('Real-time notification broadcasted')
    }
  } catch (error) {
    console.error('Trigger real-time notification error:', error)
  }
}