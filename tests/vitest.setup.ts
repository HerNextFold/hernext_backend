// Deterministic test environment.
//
// The local .env may deliberately configure a real email path
// (EMAIL_PROVIDER=brevo with real credentials) for live sending during the
// hackathon. DB integration suites depend on the in-memory TestEmailProvider
// to capture OTP/reset codes, so those suites must run against it regardless
// of .env values. dotenv never overrides an existing process.env key, so the
// assignments below (made before any src module imports ./config/env.js)
// reliably win for every test process.
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'test';