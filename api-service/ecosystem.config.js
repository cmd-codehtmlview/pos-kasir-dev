module.exports = {
  apps: [
    {
      name: "snackpos-api",
      script: "server.js",
      cwd: "/var/www/pos-kasir/api-service",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
