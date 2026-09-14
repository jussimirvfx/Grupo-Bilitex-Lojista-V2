const firstHeader = (request, name) => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

export const isSameOrigin = (request) => {
  const host = String(firstHeader(request, 'x-forwarded-host') || firstHeader(request, 'host') || '').trim();
  const origin = String(firstHeader(request, 'origin') || '').trim();
  const fetchSite = String(firstHeader(request, 'sec-fetch-site') || '').trim().toLowerCase();

  if (!host || !origin || (fetchSite && fetchSite !== 'same-origin')) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
