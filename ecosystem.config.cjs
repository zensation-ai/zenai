module.exports = {
  apps: [
    {
      name: 'ai-brain-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run dev',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
