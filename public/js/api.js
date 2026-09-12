/* Thin wrapper over fetch. Every call sends the session cookie and turns a
   non-2xx response into a thrown Error carrying the server's message. */

const API = {
  async request(path, { method = 'GET', body, params } = {}) {
    const url = new URL(`/api${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
    }

    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  get: (p, params) => API.request(p, { params }),
  post: (p, body) => API.request(p, { method: 'POST', body }),
  patch: (p, body) => API.request(p, { method: 'PATCH', body }),
  put: (p, body) => API.request(p, { method: 'PUT', body }),
  del: (p, body) => API.request(p, { method: 'DELETE', body })
};

window.API = API;
