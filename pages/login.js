// pages/login.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error } = isSignUp 
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

      if (error) throw error

      if (isSignUp) {
        alert('Check your email for verification link!')
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden max-w-6xl w-full flex h-[600px]">
        
        {/* Left Panel - Logo */}
        <div className="flex-1 bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center p-8">
          <img 
            src="https://emega.com.au/wp-content/uploads/2023/10/mega-shop-australia.png" 
            alt="EMEGA Logo" 
            className="w-64 h-64 object-contain filter brightness-0 invert"
          />
        </div>

        {/* Right Panel - Auth Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                {isSignUp ? 'Sign Up' : 'Log In'}
              </h1>
              <p className="text-gray-600 text-sm">
                {isSignUp 
                  ? 'Create a new account to access the dashboard.' 
                  : 'Enter your email and password to access the dashboard.'
                }
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-100 transition-all"
                    placeholder="info@emegahcs.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-100 transition-all"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50 transition-all duration-200"
              >
                {loading 
                  ? (isSignUp ? 'Signing up...' : 'Signing in...') 
                  : (isSignUp ? 'Sign Up' : 'Sign In')
                }
              </button>

              {/* Toggle / Forgot Password */}
              <div className="flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-red-600 hover:text-red-700 transition-colors"
                >
                  {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
                </button>
                {!isSignUp && (
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700 transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
