// import { supabaseAdmin } from '../../../../lib/supabase'

// export default async function handler(req, res) {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' })
//   }

//   const { id } = req.query

//   try {
//     // Get notification using admin client
//     const { data: notification, error: notificationError } = await supabaseAdmin
//       .from('notifications')
//       .select('*')
//       .eq('id', id)
//       .single()

//     if (notificationError) {
//       if (notificationError.code === 'PGRST116') {
//         return res.status(404).json({ error: 'Notification not found' })
//       }
//       throw notificationError
//     }

//     // Check if notification can be sent
//     if (notification.status === 'sent') {
//       return res.status(400).json({ 
//         error: 'Notification already sent',
//         message: 'This notification has already been sent'
//       })
//     }

//     if (notification.status === 'cancelled') {
//       return res.status(400).json({ 
//         error: 'Notification cancelled',
//         message: 'This notification has been cancelled'
//       })
//     }

//     // Process the notification
//     await processNotification(id)

//     return res.status(200).json({
//       success: true,
//       message: 'Notification sent successfully'
//     })

//   } catch (error) {
//     console.error('Send notification error:', error)
//     return res.status(500).json({ 
//       error: 'Failed to send notification',
//       message: error.message 
//     })
//   }
// }

// // Enhanced function to process and send notifications
// async function processNotification(notificationId) {
//   try {
//     // Get notification details
//     const { data: notification, error: notificationError } = await supabaseAdmin
//       .from('notifications')
//       .select('*')
//       .eq('id', notificationId)
//       .single()

//     if (notificationError || !notification) {
//       throw new Error('Notification not found')
//     }

//     // Get target users and their push tokens
//     let targetUsers = []
    
//     if (notification.target_type === 'all') {
//       // Get all active devices with push tokens
//       const { data: devices, error: devicesError } = await supabaseAdmin
//         .from('user_devices')
//         .select('user_id, device_token, platform')
//         .eq('is_active', true)
//         .eq('push_enabled', true)
//         .not('device_token', 'is', null)

//       if (!devicesError && devices) {
//         targetUsers = devices
//       }
//     } else if (notification.target_type === 'user' && notification.target_users) {
//       // Get devices for specific users
//       const { data: devices, error: devicesError } = await supabaseAdmin
//         .from('user_devices')
//         .select('user_id, device_token, platform')
//         .in('user_id', notification.target_users)
//         .eq('is_active', true)
//         .eq('push_enabled', true)
//         .not('device_token', 'is', null)

//       if (!devicesError && devices) {
//         targetUsers = devices
//       }
//     }

//     console.log(`Processing notification ${notificationId} for ${targetUsers.length} devices`)

//     // Create user_notifications records
//     const uniqueUserIds = [...new Set(targetUsers.map(d => d.user_id))]
//     const userNotifications = uniqueUserIds.map(userId => ({
//       notification_id: notificationId,
//       user_id: userId,
//       delivered_at: new Date().toISOString()
//     }))

//     if (userNotifications.length > 0) {
//       const { error: insertError } = await supabaseAdmin
//         .from('user_notifications')
//         .upsert(userNotifications, {
//           onConflict: 'notification_id,user_id'
//         })

//       if (insertError) {
//         console.error('Error creating user notifications:', insertError)
//       } else {
//         console.log(`Created ${userNotifications.length} user notification records`)
//       }
//     }

//     // Send push notifications via Expo
//     const pushResults = await sendExpoPushNotifications(notification, targetUsers)

//     // Update notification status and counts
//     const { error: updateError } = await supabaseAdmin
//       .from('notifications')
//       .update({
//         status: 'sent',
//         sent_at: new Date().toISOString(),
//         total_sent: uniqueUserIds.length,
//         total_delivered: pushResults.successful
//       })
//       .eq('id', notificationId)

//     if (updateError) {
//       console.error('Error updating notification:', updateError)
//     }

//     // Trigger real-time notification for in-app updates
//     await triggerRealTimeNotification(notification, uniqueUserIds)

//     console.log(`Notification ${notificationId} processed successfully - ${pushResults.successful}/${targetUsers.length} sent`)

//   } catch (error) {
//     console.error('Process notification error:', error)
    
//     // Update notification status to indicate error
//     await supabaseAdmin
//       .from('notifications')
//       .update({
//         status: 'draft'
//       })
//       .eq('id', notificationId)
    
//     throw error
//   }
// }

// // Function to send push notifications via Expo
// async function sendExpoPushNotifications(notification, targetUsers) {
//   const expoPushTokens = targetUsers
//     .map(user => user.device_token)
//     .filter(token => token && token.startsWith('ExponentPushToken'))

//   if (expoPushTokens.length === 0) {
//     console.log('No valid Expo push tokens found')
//     return { successful: 0, failed: 0 }
//   }

//   // Prepare push notification messages
//   const messages = expoPushTokens.map(token => ({
//     to: token,
//     sound: 'default',
//     title: notification.title,
//     body: notification.message,
//     data: {
//       id: notification.id,
//       type: notification.type || 'info',
//       action_type: notification.action_type || 'none',
//       action_value: notification.action_value,
//       image_url: notification.image_url,
//       sent_at: new Date().toISOString()
//     },
//     priority: 'high',
//     channelId: 'default',
//   }))

//   // Split into chunks of 100 (Expo's limit)
//   const chunks = []
//   for (let i = 0; i < messages.length; i += 100) {
//     chunks.push(messages.slice(i, i + 100))
//   }

//   let successful = 0
//   let failed = 0

//   // Send each chunk
//   for (const chunk of chunks) {
//     try {
//       const response = await fetch('https://exp.host/--/api/v2/push/send', {
//         method: 'POST',
//         headers: {
//           Accept: 'application/json',
//           'Accept-encoding': 'gzip, deflate',
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify(chunk),
//       })

//       const result = await response.json()
      
//       if (result.data) {
//         result.data.forEach(item => {
//           if (item.status === 'ok') {
//             successful++
//           } else {
//             failed++
//             console.error('Push notification failed:', item)
//           }
//         })
//       }
//     } catch (error) {
//       console.error('Error sending push notification chunk:', error)
//       failed += chunk.length
//     }
//   }

//   console.log(`Push notifications sent: ${successful} successful, ${failed} failed`)
//   return { successful, failed }
// }

// // Improved real-time notification broadcasting
// async function triggerRealTimeNotification(notification, userIds) {
//   try {
//     console.log('Broadcasting real-time notification:', {
//       id: notification.id,
//       title: notification.title,
//       userIds: userIds.length
//     })

//     const notificationPayload = {
//       id: notification.id,
//       title: notification.title,
//       message: notification.message,
//       type: notification.type,
//       image_url: notification.image_url,
//       action_type: notification.action_type || 'none',
//       action_value: notification.action_value,
//       target_users: userIds,
//       sent_at: new Date().toISOString(),
//       created_at: notification.created_at
//     }

//     // Create multiple channels for better reliability
//     const channels = [
//       'notifications',
//       'notification-broadcast',
//       'user-notifications-global'
//     ]

//     for (const channelName of channels) {
//       try {
//         const channel = supabaseAdmin.channel(`${channelName}-${Date.now()}`)
        
//         const result = await channel.send({
//           type: 'broadcast',
//           event: 'new_notification',
//           payload: notificationPayload
//         })

//         if (result === 'ok') {
//           console.log(`Broadcast sent successfully on channel: ${channelName}`)
//         } else {
//           console.warn(`Broadcast failed on channel ${channelName}:`, result)
//         }
        
//         await supabaseAdmin.removeChannel(channel)
        
//       } catch (channelError) {
//         console.error(`Error broadcasting on channel ${channelName}:`, channelError)
//       }
//     }
    
//     console.log('Real-time notification broadcasting completed')
    
//   } catch (error) {
//     console.error('Trigger real-time notification error:', error)
//   }
// }