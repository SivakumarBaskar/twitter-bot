module.exports = {
  apps: [{
    name: 'apex-bot',
    script: 'dist/bot.js',
    instances: 1,
    autorestart: true,
    max_restarts: 20,
    restart_delay: 10000,
    max_memory_restart: '400M',
    env: { NODE_ENV: 'production' },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    time: true,
  }]
};
