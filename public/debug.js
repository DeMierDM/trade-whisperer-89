// COMPREHENSIVE BACKTEST RESULTS DEBUGGER
// Run this in browser console on http://localhost:8080

console.log('%c🔍 BACKTEST RESULTS COMPREHENSIVE DEBUG TOOL', 'background: #222; color: #0f0; font-size: 20px; font-weight: bold; padding: 10px;');

async function comprehensiveDebug() {
    const results = {
        apiCheck: null,
        dataTypes: null,
        componentCheck: null,
        renderTest: null,
        consoleErrors: []
    };
    
    // Capture console errors
    const originalError = console.error;
    console.error = function(...args) {
        results.consoleErrors.push(args.join(' '));
        originalError.apply(console, args);
    };
    
    console.log('\n' + '='.repeat(80));
    console.log('STEP 1: API DATA VERIFICATION');
    console.log('='.repeat(80));
    
    try {
        const metricsResp = await fetch('http://localhost:3002/api/backtest/status/125');
        const metrics = await metricsResp.json();
        
        const tradesResp = await fetch('http://localhost:3002/api/backtest/125/trades');
        const trades = await tradesResp.json();
        
        console.log('✅ API Response Success');
        console.log(`📊 Metrics: ${Object.keys(metrics).length} fields`);
        console.log(`📈 Trades: ${trades.length} trades`);
        
        results.apiCheck = { success: true, metricsFields: Object.keys(metrics).length, tradesCount: trades.length };
        
        console.log('\n' + '='.repeat(80));
        console.log('STEP 2: DATA TYPE ANALYSIS');
        console.log('='.repeat(80));
        
        const typeChecks = {
            'metrics.initial_capital': { value: metrics.initial_capital, type: typeof metrics.initial_capital },
            'metrics.final_capital': { value: metrics.final_capital, type: typeof metrics.final_capital },
            'metrics.total_return': { value: metrics.total_return, type: typeof metrics.total_return },
            'metrics.sharpe_ratio': { value: metrics.sharpe_ratio, type: typeof metrics.sharpe_ratio },
            'metrics.win_rate': { value: metrics.win_rate, type: typeof metrics.win_rate },
            'metrics.profit_factor': { value: metrics.profit_factor, type: typeof metrics.profit_factor },
            'trade[0].net_pnl': { value: trades[0].net_pnl, type: typeof trades[0].net_pnl },
            'trade[0].entry_price': { value: trades[0].entry_price, type: typeof trades[0].entry_price },
        };
        
        console.table(typeChecks);
        results.dataTypes = typeChecks;
        
        const allStrings = Object.values(typeChecks).every(t => t.type === 'string' || t.type === 'number');
        if (allStrings) {
            console.log('✅ All fields have valid types (string/number)');
        } else {
            console.log('⚠️ Some fields have unexpected types!');
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('STEP 3: toNumber() CONVERSION TEST');
        console.log('='.repeat(80));
        
        const toNumber = (value) => {
            if (value === undefined || value === null) return 0;
            return typeof value === 'string' ? parseFloat(value) : value;
        };
        
        const conversions = {
            'total_return': toNumber(metrics.total_return),
            'sharpe_ratio': toNumber(metrics.sharpe_ratio),
            'win_rate': toNumber(metrics.win_rate),
            'profit_factor': toNumber(metrics.profit_factor),
            'profit_dollars': toNumber(metrics.final_capital) - toNumber(metrics.initial_capital),
            'first_trade_pnl': toNumber(trades[0].net_pnl),
        };
        
        console.table(conversions);
        
        const allNumbers = Object.values(conversions).every(v => typeof v === 'number' && !isNaN(v));
        if (allNumbers) {
            console.log('✅ All conversions successful - no NaN values');
        } else {
            console.log('❌ Some conversions failed - NaN detected!');
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('STEP 4: DOM COMPONENT CHECK');
        console.log('='.repeat(80));
        
        setTimeout(() => {
            // Check for BacktestResults in DOM
            const backResults = document.querySelector('[class*="BacktestResults"]');
            const cards = document.querySelectorAll('[class*="card"]');
            const tables = document.querySelectorAll('table');
            
            console.log('DOM Elements Found:');
            console.log(`- BacktestResults class: ${backResults ? '✅ FOUND' : '❌ NOT FOUND'}`);
            console.log(`- Card components: ${cards.length}`);
            console.log(`- Table elements: ${tables.length}`);
            
            if (backResults) {
                console.log('BacktestResults HTML:', backResults.outerHTML.substring(0, 500));
            }
            
            // Check for error boundary
            const errorBoundary = document.querySelector('[class*="border-red-500"]');
            if (errorBoundary) {
                console.log('🚨 ERROR BOUNDARY CAUGHT AN ERROR!');
                console.log(errorBoundary.textContent);
            }
            
            results.componentCheck = {
                backResults: !!backResults,
                cards: cards.length,
                tables: tables.length,
                hasErrorBoundary: !!errorBoundary
            };
            
            console.log('\n' + '='.repeat(80));
            console.log('STEP 5: RENDER SIMULATION');
            console.log('='.repeat(80));
            
            try {
                // Simulate the actual rendering logic
                const equityCurve = trades.reduce((acc, trade, index) => {
                    const prevEquity = index === 0 ? toNumber(metrics.initial_capital) : acc[index - 1].equity;
                    acc.push({
                        trade: index + 1,
                        equity: prevEquity + toNumber(trade.net_pnl),
                        pnl: toNumber(trade.net_pnl),
                    });
                    return acc;
                }, []);
                
                console.log('✅ Equity curve calculation: SUCCESS');
                console.log(`   - Points: ${equityCurve.length}`);
                console.log(`   - Start: $${equityCurve[0].equity.toFixed(2)}`);
                console.log(`   - End: $${equityCurve[equityCurve.length - 1].equity.toFixed(2)}`);
                
                const hourlyPerf = trades.reduce((acc, trade) => {
                    const hour = new Date(trade.entry_timestamp).getHours();
                    if (!acc[hour]) {
                        acc[hour] = { hour, trades: 0, wins: 0, totalPnl: 0 };
                    }
                    acc[hour].trades++;
                    if (toNumber(trade.net_pnl) > 0) acc[hour].wins++;
                    acc[hour].totalPnl += toNumber(trade.net_pnl);
                    return acc;
                }, {});
                
                console.log('✅ Hourly performance calculation: SUCCESS');
                console.log(`   - Hours: ${Object.keys(hourlyPerf).length}`);
                
                results.renderTest = { success: true, equityPoints: equityCurve.length, hours: Object.keys(hourlyPerf).length };
                
            } catch (error) {
                console.log('❌ Render simulation FAILED:', error.message);
                console.log('Stack:', error.stack);
                results.renderTest = { success: false, error: error.message };
            }
            
            console.log('\n' + '='.repeat(80));
            console.log('FINAL SUMMARY');
            console.log('='.repeat(80));
            
            console.table({
                'API Data': results.apiCheck?.success ? '✅ OK' : '❌ FAIL',
                'Data Types': results.dataTypes ? '✅ OK' : '❌ FAIL',
                'Component in DOM': results.componentCheck?.backResults ? '✅ OK' : '❌ NOT FOUND',
                'Render Test': results.renderTest?.success ? '✅ OK' : '❌ FAIL',
                'Console Errors': results.consoleErrors.length
            });
            
            if (results.consoleErrors.length > 0) {
                console.log('\n🚨 CONSOLE ERRORS DETECTED:');
                results.consoleErrors.forEach((err, i) => {
                    console.log(`${i + 1}. ${err}`);
                });
            }
            
            if (!results.componentCheck?.backResults) {
                console.log('\n⚠️ DIAGNOSIS: Component not rendering in DOM');
                console.log('Possible causes:');
                console.log('1. Component crashed before mounting');
                console.log('2. Conditional rendering prevented it');
                console.log('3. Error boundary caught an error');
                console.log('\nCheck: metrics &&trades values in React DevTools');
            }
            
            console.log('\n' + '='.repeat(80));
            console.log('DEBUG COMPLETE - Results saved to window.debugResults');
            console.log('='.repeat(80));
            
            window.debugResults = results;
        }, 2000);
        
    } catch (error) {
        console.error('❌ Debug script failed:', error);
        results.apiCheck = { success: false, error: error.message };
    }
}

// Auto-run
comprehensiveDebug();

console.log('\n💡 TIP: After backtest completes, run comprehensiveDebug() again to recheck');
console.log('💡 Access results via: window.debugResults');
