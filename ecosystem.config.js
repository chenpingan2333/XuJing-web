module.exports = {
  apps: [{
    name: 'xujing-app',
    script: 'node',
    args: '.next/standalone/server.js',
    cwd: '/root/XuJing-web',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: "",
      HOSTNAME: '0.0.0.0',
      PORT: 3003,

      JWT_SECRET: '18b7fbc0bed0dab5f6dc216a5dd9be72e8bbfe5f3c10ed309627b4d557ae8d37',
      API_KEY_ENCRYPTION_KEY: 'd0b9979dcd150bb44e00eeb17513476c6628d0097d4f190b5fa75c6e1e6d3cf4',
      DATABASE_URL: 'postgresql://postgres:zzx20141220!@127.0.0.1:5432/xujing',
      PLATFORM_API_KEY: 'sk-3c8b610ef5be4791a06c93c4b5078301',
      PLATFORM_API_URL: 'https://api.deepseek.com',
      PLATFORM_MODEL_ID: 'deepseek-v4-flash'
    }
  }]
};
