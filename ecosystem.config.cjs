// Secrets and site-specific configuration are inherited from the operator's
// environment. Never put custody keys or RPC credentials in this file.
const cwd = '/var/www/tekkteam';
const safe = {
  NODE_ENV: 'production',
  BACKEND_HOST: '127.0.0.1',
  PORT: '4190',
  LAUNCH_PORT: '4193',
  API_INTERNAL_URL: 'http://127.0.0.1:4190',
  LAUNCH_INTERNAL_URL: 'http://127.0.0.1:4193',
  FUNDING_ENABLED: 'false',
  WITHDRAWAL_ENABLED: 'false',
  WALLET_TRANSFERS_PAUSED: 'true',
  CONTROLLED_REAL_ENABLED: 'false',
  CONTROLLED_BUY_PREPARE_ENABLED: 'false',
  LIVE_TRADING_ENABLED: 'false',
  LIVE_AUTONOMOUS_ENABLED: 'false',
  GLOBAL_TRADING_KILL_SWITCH: 'true',
  AUTONOMOUS_KILL_SWITCH: 'true',
  REAL_MONEY_EMERGENCY_STOP: 'true',
  PAPER_TRADING_KILL_SWITCH: 'true',
};

module.exports = {
  apps: [
    {
      name: 'tekkteam-api',
      cwd,
      script: 'server/index.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      kill_timeout: 30000,
      out_file: '/var/log/tekkteam/api-out.log',
      error_file: '/var/log/tekkteam/api-error.log',
      env_production: safe,
    },
    {
      name: 'tekkteam-launch',
      cwd,
      script: 'server/pump-launch-index.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 30000,
      out_file: '/var/log/tekkteam/launch-out.log',
      error_file: '/var/log/tekkteam/launch-error.log',
      env_production: safe,
    },
  ],
};
