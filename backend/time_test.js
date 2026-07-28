const http = require('http');

const start = Date.now();
http.get('http://localhost:4000/api/health', (res) => {
  res.on('data', () => {});
  res.on('end', () => console.log('Health:', Date.now() - start, 'ms'));
});
