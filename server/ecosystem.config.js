module.exports = {
  apps: [
    {
      name: "ems-backend",
      script: "./server_IP.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "alarm-computation",
      script: "./workers/alarmComputationWorker.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "alarm-log",
      script: "./workers/alarmLogWorker.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "inc-log",
      script: "./workers/IncLogWorker.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "snapshot",
      script: "./workers/snapshotWorker.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "log-worker",
      script: "./workers/logWorker.js",
      cwd: "/var/www/ems/technoEMS/server",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
