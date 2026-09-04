// React picks its development or production build at import time from
// NODE_ENV; the dsh launcher leaves it unset, so the default resolution loads
// react.development.js and every reconciler frame pays roughly twice the
// CPU. Pin production before the UI graph's react imports evaluate — this
// module must stay the first import of every entry that pulls react. The
// host reads NODE_ENV only during module loading (verified across
// @deepseek-ai packages), so the pin is inert outside module resolution.
if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = 'production'
}
