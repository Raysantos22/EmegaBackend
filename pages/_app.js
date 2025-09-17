import '../styles/globals.css'
import { AuthProvider } from '../components/AuthProvider'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <script src="https://cdn.tailwindcss.com"></script>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  )
}

export default MyApp