/// <reference types="cypress" />

/**
 * Custom Cypress commands for Trade Whisperer testing
 */

// Custom command to wait for API responses
Cypress.Commands.add('waitForApiResponse', (url: string, timeout = 10000) => {
  cy.intercept(url).as('apiCall')
  cy.wait('@apiCall', { timeout })
})

// Custom command to take screenshots with consistent naming
Cypress.Commands.add('takeNamedScreenshot', (name: string, options = {}) => {
  const defaultOptions = {
    capture: 'fullPage',
    overwrite: true
  }
  cy.screenshot(name, { ...defaultOptions, ...options })
})

// Custom command to test WebSocket connections
Cypress.Commands.add('testWebSocketConnection', (wsUrl: string) => {
  cy.window().then((win) => {
    const ws = new win.WebSocket(wsUrl)
    
    ws.onopen = () => {
      cy.log('WebSocket connection opened')
    }
    
    ws.onerror = (error) => {
      cy.log('WebSocket error:', error)
    }
    
    ws.onclose = () => {
      cy.log('WebSocket connection closed')
    }
  })
})

// Custom command to validate API response structure
Cypress.Commands.add('validateApiResponse', (response: any, expectedStructure: any) => {
  Object.keys(expectedStructure).forEach((key) => {
    expect(response.body).to.have.property(key)
  })
})

declare global {
  namespace Cypress {
    interface Chainable {
      waitForApiResponse(url: string, timeout?: number): Chainable<void>
      takeNamedScreenshot(name: string, options?: any): Chainable<void>
      testWebSocketConnection(wsUrl: string): Chainable<void>
      validateApiResponse(response: any, expectedStructure: any): Chainable<void>
    }
  }
}