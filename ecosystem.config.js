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
      PORT: 3003,
      JWT_SECRET: '3fffe1ab037cd765c506adb0410742751a8fcc8fab52c69dc757f86724429a0b',
      API_KEY_ENCRYPTION_KEY: '0b55d007ad6458c1dbf9554c8fe70c8f958d196fbd363c793a896526578005be',
      DATABASE_URL: 'postgresql://postgres:zzx20141220!@127.0.0.1:5432/xujing'
    }
  }]
};
