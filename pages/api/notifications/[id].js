// pages/api/notifications/[id].js - Fixed with correct Supabase import
import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  try {
    switch (req.method) {
      case 'GET':
        return await getNotification(req, res, id)
      case 'PUT':
        return await updateNotification(req, res, id)
      case 'DELETE':
        return await deleteNotification(req, res, id)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Notification API Error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

async function getNotification(req, res, id) {
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      user_notifications (
        id,
        user_id,
        delivered_at,
        read_at,
        clicked_at,
        dismissed_at
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Notification not found' })
    }
    throw error
  }

  return res.status(200).json({
    success: true,
    notification: data
  })
}

async function updateNotification(req, res, id) {
  const {
    title,
    message,
    type,
    image_url,
    action_type,
    action_value,
    scheduled_at,
    expires_at,
    status,
    send_immediately = false,
    resend_notification = false
  } = req.body

  // Get the existing notification first
  const { data: existingNotification, error: fetchError } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return res.status(404).json({ error: 'Notification not found' })
    }
    throw fetchError
  }

  const updateData = {
    updated_at: new Date().toISOString()
  }

  // Only update fields that are provided
  if (title !== undefined) updateData.title = title
  if (message !== undefined) updateData.message = message
  if (type !== undefined) updateData.type = type
  if (image_url !== undefined) updateData.image_url = image_url
  if (action_type !== undefined) updateData.action_type = action_type
  if (action_value !== undefined) updateData.action_value = action_value
  if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at
  if (expires_at !== undefined) updateData.expires_at = expires_at
  if (status !== undefined) updateData.status = status

  // Handle immediate sending or resending
  if (send_immediately || resend_notification) {
    updateData.status = 'sent'
    updateData.sent_at = new Date().toISOString()
    
    // If this is a resend, clear previous user notifications
    if (resend_notification && existingNotification.status === 'sent') {
      console.log(`Resending notification ${id} - clearing previous user notifications`)
      
      // Delete existing user notifications for this notification
      const { error: deleteError } = await supabase
        .from('user_notifications')
        .delete()
        .eq('notification_id', id)

      if (deleteError) {
        console.warn('Error deleting previous user notifications:', deleteError)
      } else {
        console.log('Previous user notifications cleared successfully')
      }
    }
  }

  // Update the notification
  const { data, error } = await supabase
    .from('notifications')
    .update(updateData)
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Notification not found' })
  }

  const updatedNotification = data[0]

  // Process and send the notification if required
  if (send_immediately || resend_notification) {
    try {
      console.log(`Processing notification ${id} for ${send_immediately ? 'immediate send' : 'resend'}`)
      await processNotification(id)
      
      return res.status(200).json({
        success: true,
        notification: updatedNotification,
        message: send_immediately 
          ? 'Notification updated and sent successfully' 
          : 'Notification updated and resent successfully',
        action: send_immediately ? 'sent' : 'resent'
      })
    } catch (processError) {
      console.error('Error processing notification:', processError)
      
      // Revert status if processing failed
      await supabase
        .from('notifications')
        .update({ 
          status: existingNotification.status,
          sent_at: existingNotification.sent_at 
        })
        .eq('id', id)
      
      return res.status(500).json({
        error: 'Notification updated but failed to send',
        message: processError.message,
        notification: updatedNotification
      })
    }
  }

  return res.status(200).json({
    success: true,
    notification: updatedNotification,
    message: 'Notification updated successfully'
  })
}

async function deleteNotification(req, res, id) {
  // Check if notification can be deleted
  const { data: notification, error: checkError } = await supabase
    .from('notifications')
    .select('status, title')
    .eq('id', id)
    .single()

  if (checkError) {
    if (checkError.code === 'PGRST116') {
      return res.status(404).json({ error: 'Notification not found' })
    }
    throw checkError
  }

  // Allow deletion but warn about sent notifications
  if (notification.status === 'sent') {
    console.log(`Warning: Deleting sent notification "${notification.title}" (ID: ${id})`)
  }

  // Delete associated user notifications first
  await supabase
    .from('user_notifications')
    .delete()
    .eq('notification_id', id)

  // Delete the notification
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  return res.status(200).json({
    success: true,
    message: 'Notification deleted successfully'
  })
}

// Enhanced function to process and send notifications
async function processNotification(notificationId) {
  try {
    console.log(`🚀 Processing notification ${notificationId}`)
    
    // Get notification details
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (notificationError || !notification) {
      throw new Error('Notification not found')
    }

    // Get target users and their push tokens
    let targetUsers = []
    
    if (notification.target_type === 'all') {
      // Get all active devices with push tokens
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('user_id, device_token, platform')
        .eq('is_active', true)
        .eq('push_enabled', true)
        .not('device_token', 'is', null)

      if (!devicesError && devices) {
        targetUsers = devices
      }
    } else if (notification.target_type === 'user' && notification.target_users) {
      // Get devices for specific users
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('user_id, device_token, platform')
        .in('user_id', notification.target_users)
        .eq('is_active', true)
        .eq('push_enabled', true)
        .not('device_token', 'is', null)

      if (!devicesError && devices) {
        targetUsers = devices
      }
    }

    console.log(`📱 Found ${targetUsers.length} target devices for notification`)

    // Create user_notifications records
    const uniqueUserIds = [...new Set(targetUsers.map(d => d.user_id))]
    const userNotifications = uniqueUserIds.map(userId => ({
      notification_id: notificationId,
      user_id: userId,
      delivered_at: new Date().toISOString()
    }))

    if (userNotifications.length > 0) {
      const { error: insertError } = await supabase
        .from('user_notifications')
        .upsert(userNotifications, {
          onConflict: 'notification_id,user_id'
        })

      if (insertError) {
        console.error('Error creating user notifications:', insertError)
      } else {
        console.log(`📝 Created ${userNotifications.length} user notification records`)
      }
    }

    // Send push notifications via Expo
    const pushResults = await sendExpoPushNotifications(notification, targetUsers)

    // Update notification status and counts
    const { error: updateError } = await supabase
      .from('notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        total_sent: uniqueUserIds.length,
        total_delivered: pushResults.successful
      })
      .eq('id', notificationId)

    if (updateError) {
      console.error('Error updating notification stats:', updateError)
    }

    // Trigger real-time notification for in-app updates
    await triggerRealTimeNotification(notification, uniqueUserIds)

    console.log(`✅ Notification ${notificationId} processed - ${pushResults.successful}/${targetUsers.length} sent successfully`)

    return {
      success: true,
      totalUsers: uniqueUserIds.length,
      totalDevices: targetUsers.length,
      successful: pushResults.successful,
      failed: pushResults.failed
    }

  } catch (error) {
    console.error('❌ Process notification error:', error)
    
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

// Function to send push notifications via Expo
async function sendExpoPushNotifications(notification, targetUsers) {
  const expoPushTokens = targetUsers
    .map(user => user.device_token)
    .filter(token => token && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')))

  console.log(`📬 Sending to ${expoPushTokens.length} Expo push tokens`)

  if (expoPushTokens.length === 0) {
    console.log('⚠️ No valid Expo push tokens found')
    return { successful: 0, failed: 0 }
  }

  // Prepare push notification messages
  const messages = expoPushTokens.map(token => ({
    to: token,
    sound: 'default',
    title: notification.title,
    body: notification.message,
    data: {
      id: notification.id,
      type: notification.type || 'info',
      action_type: notification.action_type || 'none',
      action_value: notification.action_value,
      image_url: notification.image_url,
      sent_at: new Date().toISOString()
    },
    priority: 'high',
    channelId: 'default',
    badge: 1,
  }))

  // Split into chunks of 100 (Expo's limit)
  const chunks = []
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100))
  }

  let successful = 0
  let failed = 0

  // Send each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      console.log(`📤 Sending chunk ${i + 1}/${chunks.length} (${chunk.length} messages)`)
      
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      const result = await response.json()
      
      if (result.data) {
        result.data.forEach(item => {
          if (item.status === 'ok') {
            successful++
          } else {
            failed++
            console.error('❌ Push notification failed:', item)
          }
        })
      }
    } catch (error) {
      console.error('❌ Error sending push notification chunk:', error)
      failed += chunk.length
    }
  }

  console.log(`📊 Push notifications result: ${successful} successful, ${failed} failed`)
  return { successful, failed }
}

// Enhanced real-time notification broadcasting
async function triggerRealTimeNotification(notification, userIds) {
  try {
    console.log('📡 Broadcasting real-time notification to apps...')

    const notificationPayload = {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      image_url: notification.image_url,
      action_type: notification.action_type || 'none',
      action_value: notification.action_value,
      target_users: userIds,
      sent_at: new Date().toISOString(),
      created_at: notification.created_at
    }

    // Use the regular supabase client for realtime
    const channel = supabase.channel(`notifications-${Date.now()}`)
    
    const result = await channel.send({
      type: 'broadcast',
      event: 'new_notification',
      payload: notificationPayload
    })

    if (result === 'ok') {
      console.log('✅ Real-time broadcast sent successfully')
    } else {
      console.warn('⚠️ Real-time broadcast failed:', result)
    }
    
    await supabase.removeChannel(channel)
    
    console.log('📡 Real-time broadcasting completed')
    
  } catch (error) {
    console.error('❌ Trigger real-time notification error:', error)
  }
}