'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { createChart, CandlestickData, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import { getAffiliateByReferralCode, createClient, getClients, addTrade, updateTrade, getTrades } from '@/lib/store';
import { DerivClient } from '@/lib/deriv';
import { Trade, CandleData } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface OpenPosition {
  contractId: number;
  symbol: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  currentPrice: number;
  profit: number;
  buyPrice: number;
  payout: number;
  startTime: number;
}

export default function TradingPage() {
  const params = useParams();
  const referralCode = params.referralCode as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [affiliateName, setAffiliateName] = useState('Unknown');
  const [clientId, setClientId] = useState('');
  const [balance, setBalance] = useState(10000);
  const [accountId, setAccountId] = useState('');
  const [accountType, setAccountType] = useState('');

  const [symbol, setSymbol] = useState('');
  const [availableSymbols, setAvailableSymbols] = useState<Array<{ value: string; label: string }>>([]);
  const [amount, setAmount] = useState<number>(10);
  const [duration, setDuration] = useState<number>(1);
  const [durationUnit, setDurationUnit] = useState<string>('m');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);
  const [highPrice, setHighPrice] = useState<number>(0);
  const [lowPrice, setLowPrice] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [isBuying, setIsBuying] = useState(false);
  const [chartHistory, setChartHistory] = useState<CandleData[]>([]);
  const [chartReady, setChartReady] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const derivClientRef = useRef<DerivClient | null>(null);
  const lastPriceRef = useRef<number>(0);
  const openPriceRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const durationOptions = [
    { value: 't', label: 'Ticks' },
    { value: 's', label: 'Seconds' },
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
  ];

  useEffect(() => {
    const init = async () => {
      try {
        const affiliate = getAffiliateByReferralCode(referralCode);
        if (affiliate) {
          setAffiliateName(affiliate.name);
        }

        let client = getClients().find(c => c.referralCode === referralCode);
        if (!client) {
          client = createClient(referralCode);
        }
        setClientId(client.id);

        const derivClient = new DerivClient();
        derivClientRef.current = derivClient;

        await derivClient.connect();
        setIsConnected(true);

        const balanceRes = await derivClient.getBalance(true);
        setBalance(balanceRes.balance.balance);
        setAccountId(balanceRes.balance.loginid);
        setAccountType(derivClient.getAccountType(balanceRes.balance.loginid));

        derivClient.subscribeToBalance((data) => {
          setBalance(data.balance.balance);
        });

        const activeSymbols = await derivClient.getActiveSymbols();
        const openSymbols = activeSymbols.filter(s => s.isOpen);

        const syntheticSymbols = openSymbols
          .filter(s => s.market === 'synthetic_index')
          .map(s => ({ value: s.symbol, label: s.display_name }));

        let symbolsToUse = syntheticSymbols;
        if (syntheticSymbols.length === 0) {
          symbolsToUse = openSymbols
            .filter(s => s.market === 'forex')
            .slice(0, 10)
            .map(s => ({ value: s.symbol, label: s.display_name }));
        }

        if (symbolsToUse.length === 0) {
          symbolsToUse = openSymbols
            .slice(0, 15)
            .map(s => ({ value: s.symbol, label: s.display_name }));
        }

        if (symbolsToUse.length === 0) {
          notifications.show({
            title: 'No Markets Available',
            message: 'All markets are currently closed. Please try again later.',
            color: 'yellow',
          });
        }

        setAvailableSymbols(symbolsToUse);

        const defaultSymbol = symbolsToUse[0]?.value || 'R_100';
        setSymbol(defaultSymbol);

        const history = await derivClient.getTickHistory(defaultSymbol, 100, 60);

        if (history.length > 0) {
          openPriceRef.current = history[0].open;
          const prices = history.map(c => [c.high, c.low]).flat();
          setHighPrice(Math.max(...prices));
          setLowPrice(Math.min(...prices));
        }

        // Store history for chart initialization after render
        setChartHistory(history);

        derivClient.subscribeTicks(defaultSymbol, (data) => {
          const newPrice = data.tick.quote;
          if (lastPriceRef.current !== 0) {
            setPriceChange(newPrice > lastPriceRef.current ? 'up' : newPrice < lastPriceRef.current ? 'down' : null);
            setTimeout(() => setPriceChange(null), 300);
          }
          if (openPriceRef.current !== 0) {
            const change = ((newPrice - openPriceRef.current) / openPriceRef.current) * 100;
            setPriceChangePercent(change);
          }
          if (newPrice > highPrice || highPrice === 0) setHighPrice(newPrice);
          if (newPrice < lowPrice || lowPrice === 0) setLowPrice(newPrice);
          lastPriceRef.current = newPrice;
          setCurrentPrice(newPrice);
          updateChart(data.tick.epoch, newPrice);
        });

        setIsLoading(false);
        // Signal that we're ready to init chart
        setChartReady(true);
      } catch (err) {
        console.error('Failed to initialize:', err);
        notifications.show({
          title: 'Connection Error',
          message: 'Failed to connect to trading server. Please refresh.',
          color: 'red',
        });
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (derivClientRef.current) {
        derivClientRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [referralCode]);

  // Initialize chart after component renders and data is ready
  useEffect(() => {
    if (!isLoading && chartReady && chartHistory.length > 0 && chartContainerRef.current && !chartRef.current) {
      // Use requestAnimationFrame to ensure DOM is painted
      requestAnimationFrame(() => {
        setTimeout(() => {
          initChart(chartHistory);
        }, 50);
      });
    }
  }, [isLoading, chartReady, chartHistory]);

  const initChart = (history: CandleData[]) => {
    if (!chartContainerRef.current) {
      console.log('Chart container not found, retrying...');
      setTimeout(() => initChart(history), 100);
      return;
    }

    // Wait for container to have dimensions
    let containerWidth = chartContainerRef.current.clientWidth;
    const containerRect = chartContainerRef.current.getBoundingClientRect();

    // Use getBoundingClientRect as fallback
    if (containerWidth === 0 && containerRect.width > 0) {
      containerWidth = containerRect.width;
    }

    if (containerWidth === 0) {
      // Retry after a short delay if container isn't ready
      console.log('Container width is 0, retrying...');
      setTimeout(() => initChart(history), 150);
      return;
    }

    console.log('Initializing chart with width:', containerWidth);

    // Remove existing chart if any
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        console.log('Error removing chart:', e);
      }
      chartRef.current = null;
      candleSeriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height: 500,
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#71717a',
        fontFamily: "'Space Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 68, 79, 0.03)' },
        horzLines: { color: 'rgba(255, 68, 79, 0.03)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 68, 79, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#FF444F',
        },
        horzLine: {
          color: 'rgba(255, 68, 79, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#FF444F',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 68, 79, 0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 68, 79, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#FF444F',
      borderUpColor: '#22c55e',
      borderDownColor: '#FF444F',
      wickUpColor: '#22c55e',
      wickDownColor: '#FF444F',
    });

    // Format and set data
    if (history && history.length > 0) {
      const formattedData: CandlestickData[] = history.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      console.log('Setting chart data:', formattedData.length, 'candles');
      candleSeries.setData(formattedData);
    } else {
      console.log('No history data available');
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Fit content after a brief delay to ensure data is rendered
    setTimeout(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }, 100);

    // Handle resize using ResizeObserver for better accuracy
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        const { width } = entries[0].contentRect;
        if (width > 0) {
          chartRef.current.applyOptions({ width });
        }
      }
    });

    resizeObserverRef.current.observe(chartContainerRef.current);

    // Also handle window resize as fallback
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial resize after a brief delay to ensure proper dimensions
    setTimeout(() => {
      handleResize();
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }, 100);
  };

  const lastCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const updateChart = (epoch: number, price: number) => {
    if (!candleSeriesRef.current || !chartRef.current) return;

    const candleTime = Math.floor(epoch / 60) * 60;

    if (lastCandleRef.current && lastCandleRef.current.time === candleTime) {
      lastCandleRef.current.high = Math.max(lastCandleRef.current.high, price);
      lastCandleRef.current.low = Math.min(lastCandleRef.current.low, price);
      lastCandleRef.current.close = price;

      candleSeriesRef.current.update({
        time: candleTime as Time,
        open: lastCandleRef.current.open,
        high: lastCandleRef.current.high,
        low: lastCandleRef.current.low,
        close: lastCandleRef.current.close,
      });
    } else {
      lastCandleRef.current = {
        time: candleTime,
        open: price,
        high: price,
        low: price,
        close: price,
      };

      candleSeriesRef.current.update({
        time: candleTime as Time,
        open: price,
        high: price,
        low: price,
        close: price,
      });
    }
  };

  const handleSymbolChange = async (newSymbol: string) => {
    if (!newSymbol || !derivClientRef.current) return;

    setSymbolDropdownOpen(false);
    await derivClientRef.current.unsubscribeTicks(symbol);

    setSymbol(newSymbol);

    const history = await derivClientRef.current.getTickHistory(newSymbol, 100, 60);

    // Clean up existing chart properly
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
    lastCandleRef.current = null;

    // Initialize chart directly since component is already rendered
    requestAnimationFrame(() => {
      initChart(history);
    });

    if (history.length > 0) {
      openPriceRef.current = history[0].open;
      const prices = history.map(c => [c.high, c.low]).flat();
      setHighPrice(Math.max(...prices));
      setLowPrice(Math.min(...prices));
    }

    derivClientRef.current.subscribeTicks(newSymbol, (data) => {
      const newPrice = data.tick.quote;
      if (lastPriceRef.current !== 0) {
        setPriceChange(newPrice > lastPriceRef.current ? 'up' : newPrice < lastPriceRef.current ? 'down' : null);
        setTimeout(() => setPriceChange(null), 300);
      }
      if (openPriceRef.current !== 0) {
        const change = ((newPrice - openPriceRef.current) / openPriceRef.current) * 100;
        setPriceChangePercent(change);
      }
      lastPriceRef.current = newPrice;
      setCurrentPrice(newPrice);
      updateChart(data.tick.epoch, newPrice);
    });
  };

  const executeTrade = async (direction: 'CALL' | 'PUT') => {
    if (!derivClientRef.current || isBuying || !symbol) return;

    setIsBuying(true);

    try {
      const proposal = await derivClientRef.current.getProposal({
        symbol,
        amount,
        contractType: direction,
        duration,
        durationUnit: durationUnit as 's' | 'm' | 'h' | 't',
      });

      const buyResponse = await derivClientRef.current.buy(
        proposal.proposal.id,
        proposal.proposal.ask_price
      );

      const position: OpenPosition = {
        contractId: buyResponse.buy.contract_id,
        symbol,
        direction,
        entryPrice: currentPrice,
        currentPrice,
        profit: 0,
        buyPrice: buyResponse.buy.buy_price,
        payout: buyResponse.buy.payout,
        startTime: buyResponse.buy.start_time,
      };
      setOpenPositions(prev => [...prev, position]);

      const trade: Trade = {
        id: uuidv4(),
        accountId: clientId,
        accountType: 'client',
        contractId: buyResponse.buy.contract_id,
        contractType: direction,
        symbol,
        amount,
        buyPrice: buyResponse.buy.buy_price,
        timestamp: new Date(),
        status: 'open',
      };
      addTrade(trade);

      derivClientRef.current.subscribeToContract(buyResponse.buy.contract_id, (update) => {
        const poc = update.proposal_open_contract;

        setOpenPositions(prev =>
          prev.map(p =>
            p.contractId === poc.contract_id
              ? { ...p, currentPrice: poc.current_spot, profit: poc.profit }
              : p
          )
        );

        if (poc.is_sold || poc.status === 'sold' || poc.status === 'won' || poc.status === 'lost') {
          setOpenPositions(prev => prev.filter(p => p.contractId !== poc.contract_id));

          updateTrade(poc.contract_id, {
            sellPrice: poc.exit_tick,
            profit: poc.profit,
            status: poc.status === 'won' ? 'won' : poc.status === 'lost' ? 'lost' : 'sold',
          });

          setTradeHistory(getTrades().filter(t => t.accountId === clientId));

          derivClientRef.current?.unsubscribeFromContract(poc.contract_id);
        }
      });

      notifications.show({
        title: 'Trade Executed',
        message: `${direction === 'CALL' ? 'RISE' : 'FALL'} trade placed on ${symbol}`,
        color: direction === 'CALL' ? 'green' : 'red',
      });

      setBalance(buyResponse.buy.balance_after);
    } catch (err: any) {
      notifications.show({
        title: 'Trade Failed',
        message: err.message || 'Failed to execute trade',
        color: 'red',
      });
    } finally {
      setIsBuying(false);
    }
  };

  const sellPosition = async (contractId: number) => {
    if (!derivClientRef.current) return;

    try {
      await derivClientRef.current.sell(contractId, 0);
      notifications.show({
        title: 'Position Closed',
        message: 'Trade sold successfully',
        color: 'blue',
      });
    } catch (err: any) {
      notifications.show({
        title: 'Sell Failed',
        message: err.message || 'Failed to sell position',
        color: 'red',
      });
    }
  };

  const getSymbolLabel = () => {
    return availableSymbols.find(s => s.value === symbol)?.label || symbol;
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    return price < 10 ? price.toFixed(4) : price.toFixed(2);
  };

  if (isLoading) {
    return (
      <>
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            background: #06060a;
            font-family: 'Inter', sans-serif;
          }

          .loader-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(ellipse at 50% 0%, rgba(255, 68, 79, 0.1) 0%, transparent 60%), #06060a;
          }

          .loader-content { text-align: center; }

          .loader-ring {
            width: 80px;
            height: 80px;
            border: 2px solid rgba(255, 68, 79, 0.1);
            border-top-color: #FF444F;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 32px;
            position: relative;
          }

          .loader-ring::before {
            content: '';
            position: absolute;
            inset: 6px;
            border: 2px solid rgba(255, 68, 79, 0.05);
            border-top-color: rgba(255, 68, 79, 0.5);
            border-radius: 50%;
            animation: spin 0.8s linear reverse infinite;
          }

          .loader-text {
            color: #52525b;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }

          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="loader-wrap">
          <div className="loader-content">
            <div className="loader-ring" />
            <p className="loader-text">Connecting</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #06060a;
          font-family: 'Inter', sans-serif;
          color: #fafafa;
          overflow-x: hidden;
        }

        /* Keyframes */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(255, 68, 79, 0.4)); }
          50% { filter: drop-shadow(0 0 20px rgba(255, 68, 79, 0.6)); }
        }

        @keyframes priceUp {
          0% { color: #fafafa; }
          50% { color: #22c55e; text-shadow: 0 0 20px rgba(34, 197, 94, 0.5); }
          100% { color: #fafafa; }
        }

        @keyframes priceDown {
          0% { color: #fafafa; }
          50% { color: #FF444F; text-shadow: 0 0 20px rgba(255, 68, 79, 0.5); }
          100% { color: #fafafa; }
        }

        @keyframes borderGlow {
          0%, 100% { border-color: rgba(255, 68, 79, 0.2); }
          50% { border-color: rgba(255, 68, 79, 0.5); }
        }

        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0; }
        }

        .fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .fade-in-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-in-2 { animation-delay: 0.2s; opacity: 0; }
        .fade-in-3 { animation-delay: 0.3s; opacity: 0; }

        /* Terminal Container */
        .terminal {
          min-height: 100vh;
          background:
            radial-gradient(ellipse at 20% 0%, rgba(255, 68, 79, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
            linear-gradient(180deg, #06060a 0%, #0a0a0f 100%);
        }

        /* Header */
        .header {
          background: rgba(10, 10, 15, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-inner {
          max-width: 1800px;
          margin: 0 auto;
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 50%, #FF444F 100%);
          background-size: 200% 200%;
          animation: glow 3s ease-in-out infinite;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          color: white;
          letter-spacing: -1px;
        }

        .brand {
          display: flex;
          flex-direction: column;
        }

        .brand-name {
          font-weight: 700;
          font-size: 18px;
          color: #fafafa;
          letter-spacing: -0.5px;
        }

        .brand-sub {
          font-size: 11px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .badge {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .badge-glass {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #a1a1aa;
        }

        .badge-affiliate {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(139, 92, 246, 0.2);
          color: #a5b4fc;
        }

        .badge-live {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          position: relative;
        }

        .live-dot::after {
          content: '';
          position: absolute;
          inset: 0;
          background: #22c55e;
          border-radius: 50%;
          animation: livePulse 2s ease-out infinite;
        }

        .badge-balance {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 15px;
        }

        /* Main Layout */
        .main {
          max-width: 1800px;
          margin: 0 auto;
          padding: 24px 32px;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 24px;
        }

        /* Chart Panel */
        .chart-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .chart-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.8) 0%, rgba(10, 10, 15, 0.6) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          overflow: hidden;
        }

        .chart-top {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .chart-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        /* Custom Dropdown */
        .dropdown {
          position: relative;
        }

        .dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          background: rgba(255, 68, 79, 0.08);
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 200px;
        }

        .dropdown-trigger:hover {
          background: rgba(255, 68, 79, 0.12);
          border-color: rgba(255, 68, 79, 0.3);
        }

        .dropdown-trigger.open {
          border-color: #FF444F;
          box-shadow: 0 0 0 3px rgba(255, 68, 79, 0.1);
        }

        .dropdown-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dropdown-text {
          flex: 1;
          text-align: left;
        }

        .dropdown-label {
          font-size: 10px;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .dropdown-value {
          font-size: 14px;
          font-weight: 600;
          color: #fafafa;
        }

        .dropdown-arrow {
          color: #71717a;
          transition: transform 0.2s;
        }

        .dropdown-trigger.open .dropdown-arrow {
          transform: rotate(180deg);
        }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #13131a;
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          z-index: 50;
          max-height: 300px;
          overflow-y: auto;
        }

        .dropdown-item {
          padding: 12px 18px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: rgba(255, 68, 79, 0.1);
        }

        .dropdown-item.active {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
        }

        .dropdown-item-icon {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .dropdown-item-text {
          font-size: 14px;
          color: #e4e4e7;
        }

        .dropdown-item.active .dropdown-item-text {
          color: #FF444F;
          font-weight: 500;
        }

        /* Price Display */
        .price-area {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .price-row {
          display: flex;
          align-items: baseline;
          gap: 12px;
        }

        .price-main {
          font-size: 36px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          color: #fafafa;
          letter-spacing: -2px;
        }

        .price-main.up { animation: priceUp 0.4s ease-out; }
        .price-main.down { animation: priceDown 0.4s ease-out; }

        .price-change {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .price-change.positive {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }

        .price-change.negative {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
        }

        .price-label {
          font-size: 11px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* Market Stats */
        .market-stats {
          display: flex;
          gap: 20px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-label {
          font-size: 10px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 14px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .stat-value.high { color: #22c55e; }
        .stat-value.low { color: #FF444F; }

        .chart-container {
          height: 500px;
          width: 100%;
          min-width: 400px;
          position: relative;
        }

        /* Positions Card */
        .positions-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.8) 0%, rgba(10, 10, 15, 0.6) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          overflow: hidden;
        }

        .tabs-bar {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .tab {
          flex: 1;
          padding: 18px 24px;
          background: none;
          border: none;
          color: #52525b;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .tab:hover { color: #a1a1aa; }

        .tab.active { color: #fafafa; }

        .tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 24px;
          right: 24px;
          height: 2px;
          background: linear-gradient(90deg, #FF444F, #ff6b73);
          border-radius: 2px 2px 0 0;
        }

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 8px;
          margin-left: 8px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 100%);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          color: white;
        }

        .positions-body {
          padding: 20px;
          max-height: 280px;
          overflow-y: auto;
        }

        .empty {
          text-align: center;
          padding: 48px 20px;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: rgba(255, 68, 79, 0.1);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
        }

        .empty-text {
          color: #52525b;
          font-size: 14px;
        }

        .position {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .position:hover {
          border-color: rgba(255, 68, 79, 0.2);
          transform: translateY(-2px);
        }

        .position:last-child { margin-bottom: 0; }

        .position-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .position-symbol {
          font-weight: 700;
          font-size: 16px;
        }

        .direction {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .direction.rise {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .direction.fall {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.2) 0%, rgba(255, 68, 79, 0.1) 100%);
          color: #FF444F;
          border: 1px solid rgba(255, 68, 79, 0.3);
        }

        .position-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .position-stat {
          text-align: center;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .position-stat-label {
          font-size: 10px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .position-stat-value {
          font-size: 15px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .position-stat-value.profit { color: #22c55e; }
        .position-stat-value.loss { color: #FF444F; }

        .close-btn {
          width: 100%;
          padding: 12px;
          background: rgba(255, 68, 79, 0.1);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 10px;
          color: #FF444F;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .close-btn:hover {
          background: rgba(255, 68, 79, 0.2);
          border-color: #FF444F;
          transform: translateY(-1px);
        }

        /* History */
        .history-row {
          display: grid;
          grid-template-columns: 70px 1fr 70px 80px 90px;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .history-row:last-child { margin-bottom: 0; }

        .history-time {
          color: #52525b;
          font-family: 'Space Mono', monospace;
          font-size: 12px;
        }

        .history-symbol { font-weight: 500; }

        .history-price {
          font-family: 'Space Mono', monospace;
          text-align: right;
        }

        .history-profit {
          font-family: 'Space Mono', monospace;
          font-weight: 600;
          text-align: right;
        }

        .history-profit.positive { color: #22c55e; }
        .history-profit.negative { color: #FF444F; }

        /* Trade Panel */
        .trade-panel { animation: slideIn 0.5s ease-out forwards; }

        .trade-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.9) 0%, rgba(10, 10, 15, 0.7) 100%);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 20px;
          overflow: hidden;
          position: sticky;
          top: 100px;
        }

        .trade-top {
          padding: 24px;
          background: linear-gradient(180deg, rgba(255, 68, 79, 0.1) 0%, transparent 100%);
          border-bottom: 1px solid rgba(255, 68, 79, 0.08);
          text-align: center;
        }

        .trade-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 4px;
          letter-spacing: -0.5px;
        }

        .trade-subtitle {
          font-size: 13px;
          color: #71717a;
        }

        .trade-body { padding: 24px; }

        .field { margin-bottom: 24px; }

        .field-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .field-label-text {
          font-size: 12px;
          font-weight: 600;
          color: #a1a1aa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .field-label-hint {
          font-size: 11px;
          color: #52525b;
        }

        .field-input {
          width: 100%;
          padding: 16px 18px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 12px;
          color: #fafafa;
          font-size: 18px;
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          transition: all 0.2s;
        }

        .field-input:hover { border-color: rgba(255, 68, 79, 0.25); }

        .field-input:focus {
          outline: none;
          border-color: #FF444F;
          box-shadow: 0 0 0 4px rgba(255, 68, 79, 0.1);
        }

        .presets {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .preset {
          padding: 10px 8px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          color: #71717a;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .preset:hover {
          background: rgba(255, 68, 79, 0.1);
          border-color: rgba(255, 68, 79, 0.2);
          color: #fafafa;
        }

        .preset.active {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.2) 0%, rgba(255, 68, 79, 0.1) 100%);
          border-color: rgba(255, 68, 79, 0.4);
          color: #FF444F;
        }

        .duration-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .small-dropdown {
          position: relative;
        }

        .small-dropdown-trigger {
          width: 100%;
          padding: 16px 18px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 12px;
          color: #fafafa;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: 'Inter', sans-serif;
        }

        .small-dropdown-trigger:hover {
          border-color: rgba(255, 68, 79, 0.25);
        }

        .small-dropdown-trigger.open {
          border-color: #FF444F;
        }

        .small-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #13131a;
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          z-index: 50;
        }

        .small-dropdown-item {
          padding: 14px 18px;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 14px;
          color: #e4e4e7;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .small-dropdown-item:last-child { border-bottom: none; }
        .small-dropdown-item:hover { background: rgba(255, 68, 79, 0.1); }

        .small-dropdown-item.active {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
          font-weight: 500;
        }

        /* Trade Buttons */
        .trade-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 28px;
        }

        .trade-btn {
          width: 100%;
          padding: 20px 24px;
          border: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-family: 'Inter', sans-serif;
          text-transform: uppercase;
          letter-spacing: 1px;
          position: relative;
          overflow: hidden;
        }

        .trade-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.3s;
        }

        .trade-btn:hover::before { opacity: 1; }

        .trade-btn.rise {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
          box-shadow:
            0 4px 20px rgba(34, 197, 94, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.rise:hover {
          transform: translateY(-3px);
          box-shadow:
            0 8px 30px rgba(34, 197, 94, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.fall {
          background: linear-gradient(135deg, #FF444F 0%, #dc2626 100%);
          color: white;
          box-shadow:
            0 4px 20px rgba(255, 68, 79, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.fall:hover {
          transform: translateY(-3px);
          box-shadow:
            0 8px 30px rgba(255, 68, 79, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .trade-btn:active:not(:disabled) {
          transform: translateY(-1px);
        }

        .btn-icon {
          width: 24px;
          height: 24px;
        }

        /* Live Price Card */
        .live-price-card {
          margin-top: 24px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, rgba(255, 68, 79, 0.03) 100%);
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 14px;
          text-align: center;
          animation: borderGlow 3s ease-in-out infinite;
        }

        .live-price-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 11px;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .live-indicator {
          width: 6px;
          height: 6px;
          background: #FF444F;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .live-price-value {
          font-size: 32px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          background: linear-gradient(135deg, #fafafa 0%, #d4d4d8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -1px;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(255, 68, 79, 0.3); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 68, 79, 0.5); }

        /* Responsive */
        @media (max-width: 1200px) {
          .main { grid-template-columns: 1fr; }
          .trade-panel { order: -1; }
          .trade-card { position: static; }
        }
      `}</style>

      <div className="terminal">
        {/* Header */}
        <header className="header fade-in">
          <div className="header-inner">
            <div className="logo-area">
              <div className="logo">D</div>
              <div className="brand">
                <span className="brand-name">Deriv Trading</span>
                <span className="brand-sub">Professional Terminal</span>
              </div>
            </div>

            <div className="header-right">
              <div className="badge badge-affiliate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {affiliateName}
              </div>

              <div className="badge badge-live">
                <div className="live-dot" />
                Live
              </div>

              <div className="badge badge-glass" title={accountType}>
                {accountId}
              </div>

              <div className="badge badge-balance">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="main">
          {/* Chart Panel */}
          <div className="chart-panel">
            <div className="chart-card fade-in fade-in-1">
              <div className="chart-top">
                <div className="chart-left">
                  {/* Symbol Dropdown */}
                  <div className="dropdown">
                    <div
                      className={`dropdown-trigger ${symbolDropdownOpen ? 'open' : ''}`}
                      onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                    >
                      <div className="dropdown-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                          <polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <div className="dropdown-text">
                        <div className="dropdown-label">Market</div>
                        <div className="dropdown-value">{getSymbolLabel()}</div>
                      </div>
                      <svg className="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                    {symbolDropdownOpen && (
                      <div className="dropdown-menu">
                        {availableSymbols.map(s => (
                          <div
                            key={s.value}
                            className={`dropdown-item ${symbol === s.value ? 'active' : ''}`}
                            onClick={() => handleSymbolChange(s.value)}
                          >
                            <div className="dropdown-item-icon" />
                            <span className="dropdown-item-text">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price Display */}
                  <div className="price-area">
                    <div className="price-row">
                      <span className={`price-main ${priceChange === 'up' ? 'up' : priceChange === 'down' ? 'down' : ''}`}>
                        {formatPrice(currentPrice)}
                      </span>
                      <span className={`price-change ${priceChangePercent >= 0 ? 'positive' : 'negative'}`}>
                        {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="price-label">Live Market Price</span>
                  </div>
                </div>

                {/* Market Stats */}
                <div className="market-stats">
                  <div className="stat">
                    <span className="stat-label">24h High</span>
                    <span className="stat-value high">{formatPrice(highPrice)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Low</span>
                    <span className="stat-value low">{formatPrice(lowPrice)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-container" ref={chartContainerRef} />
            </div>

            {/* Positions */}
            <div className="positions-card fade-in fade-in-2">
              <div className="tabs-bar">
                <button
                  className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('positions')}
                >
                  Open Positions
                  {openPositions.length > 0 && (
                    <span className="tab-badge">{openPositions.length}</span>
                  )}
                </button>
                <button
                  className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  Trade History
                </button>
              </div>

              <div className="positions-body">
                {activeTab === 'positions' && (
                  <>
                    {openPositions.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">📊</div>
                        <p className="empty-text">No open positions</p>
                      </div>
                    ) : (
                      openPositions.map((pos) => (
                        <div key={pos.contractId} className="position">
                          <div className="position-top">
                            <span className="position-symbol">{pos.symbol}</span>
                            <span className={`direction ${pos.direction === 'CALL' ? 'rise' : 'fall'}`}>
                              {pos.direction === 'CALL' ? 'Rise' : 'Fall'}
                            </span>
                          </div>
                          <div className="position-grid">
                            <div className="position-stat">
                              <div className="position-stat-label">Entry</div>
                              <div className="position-stat-value">{formatPrice(pos.entryPrice)}</div>
                            </div>
                            <div className="position-stat">
                              <div className="position-stat-label">Current</div>
                              <div className="position-stat-value">{formatPrice(pos.currentPrice)}</div>
                            </div>
                            <div className="position-stat">
                              <div className="position-stat-label">P/L</div>
                              <div className={`position-stat-value ${pos.profit >= 0 ? 'profit' : 'loss'}`}>
                                {pos.profit >= 0 ? '+' : ''}{pos.profit.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <button className="close-btn" onClick={() => sellPosition(pos.contractId)}>
                            Close Position
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeTab === 'history' && (
                  <>
                    {tradeHistory.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">📈</div>
                        <p className="empty-text">No trade history</p>
                      </div>
                    ) : (
                      tradeHistory.slice(0, 15).map((trade) => (
                        <div key={trade.id} className="history-row">
                          <span className="history-time">
                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="history-symbol">{trade.symbol}</span>
                          <span className={`direction ${trade.contractType === 'CALL' ? 'rise' : 'fall'}`}>
                            {trade.contractType === 'CALL' ? 'Rise' : 'Fall'}
                          </span>
                          <span className="history-price">${trade.buyPrice?.toFixed(2)}</span>
                          <span className={`history-profit ${(trade.profit || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {(trade.profit || 0) >= 0 ? '+' : ''}${(trade.profit || 0).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trade Panel */}
          <div className="trade-panel">
            <div className="trade-card fade-in fade-in-3">
              <div className="trade-top">
                <h2 className="trade-title">Place Trade</h2>
                <p className="trade-subtitle">{getSymbolLabel()}</p>
              </div>

              <div className="trade-body">
                <div className="field">
                  <div className="field-label">
                    <span className="field-label-text">Amount</span>
                    <span className="field-label-hint">USD</span>
                  </div>
                  <input
                    type="number"
                    className="field-input"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 10)}
                    min={1}
                    max={1000}
                  />
                  <div className="presets">
                    {[5, 10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        className={`preset ${amount === preset ? 'active' : ''}`}
                        onClick={() => setAmount(preset)}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <div className="field-label">
                    <span className="field-label-text">Duration</span>
                  </div>
                  <div className="duration-grid">
                    <input
                      type="number"
                      className="field-input"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value) || 1)}
                      min={1}
                      max={60}
                    />
                    <div className="small-dropdown">
                      <div
                        className={`small-dropdown-trigger ${durationDropdownOpen ? 'open' : ''}`}
                        onClick={() => setDurationDropdownOpen(!durationDropdownOpen)}
                      >
                        <span>{durationOptions.find(o => o.value === durationUnit)?.label}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      {durationDropdownOpen && (
                        <div className="small-dropdown-menu">
                          {durationOptions.map(opt => (
                            <div
                              key={opt.value}
                              className={`small-dropdown-item ${durationUnit === opt.value ? 'active' : ''}`}
                              onClick={() => {
                                setDurationUnit(opt.value);
                                setDurationDropdownOpen(false);
                              }}
                            >
                              {opt.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="trade-buttons">
                  <button
                    className="trade-btn rise"
                    onClick={() => executeTrade('CALL')}
                    disabled={isBuying || !symbol}
                  >
                    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                    {isBuying ? 'Placing...' : 'Rise'}
                  </button>

                  <button
                    className="trade-btn fall"
                    onClick={() => executeTrade('PUT')}
                    disabled={isBuying || !symbol}
                  >
                    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    {isBuying ? 'Placing...' : 'Fall'}
                  </button>
                </div>

                <div className="live-price-card">
                  <div className="live-price-label">
                    <div className="live-indicator" />
                    Live Price
                  </div>
                  <div className="live-price-value">{formatPrice(currentPrice)}</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
