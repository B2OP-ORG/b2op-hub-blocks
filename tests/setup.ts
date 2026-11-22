// Mute console.debug (protocol frame traces etc.) during tests.
// Set TEST_DEBUG=1 to see it again.
if (!process.env.TEST_DEBUG) {
  console.debug = () => {};
}
