#!/usr/bin/env node
/**
 * Strategy Validation Script
 * 
 * Validates a strategy file against backtesting engine requirements
 * Run: node validate-strategy.js path/to/strategy-file.js
 */

const fs = require('fs');
const path = require('path');

function validateStrategy(filePath) {
    console.log(`🔍 Validating strategy: ${filePath}`);
    
    try {
        // Check file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        // Check file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 1. Check CommonJS export pattern
        if (!content.includes('module.exports =')) {
            throw new Error('❌ Missing CommonJS export: Must end with "module.exports = ClassName"');
        }
        
        // 2. Check no ES6 export
        if (content.includes('export class') || content.includes('export default')) {
            throw new Error('❌ ES6 exports detected: Use CommonJS "module.exports" instead');
        }
        
        // 3. Check class definition
        const classMatch = content.match(/class\s+(\w+)\s*{/);
        if (!classMatch) {
            throw new Error('❌ No class definition found');
        }
        
        const className = classMatch[1];
        console.log(`✅ Found class: ${className}`);
        
        // 4. Check constructor signature
        if (!content.includes('constructor(parameters = {})')) {
            throw new Error('❌ Constructor must have signature: constructor(parameters = {})');
        }
        console.log('✅ Constructor signature correct');
        
        // 5. Check required properties
        const requiredProps = [
            'this.name =',
            'this.maxRiskPerTrade =',
            'this.preferredDTE =', 
            'this.contractsPerTrade =',
            'this.currentPositions ='
        ];
        
        requiredProps.forEach(prop => {
            if (!content.includes(prop)) {
                throw new Error(`❌ Missing required property: ${prop}`);
            }
        });
        console.log('✅ All required properties found');
        
        // 6. Check required methods
        const requiredMethods = [
            'generateSignals(',
            'reset(',
            'canOpenPosition(',
            'getContractCriteria(',
            'getTradingStyle(',
            'getRiskLevel(',
            'getDescription('
        ];
        
        const missingMethods = requiredMethods.filter(method => !content.includes(method));
        if (missingMethods.length > 0) {
            throw new Error(`❌ Missing required methods: ${missingMethods.join(', ')}`);
        }
        console.log('✅ All required methods found');
        
        // 7. Check generateSignals return pattern
        if (!content.includes('return signals;') && !content.includes('return []')) {
            console.warn('⚠️  Warning: generateSignals should return array of signals');
        }
        
        // 8. Check signal object format in examples
        const signalPushPattern = /signals\.push\s*\(\s*\{[\s\S]*?\}\s*\)/g;
        const signalPushes = content.match(signalPushPattern);
        
        if (signalPushes) {
            const requiredSignalProps = [
                'timestamp:',
                'signal_type:',
                'underlying_price:',
                'signal_strength:',
                'position_size:',
                'signal_reason:',
                'target_delta:',
                'option_type:'
            ];
            
            signalPushes.forEach((push, index) => {
                requiredSignalProps.forEach(prop => {
                    if (!push.includes(prop)) {
                        console.warn(`⚠️  Warning: Signal object ${index + 1} missing ${prop}`);
                    }
                });
            });
        }
        
        // 9. Try to load the module
        try {
            delete require.cache[path.resolve(filePath)];
            const StrategyClass = require(path.resolve(filePath));
            
            if (typeof StrategyClass !== 'function') {
                throw new Error('❌ Module export is not a constructor function');
            }
            
            // Try to instantiate
            const instance = new StrategyClass();
            
            // Validate instance has required methods
            requiredMethods.forEach(method => {
                const methodName = method.replace('(', '');
                if (typeof instance[methodName] !== 'function') {
                    throw new Error(`❌ Instance missing method: ${methodName}`);
                }
            });
            
            console.log('✅ Module loads and instantiates correctly');
            
            // Test generateSignals with dummy data
            try {
                const testBars = [{
                    t: Date.now(),
                    close: 100,
                    volume: 1000,
                    vwap: 100
                }];
                
                const signals = instance.generateSignals(testBars);
                
                if (!Array.isArray(signals)) {
                    throw new Error('❌ generateSignals must return array');
                }
                
                console.log(`✅ generateSignals returns array (${signals.length} signals)`);
                
            } catch (error) {
                console.warn(`⚠️  Warning: Error testing generateSignals: ${error.message}`);
            }
            
        } catch (error) {
            throw new Error(`❌ Module loading error: ${error.message}`);
        }
        
        console.log('✅ All validations passed!');
        console.log(`✅ Strategy ${className} is ready for backtesting`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Validation failed: ${error.message}`);
        return false;
    }
}

// CLI usage
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node validate-strategy.js <strategy-file.js>');
        process.exit(1);
    }
    
    const isValid = validateStrategy(filePath);
    process.exit(isValid ? 0 : 1);
}

module.exports = { validateStrategy };