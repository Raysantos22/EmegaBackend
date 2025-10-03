export default async function handler(req, res) {
  const { spapi_oauth_code } = req.query
  
  if (!spapi_oauth_code) {
    return res.send(`
      <h1>SP-API Authorization</h1>
      <p>Waiting for authorization code...</p>
    `)
  }
  
  // We'll exchange this code for refresh token in next step
  return res.send(`
    <h1>Authorization Code Received!</h1>
    <p>Code: <code>${spapi_oauth_code}</code></p>
    <p>Save this code - we'll exchange it for a refresh token next.</p>
  `)
}