// pages/index.js - Minimal Dashboard (build fixes applied)
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import Image from 'next/image'

export default function DashboardHome() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    } else {
      setSession(session)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  if (loading) {
    return (
      <DashboardLayout session={session} supabase={supabase} currentPage="dashboard">
        <div>Loading...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout session={session} supabase={supabase} currentPage="dashboard">
      <div>
        <h1>Dashboard</h1>
        <p>Welcome back, {session?.user?.email}</p>
        
        <nav>
          <Link href="/banners">Banners</Link>
          <br />
          <Link href="/products">Products</Link>
          <br />
          <Link href="/notifications">Notifications</Link>
        </nav>
      </div>
    </DashboardLayout>
  )
}