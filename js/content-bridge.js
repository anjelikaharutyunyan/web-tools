/**
 * content-bridge.js - Bridges communication between page context and extension background
 * This runs in the ISOLATED world and relays messages
 */

// Listen for events from the page (MAIN world)
window.addEventListener('extension-message-request', (event) => {
  const { eventId, type, action, ...data } = event.detail;
  
  // Forward to background script
  chrome.runtime.sendMessage({
    type,
    action,
    ...data
  }, (response) => {
    // Dispatch response back to page
    window.dispatchEvent(new CustomEvent('extension-message-response', {
      detail: {
        eventId,
        ...response
      }
    }));
  });
});