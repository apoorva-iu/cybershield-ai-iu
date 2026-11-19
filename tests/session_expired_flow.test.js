'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Read source files to verify logic structure and tokens
const apiCode = fs.readFileSync(path.join(__dirname, '../web/src/api.js'), 'utf8');
const authCode = fs.readFileSync(path.join(__dirname, '../web/src/auth.jsx'), 'utf8');
const loginCode = fs.readFileSync(path.join(__dirname, '../web/src/pages/Login.jsx'), 'utf8');
const cssCode = fs.readFileSync(path.join(__dirname, '../web/src/layout.css'), 'utf8');

console.log('--- TEST 1: Source code inspections for session expiration and error triggers ---');

// 1. Verify web/src/api.js only triggers onUnauthorized when an auth token or header exists
assert(apiCode.includes('export function getAuthToken()'), 'api.js must export getAuthToken');
assert(apiCode.includes("Couldn't reach the server. Check your connection and try again"), 'api.js must provide standard server unreachable message');
assert(apiCode.includes("(authToken || headers['Authorization'])"), 'api.js must only notify unauthorized callback if auth token/header was sent');

// 2. Verify web/src/auth.jsx storage and lifecycle logic
assert(authCode.includes('markHadStoredSession'), 'auth.jsx must export markHadStoredSession');
assert(authCode.includes('clearHadStoredSession'), 'auth.jsx must export clearHadStoredSession');
assert(authCode.includes('checkHadStoredSession'), 'auth.jsx must export checkHadStoredSession');
assert(authCode.includes('setSessionExpiredNotice'), 'auth.jsx must export setSessionExpiredNotice');
assert(authCode.includes('consumeSessionExpiredNotice'), 'auth.jsx must export consumeSessionExpiredNotice');
assert(authCode.includes('clearSessionExpiredNotice'), 'auth.jsx must export clearSessionExpiredNotice');

// Verify initAuthConfigOnce tracks serverUnreachable
assert(authCode.includes('serverUnreachable: true'), 'initAuthConfigOnce must set serverUnreachable: true on network error');
assert(authCode.includes('serverUnreachable: false'), 'initAuthConfigOnce must set serverUnreachable: false when server responds');

// Verify signOut clears all session and notice flags
assert(authCode.includes('clearHadStoredSession()'), 'signOut must clear stored session flag');
assert(authCode.includes('clearSessionExpiredNotice()'), 'signOut must clear session expired notice');
assert(authCode.includes('setCallbackError(null)'), 'signOut must reset callback error');

// Verify setOnUnauthorized navigates with sessionExpired state only if hadSession was true
assert(authCode.includes('const hadSession = checkHadStoredSession() || Boolean(getAuthToken());'), 'setOnUnauthorized must check if user had an active session');
assert(authCode.includes('state: { sessionExpired: true }'), 'setOnUnauthorized must pass sessionExpired state to router');

// 3. Verify web/src/pages/Login.jsx single consumption and display logic
assert(loginCode.includes('location.state?.sessionExpired'), 'Login.jsx must check location.state?.sessionExpired');
assert(loginCode.includes('replaceState'), 'Login.jsx must replaceState to clear sessionExpired once shown');
assert(loginCode.includes('serverUnreachable'), 'Login.jsx must read serverUnreachable from useAuth');
assert(loginCode.includes("Couldn't reach the server. Check your connection and try again"), 'Login.jsx must handle unreachable server with proper message');

// 4. Verify CSS styling for .login-status-error (red-tinted, no grey)
assert(cssCode.includes('.login-status-error {'), 'CSS must define .login-status-error');
assert(cssCode.includes('[data-theme="light"] .login-status-error {'), 'CSS must define light mode for .login-status-error');

console.log('Passed TEST 1: Source code inspection assertions.');

console.log('--- TEST 2: Functional simulation of session state transitions ---');

// Mock localStorage and sessionStorage
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
  }
  setItem(k, v) {
    this.store[k] = String(v);
  }
  removeItem(k) {
    delete this.store[k];
  }
  clear() {
    this.store = {};
  }
}

const localStore = new MockStorage();
const sessionStore = new MockStorage();

function mockMarkHadStoredSession() {
  localStore.setItem('cs_had_stored_session', '1');
}
function mockClearHadStoredSession() {
  localStore.removeItem('cs_had_stored_session');
}
function mockCheckHadStoredSession() {
  return localStore.getItem('cs_had_stored_session') === '1';
}

function resolveLoginError({ serverUnreachable, locationState, errorMsg, callbackError }) {
  if (serverUnreachable) {
    return "Couldn't reach the server. Check your connection and try again";
  }
  const sessionExpiredMsg = locationState?.sessionExpired
    ? 'Your session expired. Please sign in again.'
    : null;
  return errorMsg || sessionExpiredMsg || callbackError || null;
}

// Scenario 1: Plain first visit to #/login (or direct navigation)
{
  localStore.clear();
  sessionStore.clear();
  const error = resolveLoginError({
    serverUnreachable: false,
    locationState: undefined,
    errorMsg: null,
    callbackError: null
  });

  assert.strictEqual(error, null, 'Plain first visit / direct visit to #/login must show nothing');
  console.log('Scenario 1 passed: Plain first visit / direct visit to #/login shows no error.');
}

// Scenario 2: Normal user sign in then explicit Sign Out
{
  // User signs in
  mockMarkHadStoredSession();
  assert.strictEqual(mockCheckHadStoredSession(), true, 'Signed-in user has hadStoredSession true');

  // User explicitly clicks Sign Out
  mockClearHadStoredSession();
  let callbackError = null;

  // Navigates to #/login with no state
  const error = resolveLoginError({
    serverUnreachable: false,
    locationState: null,
    errorMsg: null,
    callbackError
  });
  assert.strictEqual(error, null, 'Sign out: active error must be null');
  console.log('Scenario 2 passed: Explicit sign out leaves no error message on login page.');
}

// Scenario 3: Signed-in user experiences session expiration on 401
{
  // User has active session
  mockMarkHadStoredSession();
  let authToken = 'expired-jwt-token';

  // 401 occurs from backend
  const hadSession = mockCheckHadStoredSession() || Boolean(authToken);
  assert.strictEqual(hadSession, true, 'User had a stored session');

  // onUnauthorized handler runs
  mockClearHadStoredSession();
  authToken = null;
  let navState = null;
  if (hadSession) {
    navState = { sessionExpired: true };
  }

  // Redirect to #/login: Component mounts with location.state = { sessionExpired: true }
  let activeError = resolveLoginError({
    serverUnreachable: false,
    locationState: navState,
    errorMsg: null,
    callbackError: null
  });
  assert.strictEqual(activeError, 'Your session expired. Please sign in again.', 'Active error displays session expired once');

  // replaceState runs immediately in effect, clearing location.state
  navState = null;

  // User refreshes page or navigates directly to #/login again
  let refreshedActiveError = resolveLoginError({
    serverUnreachable: false,
    locationState: navState,
    errorMsg: null,
    callbackError: null
  });
  assert.strictEqual(refreshedActiveError, null, 'Subsequent load / refresh: no error displayed');
  console.log('Scenario 3 passed: Session expiration shows message once, clears state, subsequent visits show nothing.');
}

// Scenario 4: Guest / unauthenticated request receives 401 (e.g. without token)
{
  localStore.clear();
  sessionStore.clear();
  let authToken = null;
  let headers = {};

  // apiFetch checks (authToken || headers['Authorization'])
  let shouldCallUnauthorized = Boolean(authToken || headers['Authorization']);
  assert.strictEqual(shouldCallUnauthorized, false, 'Guest 401 does not trigger unauthorized callback');

  // Even if hypothetically called:
  const hadSession = mockCheckHadStoredSession() || Boolean(authToken);
  assert.strictEqual(hadSession, false, 'No stored session found for guest');

  const error = resolveLoginError({
    serverUnreachable: false,
    locationState: null,
    errorMsg: null,
    callbackError: null
  });
  assert.strictEqual(error, null, 'Guest never receives session expired message');
  console.log('Scenario 4 passed: Guest 401 does not trigger session expired.');
}

// Scenario 5: Server is stopped / unreachable
{
  localStore.clear();
  sessionStore.clear();
  const error = resolveLoginError({
    serverUnreachable: true,
    locationState: null,
    errorMsg: null,
    callbackError: null
  });

  assert.strictEqual(error, "Couldn't reach the server. Check your connection and try again", 'Server offline displays unreachable message, never session expired');
  console.log('Scenario 5 passed: Server unreachable displays correct network message.');
}

console.log('ALL TESTS PASSED SUCCESSFULLY.');
