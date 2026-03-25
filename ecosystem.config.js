/**
 * PM2 ecosystem file to run both API and Web in a single container.
 * - API runs the compiled NestJS app from /app/api/dist
 * - Web runs Next.js in production mode from /app/web
 */

/**
 * PM2 ecosystem file to run both API and Web in a single container.
 * Uses npm run scripts for better compatibility and reliability.
 */

module.exports = {
  apps: [
    {
      name: 'api',
      // Run via npm script defined in /app/api/package.json
      script: 'npm',
      args: 'run prod',
      cwd: '/app/api',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'web',
      // Run via npm script defined in /app/web/package.json
      script: 'npm',
      args: 'run start',
      cwd: '/app/web',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
}
