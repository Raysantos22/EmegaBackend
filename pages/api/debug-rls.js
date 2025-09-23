// Create pages/api/debug-rls.js to check RLS settings
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  try {
    console.log('=== RLS DEBUG START ===')

    // Test 1: Check if we can read data
    const { data: readData, error: readError } = await supabase
      .from('banners')
      .select('*')
      .limit(1)

    console.log('Read test:', { data: readData, error: readError })

    // Test 2: Check session/auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('Session:', { 
      hasSession: !!session, 
      userId: session?.user?.id,
      error: sessionError 
    })

    // Test 3: Try insert (will help identify RLS issues)
    const testInsert = await supabase
      .from('banners')
      .insert({
        title: 'TEST_RLS_' + Date.now(),
        subtitle: 'Test',
        image_url: 'https://example.com/test.jpg',
        text_color: 'white',
        action_type: 'category',
        action_value: 'test',
        is_active: false,
        display_order: 999
      })
      .select()

    console.log('Insert test:', testInsert)

    // Test 4: Try update on test record if insert succeeded
    let updateTest = { error: 'No test record to update' }
    if (testInsert.data && testInsert.data.length > 0) {
      const testId = testInsert.data[0].id
      updateTest = await supabase
        .from('banners')
        .update({ 
          title: 'UPDATED_TEST_' + Date.now(),
          updated_at: new Date().toISOString()
        })
        .eq('id', testId)
        .select()

      console.log('Update test:', updateTest)

      // Clean up test record
      await supabase
        .from('banners')
        .delete()
        .eq('id', testId)
    }

    // Test 5: Get table info (if possible)
    const tableInfo = await supabase
      .from('banners')
      .select('*')
      .limit(0) // Just to check structure

    console.log('=== RLS DEBUG END ===')

    return res.status(200).json({
      success: true,
      tests: {
        read: { data: readData, error: readError },
        session: { 
          hasSession: !!session, 
          userId: session?.user?.id,
          error: sessionError 
        },
        insert: testInsert,
        update: updateTest,
        tableStructure: tableInfo
      },
      recommendations: [
        'Check if RLS is enabled on banners table',
        'Check if there are proper policies for UPDATE operations',
        'Verify your supabase client is configured correctly',
        'Check if you need to be authenticated for updates'
      ]
    })

  } catch (error) {
    console.error('RLS debug error:', error)
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    })
  }
}