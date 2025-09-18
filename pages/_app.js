// pages/_app.js
import '../styles/globals.css'
import { AuthProvider } from '../components/AuthProvider'
import Image from 'next/image'

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

export default MyApp