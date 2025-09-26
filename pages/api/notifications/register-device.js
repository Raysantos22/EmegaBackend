// //C:\Users\ADMIN\EmegaBackend\pages\api\notifications\register-device.js
// import { supabaseAdmin } from '../../../lib/supabase'

// export default async function handler(req, res) {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' })
//   }

//   try {
//     const { userId, pushToken, platform, deviceInfo } = req.body

//     if (!userId || !pushToken) {
//       return res.status(400).json({ 
//         error: 'Missing required fields',
//         required: ['userId', 'pushToken']
//       })
//     }

//     // Register or update device with push token
//     const { data, error } = await supabaseAdmin
//       .from('user_devices')
//       .upsert({
//         user_id: userId,
//         device_token: pushToken,
//         platform: platform || 'unknown',
//         device_info: deviceInfo || {},
//         is_active: true,
//         last_seen_at: new Date().toISOString(),
//         push_enabled: true
//       }, { 
//         onConflict: 'device_token'
//       })
//       .select()

//     if (error) {
//       console.error('Error registering device:', error)
//       return res.status(500).json({ 
//         error: 'Failed to register device',
//         message: error.message 
//       })
//     }

//     console.log(`Device registered successfully: ${userId} - ${pushToken}`)

//     return res.status(200).json({
//       success: true,
//       message: 'Device registered successfully',
//       device: data[0]
//     })

//   } catch (error) {
//     console.error('Register device error:', error)
//     return res.status(500).json({ 
//       error: 'Internal server error',
//       message: error.message 
//     })
//   }
// }