/**
 * Greeks Validation System
 * 
 * Ensures all options data has proper Greeks calculations:
 * - PUT options: Delta must be negative (0 to -1)
 * - CALL options: Delta must be positive (0 to +1)  
 * - No synthetic data with all zero Greeks
 * - Realistic price ranges and implied volatility
 */

class GreeksValidator {
    constructor() {
        this.name = "Greeks Validator";
        this.validationRules = {
            // Delta validation rules
            putDeltaRange: { min: -1.0, max: 0.0 },
            callDeltaRange: { min: 0.0, max: 1.0 },
            
            // Greeks bounds (realistic ranges)
            gammaRange: { min: 0.0, max: 10.0 },
            thetaRange: { min: -100.0, max: 0.0 },
            vegaRange: { min: 0.0, max: 10.0 },
            
            // IV bounds (10% to 500%)
            ivRange: { min: 0.1, max: 5.0 },
            
            // Price validation
            minOptionPrice: 0.005,  // $0.005 minimum
            maxOptionPrice: 1000.0, // $1000 maximum
            
            // Synthetic data detection
            syntheticPriceFlag: 0.01,  // Exactly $0.01 = synthetic
            zeroGreeksThreshold: 4     // If 4+ Greeks are zero = synthetic
        };
    }

    /**
     * Validate a single options data bar
     */
    validateOptionsBar(contractData, barData) {
        const errors = [];
        const warnings = [];

        try {
            const { option_type, strike_price, underlying_symbol } = contractData;
            const { 
                delta, gamma, theta, vega, rho, implied_volatility,
                option_open, option_high, option_low, option_close,
                underlying_price, time_to_expiry
            } = barData;

            // 1. DELTA VALIDATION - Most critical check
            if (option_type === 'PUT') {
                if (delta > this.validationRules.putDeltaRange.max) {
                    errors.push(`PUT delta ${delta.toFixed(3)} is positive (should be negative)`);
                }
                if (delta < this.validationRules.putDeltaRange.min) {
                    errors.push(`PUT delta ${delta.toFixed(3)} exceeds minimum bound -1.0`);
                }
            } else if (option_type === 'CALL') {
                if (delta < this.validationRules.callDeltaRange.min) {
                    errors.push(`CALL delta ${delta.toFixed(3)} is negative (should be positive)`);
                }
                if (delta > this.validationRules.callDeltaRange.max) {
                    errors.push(`CALL delta ${delta.toFixed(3)} exceeds maximum bound 1.0`);
                }
            }

            // 2. SYNTHETIC DATA DETECTION
            const zeroGreeksCount = [delta, gamma, theta, vega].filter(g => g === 0).length;
            if (zeroGreeksCount >= this.validationRules.zeroGreeksThreshold) {
                errors.push(`Synthetic data detected: ${zeroGreeksCount} Greeks are zero`);
            }

            // Check for fixed synthetic prices
            const allPricesSame = (option_open === option_high && 
                                 option_high === option_low && 
                                 option_low === option_close);
            if (allPricesSame && option_close === this.validationRules.syntheticPriceFlag) {
                errors.push(`Synthetic prices detected: all OHLC = $${this.validationRules.syntheticPriceFlag}`);
            }

            // 3. GREEKS BOUNDS VALIDATION
            if (gamma < this.validationRules.gammaRange.min || gamma > this.validationRules.gammaRange.max) {
                warnings.push(`Gamma ${gamma.toFixed(3)} outside normal range [${this.validationRules.gammaRange.min}, ${this.validationRules.gammaRange.max}]`);
            }

            if (theta < this.validationRules.thetaRange.min || theta > this.validationRules.thetaRange.max) {
                warnings.push(`Theta ${theta.toFixed(2)} outside normal range [${this.validationRules.thetaRange.min}, ${this.validationRules.thetaRange.max}]`);
            }

            if (vega < this.validationRules.vegaRange.min || vega > this.validationRules.vegaRange.max) {
                warnings.push(`Vega ${vega.toFixed(3)} outside normal range [${this.validationRules.vegaRange.min}, ${this.validationRules.vegaRange.max}]`);
            }

            // 4. IMPLIED VOLATILITY VALIDATION
            if (implied_volatility < this.validationRules.ivRange.min || implied_volatility > this.validationRules.ivRange.max) {
                warnings.push(`IV ${(implied_volatility * 100).toFixed(1)}% outside normal range [${this.validationRules.ivRange.min * 100}%, ${this.validationRules.ivRange.max * 100}%]`);
            }

            // 5. OPTION PRICE VALIDATION
            if (option_close < this.validationRules.minOptionPrice) {
                warnings.push(`Option price $${option_close.toFixed(3)} below minimum $${this.validationRules.minOptionPrice}`);
            }
            if (option_close > this.validationRules.maxOptionPrice) {
                warnings.push(`Option price $${option_close.toFixed(2)} above maximum $${this.validationRules.maxOptionPrice}`);
            }

            // 6. TIME TO EXPIRY VALIDATION
            if (time_to_expiry <= 0) {
                errors.push(`Invalid time to expiry: ${time_to_expiry}`);
            }

            // 7. MONEYNESS CONSISTENCY CHECK
            const moneyness = option_type === 'PUT' ? 
                (strike_price - underlying_price) : (underlying_price - strike_price);
            const isITM = moneyness > 0;
            const deltaAbsolute = Math.abs(delta);

            // Deep ITM options should have high absolute delta
            if (isITM && Math.abs(moneyness) > 10 && deltaAbsolute < 0.7) {
                warnings.push(`Deep ITM option (${moneyness.toFixed(2)}) has low delta ${deltaAbsolute.toFixed(3)}`);
            }

            // Deep OTM options should have low absolute delta  
            if (!isITM && Math.abs(moneyness) > 10 && deltaAbsolute > 0.3) {
                warnings.push(`Deep OTM option (${moneyness.toFixed(2)}) has high delta ${deltaAbsolute.toFixed(3)}`);
            }

        } catch (error) {
            errors.push(`Validation error: ${error.message}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: {
                errorCount: errors.length,
                warningCount: warnings.length,
                status: errors.length === 0 ? 'VALID' : 'INVALID'
            }
        };
    }

    /**
     * Validate options data before saving to database
     */
    validateBeforeSave(contractData, barDataArray) {
        const results = {
            totalBars: barDataArray.length,
            validBars: 0,
            invalidBars: 0,
            barResults: [],
            summary: {
                shouldSave: false,
                validationPassed: false,
                criticalErrors: [],
                totalErrors: 0,
                totalWarnings: 0
            }
        };

        console.log(`🔍 [GREEKS VALIDATOR] Validating ${barDataArray.length} bars for ${contractData.contract_symbol}`);

        barDataArray.forEach((barData, index) => {
            const validation = this.validateOptionsBar(contractData, barData);
            
            if (validation.isValid) {
                results.validBars++;
            } else {
                results.invalidBars++;
                results.summary.criticalErrors.push(...validation.errors);
            }

            results.summary.totalErrors += validation.errors.length;
            results.summary.totalWarnings += validation.warnings.length;
            
            results.barResults.push({
                barIndex: index,
                timestamp: barData.bar_timestamp,
                ...validation
            });

            // Log critical errors immediately
            if (validation.errors.length > 0) {
                console.log(`❌ [VALIDATION ERROR] Bar ${index}: ${validation.errors.join(', ')}`);
            }
        });

        // Determine if data should be saved
        const validPercentage = (results.validBars / results.totalBars) * 100;
        results.summary.shouldSave = validPercentage >= 80; // Require 80% valid bars
        results.summary.validationPassed = results.invalidBars === 0;

        console.log(`📊 [VALIDATION SUMMARY] ${contractData.contract_symbol}:`);
        console.log(`   ✅ Valid bars: ${results.validBars}/${results.totalBars} (${validPercentage.toFixed(1)}%)`);
        console.log(`   ❌ Invalid bars: ${results.invalidBars}`);
        console.log(`   📋 Total errors: ${results.summary.totalErrors}, warnings: ${results.summary.totalWarnings}`);
        console.log(`   💾 Should save: ${results.summary.shouldSave ? 'YES' : 'NO'}`);

        return results;
    }

    /**
     * Quick validation check for existing database data
     */
    async validateExistingData(pool, limit = 1000) {
        try {
            console.log(`🔍 [GREEKS VALIDATOR] Running validation on existing database data (limit: ${limit})...`);

            const query = `
                SELECT 
                    oc.contract_symbol,
                    oc.option_type,
                    oc.strike_price,
                    ocb.delta,
                    ocb.gamma,
                    ocb.theta,
                    ocb.vega,
                    ocb.implied_volatility,
                    ocb.option_close,
                    ocb.underlying_price,
                    ocb.time_to_expiry,
                    ocb.bar_timestamp
                FROM option_contracts oc
                JOIN option_contract_bars ocb ON oc.instance_id = ocb.contract_instance_id
                WHERE oc.underlying_symbol = 'IWM'
                ORDER BY ocb.bar_timestamp DESC
                LIMIT $1
            `;

            const result = await pool.query(query, [limit]);
            let validCount = 0;
            let invalidCount = 0;
            const criticalIssues = [];

            result.rows.forEach(row => {
                const validation = this.validateOptionsBar(
                    { 
                        option_type: row.option_type, 
                        strike_price: row.strike_price,
                        contract_symbol: row.contract_symbol,
                        underlying_symbol: 'IWM'
                    },
                    row
                );

                if (validation.isValid) {
                    validCount++;
                } else {
                    invalidCount++;
                    if (validation.errors.length > 0) {
                        criticalIssues.push({
                            contract: row.contract_symbol,
                            timestamp: row.bar_timestamp,
                            errors: validation.errors
                        });
                    }
                }
            });

            const validPercentage = (validCount / result.rows.length) * 100;

            console.log(`\n📊 [DATABASE VALIDATION RESULTS]:`);
            console.log(`   Total bars checked: ${result.rows.length}`);
            console.log(`   ✅ Valid bars: ${validCount} (${validPercentage.toFixed(1)}%)`);
            console.log(`   ❌ Invalid bars: ${invalidCount}`);
            console.log(`   🚨 Critical issues: ${criticalIssues.length}`);

            if (criticalIssues.length > 0 && criticalIssues.length <= 10) {
                console.log(`\n🔍 Sample critical issues:`);
                criticalIssues.slice(0, 5).forEach(issue => {
                    console.log(`   ❌ ${issue.contract}: ${issue.errors.join(', ')}`);
                });
            }

            return {
                totalChecked: result.rows.length,
                validCount,
                invalidCount,
                validPercentage,
                criticalIssues,
                overallStatus: validPercentage >= 95 ? 'EXCELLENT' : 
                              validPercentage >= 80 ? 'GOOD' : 'NEEDS_CLEANUP'
            };

        } catch (error) {
            console.error('❌ [VALIDATION ERROR] Database validation failed:', error.message);
            throw error;
        }
    }

    /**
     * Get validation statistics
     */
    getValidationStats() {
        return {
            rules: this.validationRules,
            checks: [
                'Delta sign validation (PUT negative, CALL positive)',
                'Synthetic data detection (zero Greeks, fixed prices)',
                'Greeks bounds checking (realistic ranges)',
                'Implied volatility bounds (10% - 500%)',
                'Option price validation',
                'Time to expiry validation',
                'Moneyness consistency checks'
            ],
            thresholds: {
                saveThreshold: '80% valid bars required',
                passThreshold: '100% valid bars for full pass'
            }
        };
    }
}

module.exports = GreeksValidator;