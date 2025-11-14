import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    video: true,
    screenshotOnRunFailure: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Visual testing configuration
    env: {
      // API endpoints for testing
      apiServer: 'http://localhost:3001',
      backtestingServer: 'http://localhost:3002'
    },
    
    setupNodeEvents(on, config) {
      // Plugin setup for visual testing
      on('task', {
        log(message) {
          console.log(message)
          return null
        }
      })
    },
    
    // Retry configuration
    retries: {
      runMode: 2,
      openMode: 0
    },
    
    // Timeouts
    defaultCommandTimeout: 30000,
    requestTimeout: 30000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    
    // Browser launch args for better screenshots
    chromeWebSecurity: false,
    blockHosts: ['*.google-analytics.com', '*.googletagmanager.com']
  },

  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/component.ts'
  },
})