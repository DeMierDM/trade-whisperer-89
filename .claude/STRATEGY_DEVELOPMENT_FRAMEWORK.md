# Strategy Development Framework
## Complete Template-Based Strategy Creation

This framework ensures **PERFECT INTEGRATION** with the backtesting engine by following the exact patterns from working strategies.

## 🎯 MANDATORY CLASS STRUCTURE

### 1. CLASS DEFINITION & EXPORT
```javascript
class YourStrategyName {
    constructor(parameters = {}) {
        // Implementation here
    }
    // Methods here
}

module.exports = YourStrategyName;  // ⚠️ CRITICAL: Must be CommonJS export
```

### 2. REQUIRED CONSTRUCTOR PROPERTIES

#### **Basic Identity** (REQUIRED - OPTIONS TRADING STRUCTURE)
```javascript
this.name = "Strategy Display Name";
this.maxRiskPerTrade = 0.025;           // ⚠️ REQUIRED: Max 2.5% capital per position
this.preferredDTE = 0;                  // ⚠️ REQUIRED: 0DTE options
this.maxPositions = 10;                 // ⚠️ REQUIRED: Max separate positions (each different strike)
this.contractsPerTrade = 100;           // ⚠️ REQUIRED: Max contracts per position (1-100 range)
this.currentPositions = [];             // ⚠️ REQUIRED: Tracks positions with separate P&L

// OPTIONS POSITION RULES:
// - 1 Position = 1-100 contracts of SPECIFIC strike price  
// - Multiple positions = different strikes/expirations allowed simultaneously
// - Each position has individual P&L tracking
// - Portfolio P&L = sum of all position P&Ls
```

#### **Strategy Parameters** (Pattern from working strategies)
```javascript
// All strategy-specific parameters as instance properties
this.rsiPeriod = parameters.rsiPeriod || 14;
this.rsiOversold = parameters.rsiOversold || 40;
this.rsiOverbought = parameters.rsiOverbought || 60;
// etc. - ALL parameters as this.propertyName
```

## 🔧 REQUIRED METHODS (ALL 7 MUST BE IMPLEMENTED)

### 1. generateSignals(underlyingBars) ⚠️ CRITICAL
```javascript
generateSignals(underlyingBars) {
    const signals = [];  // ⚠️ MUST return array, not object
    
    // Process bars and generate signals
    underlyingBars.forEach((bar, index) => {
        // Your signal logic here
        
        // When signal found, push object with this EXACT format:
        signals.push({
            timestamp: bar.t,                    // ⚠️ REQUIRED: bar.t (not bar.timestamp)
            signal_type: 'BUY_CALL',           // ⚠️ REQUIRED: 'BUY_CALL' or 'BUY_PUT'
            underlying_price: bar.close,        // ⚠️ REQUIRED
            signal_strength: 1.5,              // ⚠️ REQUIRED: number
            position_size: 1,                  // ⚠️ REQUIRED
            signal_reason: "Descriptive reason", // ⚠️ REQUIRED
            target_delta: 0.85,                // ⚠️ REQUIRED: positive for calls, negative for puts
            option_type: 'call'                // ⚠️ REQUIRED: 'call' or 'put'
        });
    });
    
    return signals;  // ⚠️ MUST return array
}
```

### 2. reset() ⚠️ REQUIRED
```javascript
reset() {
    this.currentPositions = [];
    // Reset any other state variables
    console.log(`Strategy reset - Ready for new backtest`);
}
```

### 3. canOpenPosition() ⚠️ REQUIRED
```javascript
canOpenPosition() {
    return this.currentPositions.length < this.maxPositions;
}
```

### 4. getContractCriteria(signal) ⚠️ REQUIRED
```javascript
getContractCriteria(signal) {
    return {
        optionType: signal.signal_type === 'BUY_CALL' ? 'CALL' : 'PUT',
        minDelta: 0.75,
        maxDelta: 1.00,
        preferredDelta: 0.85,
        maxSpreadPercent: 0.25,
        minVolume: 10,
        dteRange: [0, 2]
    };
}
```

### 5. getTradingStyle() ⚠️ REQUIRED
```javascript
getTradingStyle() {
    return 'Your Trading Style';
}
```

### 6. getRiskLevel() ⚠️ REQUIRED
```javascript
getRiskLevel() {
    return 'Low-Medium';  // 'Low', 'Low-Medium', 'Medium', 'High'
}
```

### 7. getDescription() ⚠️ REQUIRED
```javascript
getDescription() {
    return 'Detailed strategy description';
}
```

## 📋 STRATEGY DEVELOPMENT CHECKLIST

### Phase 1: Setup ✅
- [ ] Create class with correct name
- [ ] Add constructor with `parameters = {}` signature
- [ ] Set all REQUIRED properties (name, maxRiskPerTrade, preferredDTE, contractsPerTrade, currentPositions)
- [ ] Add all strategy parameters as instance properties (this.parameterName)
- [ ] Add module.exports = ClassName at end

### Phase 2: Core Logic ✅
- [ ] Implement generateSignals() returning ARRAY of signal objects
- [ ] Ensure each signal object has ALL required properties
- [ ] Use correct timestamp format (bar.t not bar.timestamp)
- [ ] Set correct signal_type ('BUY_CALL' or 'BUY_PUT')
- [ ] Set target_delta correctly (positive for calls, negative for puts)

### Phase 3: Required Methods ✅
- [ ] Implement reset() method
- [ ] Implement canOpenPosition() method
- [ ] Implement getContractCriteria() method
- [ ] Implement getTradingStyle() method  
- [ ] Implement getRiskLevel() method
- [ ] Implement getDescription() method

### Phase 4: Validation ✅
- [ ] Check syntax with ESLint (no errors)
- [ ] Verify all method signatures match template exactly
- [ ] Test strategy registration (appears in /api/strategies list)
- [ ] Run basic backtest (no "method not found" errors)
- [ ] Verify signals generated (check logs)

## ⚠️ COMMON MISTAKES TO AVOID

### 1. Export Format
- ❌ `export class StrategyName`
- ✅ `module.exports = StrategyName`

### 2. Signal Return Format
- ❌ `return { callSignal: true, putSignal: false }`
- ✅ `return [{ signal_type: 'BUY_CALL', ... }]`

### 3. Missing Required Properties
- ❌ Missing maxRiskPerTrade, preferredDTE, contractsPerTrade
- ✅ All required properties set in constructor

### 4. Missing Required Methods
- ❌ Missing reset(), canOpenPosition(), etc.
- ✅ All 7 required methods implemented

### 5. Signal Object Format
- ❌ `timestamp: bar.timestamp`
- ✅ `timestamp: bar.t`
- ❌ `target_delta: 0.85` for puts
- ✅ `target_delta: -0.85` for puts

## 🔍 VALIDATION SCRIPT

```javascript
// Strategy validation function
function validateStrategy(StrategyClass) {
    const instance = new StrategyClass();
    
    // Check required properties
    const requiredProps = ['name', 'maxRiskPerTrade', 'preferredDTE', 'contractsPerTrade', 'currentPositions'];
    requiredProps.forEach(prop => {
        if (!(prop in instance)) throw new Error(`Missing required property: ${prop}`);
    });
    
    // Check required methods
    const requiredMethods = ['generateSignals', 'reset', 'canOpenPosition', 'getContractCriteria', 'getTradingStyle', 'getRiskLevel', 'getDescription'];
    requiredMethods.forEach(method => {
        if (typeof instance[method] !== 'function') throw new Error(`Missing required method: ${method}`);
    });
    
    console.log('✅ Strategy validation passed');
}
```

## 🚀 EXAMPLE PERFECT STRATEGY TEMPLATE

```javascript
class PerfectStrategyTemplate {
    constructor(parameters = {}) {
        // REQUIRED PROPERTIES
        this.name = "Perfect Strategy Template";
        this.maxRiskPerTrade = 0.025;
        this.preferredDTE = 0;
        this.contractsPerTrade = 1;
        this.currentPositions = [];
        
        // STRATEGY PARAMETERS
        this.rsiPeriod = parameters.rsiPeriod || 14;
        this.rsiOversold = parameters.rsiOversold || 40;
        this.rsiOverbought = parameters.rsiOverbought || 60;
        // Add all your parameters here
    }
    
    generateSignals(underlyingBars) {
        const signals = [];
        // Your signal logic here
        return signals;
    }
    
    reset() {
        this.currentPositions = [];
        console.log('Strategy reset');
    }
    
    canOpenPosition() {
        return this.currentPositions.length < 100;
    }
    
    getContractCriteria(signal) {
        return {
            optionType: signal.signal_type === 'BUY_CALL' ? 'CALL' : 'PUT',
            minDelta: 0.75,
            maxDelta: 1.00,
            preferredDelta: 0.85,
            maxSpreadPercent: 0.25,
            minVolume: 10,
            dteRange: [0, 2]
        };
    }
    
    getTradingStyle() {
        return 'Template Style';
    }
    
    getRiskLevel() {
        return 'Low-Medium';
    }
    
    getDescription() {
        return 'Perfect strategy template for development';
    }
}

module.exports = PerfectStrategyTemplate;
```

## 📖 USAGE

1. **Copy the example template above**
2. **Rename the class and customize parameters**
3. **Implement your signal logic in generateSignals()**
4. **Run validation checklist**
5. **Test registration and basic backtest**

This framework eliminates ALL integration issues by ensuring perfect compatibility with the backtesting engine.