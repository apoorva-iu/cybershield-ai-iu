let authToken = null;
let onUnauthorizedCallback = null;

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function setOnUnauthorized(cb) {
  onUnauthorizedCallback = typeof cb === 'function' ? cb : null;
}

export async function apiFetch(endpoint, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };
  
  if (authToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const config = {
    ...options,
    headers
  };
  
  let res;
  const isBillingRoute = typeof endpoint === 'string' && endpoint.includes('/api/billing/');
  try {
    res = await fetch(endpoint, config);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    const netErr = new Error("Couldn't reach the server. Check your connection and try again");
    netErr.isNetworkError = true;
    throw netErr;
  }
  
  let data;
  try {
    data = await res.json();
  } catch (err) {
    if (!res.ok) {
      if (!isBillingRoute && res.status === 401 && onUnauthorizedCallback && (authToken || headers['Authorization'])) {
        onUnauthorizedCallback();
      }
      const statusErr = new Error(`Server error: ${res.status}`);
      statusErr.status = res.status;
      throw statusErr;
    }
    return null; // empty response
  }
  
  if (!res.ok) {
    let msg = data?.message || data?.error || `Error ${res.status}`;
    if (res.status === 503 || data?.error === 'AI_UNAVAILABLE' || data?.code === 'AI_UNAVAILABLE' || data?.message === 'AI_UNAVAILABLE' || msg === 'AI_UNAVAILABLE' || (typeof msg === 'string' && (msg.includes('AI_UNAVAILABLE') || msg.toLowerCase().includes('ai service unavailable')))) {
      msg = (data?.message && data.message !== 'AI_UNAVAILABLE' && !data.message.includes('AI_UNAVAILABLE'))
        ? data.message
        : 'Could not read screenshot right now. Please try again or paste the text directly.';
    } else if (res.status === 401) {
      if (authToken || headers['Authorization']) {
        msg = 'Your session expired. Please sign in again.';
        if (!isBillingRoute && onUnauthorizedCallback) {
          onUnauthorizedCallback(msg);
        }
      } else {
        msg = data?.error || data?.message || 'Authentication required';
      }
    } else if (res.status === 429) {
      msg = data?.error || 'Too many scans. Please wait a minute and try again.';
    } else if (res.status === 400) {
      msg = data?.error || 'Invalid request. Please check your input.';
    }
    const apiErr = new Error(msg);
    apiErr.status = res.status;
    apiErr.code = data?.code;
    apiErr.data = data;
    throw apiErr;
  }
  
  return data;
}


