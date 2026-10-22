let authToken = null;
let onUnauthorizedCallback = null;

export function setAuthToken(token) {
  authToken = token;
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
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const config = {
    ...options,
    headers
  };
  
  let res;
  try {
    res = await fetch(endpoint, config);
  } catch (err) {
    throw new Error('Network error. Please check your connection.');
  }
  
  let data;
  try {
    data = await res.json();
  } catch (err) {
    if (!res.ok) {
      if (res.status === 401 && onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      const statusErr = new Error(`Server error: ${res.status}`);
      statusErr.status = res.status;
      throw statusErr;
    }
    return null; // empty response
  }
  
  if (!res.ok) {
    let msg = data?.error || data?.message || `Error ${res.status}`;
    if (res.status === 401) {
      msg = 'Your session expired. Please sign in again.';
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback(msg);
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


