self.addEventListener('fetch', (event) => {
  const request = (event as Event & { request: Request }).request;
  if (request.url.includes('/api/rider/')) return;
});
