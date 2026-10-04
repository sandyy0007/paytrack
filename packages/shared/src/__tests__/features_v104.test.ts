import { describe, expect, it } from 'vitest';
import {
  calculateCashflowForecast,
  detectExpenseAnomalies,
  calculateFinancialHealthScore,
  type AnalyticsExpense,
} from '../analytics';

describe('v1.0.4 Fintech Features: Forecast, Anomalies, Health Score', () => {
  const baseExpenses: AnalyticsExpense[] = [
    {
      amountPaise: 50_000, // ₹500
      status: 'PAID',
      category: 'Food',
      payeeName: 'Cafe Coffee',
      upiId: 'cafe@upi',
      expenseDate: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      amountPaise: 60_000, // ₹600
      status: 'PAID',
      category: 'Food',
      payeeName: 'Swiggy',
      upiId: 'swiggy@upi',
      expenseDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    },
    {
      amountPaise: 500_000, // ₹5,000 (Anomaly in Food)
      status: 'PAID',
      category: 'Food',
      payeeName: 'Luxury Feast',
      upiId: 'luxury@upi',
      expenseDate: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    },
  ];

  it('calculates cashflow forecast accurately', () => {
    const forecast = calculateCashflowForecast(baseExpenses, 30);
    expect(forecast.days).toBe(30);
    expect(forecast.historicalDailyAveragePaise).toBeGreaterThan(0);
    expect(forecast.projectedTotalPaise).toBe(forecast.historicalDailyAveragePaise * 30);
    expect(forecast.projectedCurve).toHaveLength(30);
    expect(forecast.projectedTopCategories[0]?.category).toBe('Food');
  });

  it('detects high expense anomalies', () => {
    const anomalies = detectExpenseAnomalies(baseExpenses);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.category).toBe('Food');
    expect(anomalies[0]?.amountPaise).toBe(500_000);
    expect(anomalies[0]?.severity).toBe('HIGH');
  });

  it('calculates financial health score with transparent factors', () => {
    const health = calculateFinancialHealthScore({
      expenses: baseExpenses,
      budgets: [{ amountPaise: 100_000, spentPaise: 60_000 }],
      loans: [],
      envelopesCount: 2,
    });
    expect(health.totalScore).toBeGreaterThanOrEqual(70);
    expect(['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_ATTENTION']).toContain(health.rating);
    expect(health.factors).toHaveLength(4);
    expect(health.factors[0]?.title).toBe('Budget Adherence');
    expect(health.factors[0]?.status).toBe('EXCELLENT');
  });
});
