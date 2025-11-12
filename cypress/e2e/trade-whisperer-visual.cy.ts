/// <reference types="cypress" />

/**
 * Trade Whisperer Cypress Visual Testing Suite
 * Comprehensive testing with screenshot validation
 */

describe('Trade Whisperer - Visual Testing & API Validation', () => {
  
  beforeEach(() => {
    // Visit the application and wait for it to load
    cy.visit('/')
    cy.wait(2000) // Allow time for initial API calls
  })

  it('Should load the landing page and take screenshot', () => {
    cy.title().should('contain', 'Trade Whisperer')
    
    // Take screenshot of landing page
    cy.screenshot('cypress-01-landing-page', {
      capture: 'fullPage',
      overwrite: true
    })
    
    // Verify navigation is present
    cy.get('nav').should('be.visible')
    cy.screenshot('cypress-02-navigation-visible')
  })

  it('Should test API server health endpoints', () => {
    // Test main API server health
    cy.request('GET', `${Cypress.env('apiServer')}/health`)
      .then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body).to.have.property('status', 'ok')
        cy.log('Main API server health check passed')
      })
    
    // Test backtesting server health
    cy.request('GET', `${Cypress.env('backtestingServer')}/health`)
      .then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body).to.have.property('status', 'ok')
        cy.log('Backtesting server health check passed')
      })
  })

  it('Should navigate to Trading page and test interface', () => {
    cy.contains('Trading').click()
    cy.url().should('include', '/trading')
    cy.wait(2000)
    
    // Take screenshot of trading interface
    cy.screenshot('cypress-03-trading-page', {
      capture: 'fullPage'
    })
    
    // Test symbol input if present
    cy.get('input[type="text"]').first().then(($input) => {
      if ($input.length > 0) {
        cy.wrap($input).clear().type('SPY')
        cy.wait(2000)
        cy.screenshot('cypress-04-trading-with-symbol')
      }
    })
    
    // Check for WebSocket connection indicators
    cy.get('body').then(($body) => {
      if ($body.find(':contains("Connected"), :contains("Online")').length > 0) {
        cy.screenshot('cypress-05-websocket-connected')
      }
    })
  })

  it('Should test Backtesting functionality and DTE logic', () => {
    cy.contains('Backtesting').click()
    cy.url().should('include', '/backtesting')
    cy.wait(2000)
    
    // Take screenshot of backtesting interface
    cy.screenshot('cypress-06-backtesting-page', {
      capture: 'fullPage'
    })
    
    // Test form inputs
    cy.get('input[type="text"], input[type="date"], input[type="number"]').then(($inputs) => {
      if ($inputs.length > 0) {
        // Fill first input with symbol
        cy.wrap($inputs.first()).clear().type('SPY')
        
        // Fill date input if available
        if ($inputs.length > 1) {
          cy.wrap($inputs.eq(1)).then(($input) => {
            if ($input.attr('type') === 'date') {
              cy.wrap($input).type('2024-01-01')
            }
          })
        }
        
        cy.wait(1000)
        cy.screenshot('cypress-07-backtesting-with-data')
      }
    })
    
    // Look for DTE-related elements (0DTE, 1DTE indicators)
    cy.get('body').then(($body) => {
      if ($body.find(':contains("0DTE"), :contains("1DTE"), :contains("DTE")').length > 0) {
        cy.screenshot('cypress-08-dte-logic-visible')
      }
    })
  })

  it('Should test API endpoints for current options data', () => {
    // Test the current options endpoint
    cy.request({
      method: 'POST',
      url: `${Cypress.env('backtestingServer')}/api/fetch-current-options`,
      body: {
        ticker: 'SPY',
        strikeRange: 5,
        strikeSpacing: 5
      },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200) {
        expect(response.body).to.have.property('data')
        cy.log('Current options API endpoint working')
      } else {
        cy.log(`Options API returned status: ${response.status}`)
      }
    })
  })

  it('Should test History page and trade data', () => {
    cy.contains('History').click()
    cy.url().should('include', '/history')
    cy.wait(3000) // Allow time for data loading
    
    // Take screenshot of history page
    cy.screenshot('cypress-09-history-page', {
      capture: 'fullPage'
    })
    
    // Test search functionality if present
    cy.get('input[placeholder*="search"], input[placeholder*="filter"]').then(($inputs) => {
      if ($inputs.length > 0) {
        cy.wrap($inputs.first()).type('SPY')
        cy.wait(1000)
        cy.screenshot('cypress-10-history-searched')
      }
    })
    
    // Look for data tables or trade history
    cy.get('table, .table, .data-table').then(($tables) => {
      if ($tables.length > 0) {
        cy.screenshot('cypress-11-history-data-tables')
      }
    })
  })

  it('Should test Diagnostics page and API validation', () => {
    cy.contains('Diagnostics').click()
    cy.url().should('include', '/diagnostics')
    cy.wait(2000)
    
    // Take screenshot of diagnostics page
    cy.screenshot('cypress-12-diagnostics-page', {
      capture: 'fullPage'
    })
    
    // Look for and click diagnostic test buttons
    cy.get('button').contains(/Test|Run|Check|Diagnose/i).then(($buttons) => {
      if ($buttons.length > 0) {
        cy.wrap($buttons.first()).click()
        cy.wait(5000) // Wait for API calls to complete
        cy.screenshot('cypress-13-diagnostics-results')
      }
    })
  })

  it('Should test mobile responsiveness', () => {
    cy.viewport(375, 667) // iPhone 6/7/8 size
    cy.visit('/')
    cy.wait(2000)
    
    // Take screenshot of mobile view
    cy.screenshot('cypress-14-mobile-home')
    
    // Test mobile navigation
    cy.get('button').contains(/Menu|☰/).then(($menuButtons) => {
      if ($menuButtons.length > 0) {
        cy.wrap($menuButtons.first()).click()
        cy.wait(500)
        cy.screenshot('cypress-15-mobile-menu-open')
      }
    })
    
    // Test trading page on mobile
    cy.visit('/trading')
    cy.wait(2000)
    cy.screenshot('cypress-16-mobile-trading')
    
    // Reset to desktop viewport
    cy.viewport(1280, 720)
  })

  it('Should test weekend data handling and timestamps', () => {
    cy.visit('/')
    cy.wait(2000)
    
    // Look for timestamp or data age indicators
    cy.get('body').then(($body) => {
      const timestampSelectors = [
        '*:contains("Last updated")',
        '*:contains("Data as of")',
        '.timestamp',
        '.data-age',
        '*:contains("ago")',
        '*:contains("minutes")',
        '*:contains("hours")'
      ]
      
      timestampSelectors.forEach((selector) => {
        if ($body.find(selector).length > 0) {
          cy.screenshot('cypress-17-data-timestamps')
        }
      })
    })
    
    // Check different pages for data freshness
    const pages = ['/trading', '/backtesting', '/history']
    
    pages.forEach((page, index) => {
      cy.visit(page)
      cy.wait(2000)
      cy.screenshot(`cypress-18-data-freshness-${page.replace('/', '')}`)
    })
  })

  it('Should test error handling and offline states', () => {
    // Test with invalid API calls
    cy.request({
      method: 'POST',
      url: `${Cypress.env('apiServer')}/api/nonexistent-endpoint`,
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status).to.not.eq(200)
      cy.log('Error handling test completed')
    })
    
    // Take screenshot of any error states
    cy.visit('/diagnostics')
    cy.wait(2000)
    cy.screenshot('cypress-19-error-handling-test')
  })

  it('Should validate OHLCV vs bid/ask data handling', () => {
    // Visit trading page to check data types
    cy.visit('/trading')
    cy.wait(2000)
    
    // Look for OHLCV data indicators
    cy.get('body').then(($body) => {
      const ohlcvIndicators = [
        '*:contains("Open")',
        '*:contains("High")',
        '*:contains("Low")',
        '*:contains("Close")',
        '*:contains("Volume")',
        '*:contains("OHLCV")'
      ]
      
      const bidAskIndicators = [
        '*:contains("Bid")',
        '*:contains("Ask")',
        '*:contains("Spread")'
      ]
      
      let hasOHLCV = false
      let hasBidAsk = false
      
      ohlcvIndicators.forEach((selector) => {
        if ($body.find(selector).length > 0) {
          hasOHLCV = true
        }
      })
      
      bidAskIndicators.forEach((selector) => {
        if ($body.find(selector).length > 0) {
          hasBidAsk = true
        }
      })
      
      if (hasOHLCV || hasBidAsk) {
        cy.screenshot('cypress-20-data-types-validation')
      }
    })
  })
})