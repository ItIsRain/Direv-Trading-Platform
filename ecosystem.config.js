module.exports = {
  apps: [
    {
      name: 'direv-trading-platform',
      script: 'npm',
      args: 'run start -- -p 3005',
      cwd: '/var/www/Deriv-Trading-Platform',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
    },
    {
      name: 'deriv-token-generator',
      script: './scripts/run.sh',
      cwd: '/var/www/Deriv-Trading-Platform',
      interpreter: '/bin/bash',
      autorestart: false,
      watch: false,
      autostart: false, // Don't start automatically, run on-demand
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
