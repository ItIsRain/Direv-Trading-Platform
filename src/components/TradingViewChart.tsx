'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'dark' | 'light';
  height?: number;
}

// Map Deriv symbols to TradingView symbols
function mapToTradingViewSymbol(derivSymbol: string): string {
  const symbolMap: Record<string, string> = {
    // Forex pairs
    'frxEURUSD': 'FX:EURUSD',
    'frxGBPUSD': 'FX:GBPUSD',
    'frxUSDJPY': 'FX:USDJPY',
    'frxAUDUSD': 'FX:AUDUSD',
    'frxUSDCAD': 'FX:USDCAD',
    'frxUSDCHF': 'FX:USDCHF',
    'frxEURGBP': 'FX:EURGBP',
    'frxEURJPY': 'FX:EURJPY',
    'frxGBPJPY': 'FX:GBPJPY',
    'frxNZDUSD': 'FX:NZDUSD',
    'frxAUDJPY': 'FX:AUDJPY',
    'frxEURAUD': 'FX:EURAUD',
    'frxEURCAD': 'FX:EURCAD',
    'frxEURCHF': 'FX:EURCHF',
    'frxGBPAUD': 'FX:GBPAUD',
    'frxGBPCAD': 'FX:GBPCAD',
    'frxGBPCHF': 'FX:GBPCHF',
    'frxAUDCAD': 'FX:AUDCAD',
    'frxAUDCHF': 'FX:AUDCHF',
    'frxAUDNZD': 'FX:AUDNZD',
    'frxCADJPY': 'FX:CADJPY',
    'frxCHFJPY': 'FX:CHFJPY',
    'frxNZDJPY': 'FX:NZDJPY',

    // Crypto
    'cryBTCUSD': 'BINANCE:BTCUSDT',
    'cryETHUSD': 'BINANCE:ETHUSDT',
    'cryLTCUSD': 'BINANCE:LTCUSDT',
    'cryBCHUSD': 'BINANCE:BCHUSDT',
    'cryXRPUSD': 'BINANCE:XRPUSDT',
    'cryDOGEUSD': 'BINANCE:DOGEUSDT',
    'crySOLUSD': 'BINANCE:SOLUSDT',
    'cryADAUSD': 'BINANCE:ADAUSDT',
    'cryDOTUSD': 'BINANCE:DOTUSDT',
    'cryLINKUSD': 'BINANCE:LINKUSDT',
    'cryAVAXUSD': 'BINANCE:AVAXUSDT',
    'cryMATICUSD': 'BINANCE:MATICUSDT',
    'cryBNBUSD': 'BINANCE:BNBUSDT',

    // Volatility indices - map to crypto for similar volatility
    'R_10': 'BINANCE:BTCUSDT',
    'R_25': 'BINANCE:BTCUSDT',
    'R_50': 'BINANCE:ETHUSDT',
    'R_75': 'BINANCE:ETHUSDT',
    'R_100': 'BINANCE:BTCUSDT',
    '1HZ10V': 'BINANCE:BTCUSDT',
    '1HZ25V': 'BINANCE:BTCUSDT',
    '1HZ50V': 'BINANCE:ETHUSDT',
    '1HZ75V': 'BINANCE:ETHUSDT',
    '1HZ100V': 'BINANCE:BTCUSDT',

    // Boom/Crash
    'BOOM300N': 'BINANCE:BTCUSDT',
    'BOOM500N': 'BINANCE:BTCUSDT',
    'BOOM1000N': 'BINANCE:ETHUSDT',
    'CRASH300N': 'BINANCE:BTCUSDT',
    'CRASH500N': 'BINANCE:BTCUSDT',
    'CRASH1000N': 'BINANCE:ETHUSDT',

    // Range Break
    'RDBEAR': 'BINANCE:BTCUSDT',
    'RDBULL': 'BINANCE:BTCUSDT',

    // Step indices
    'stpRNG': 'BINANCE:BTCUSDT',

    // Jump indices
    'JD10': 'BINANCE:ETHUSDT',
    'JD25': 'BINANCE:ETHUSDT',
    'JD50': 'BINANCE:ETHUSDT',
    'JD75': 'BINANCE:ETHUSDT',
    'JD100': 'BINANCE:ETHUSDT',
  };

  return symbolMap[derivSymbol] || 'FX:EURUSD';
}

function TradingViewChart({ symbol, theme = 'dark', height = 500 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = '';

    const tvSymbol = mapToTradingViewSymbol(symbol);

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = 'calc(100% - 32px)';
    widgetDiv.style.width = '100%';

    widgetContainer.appendChild(widgetDiv);
    containerRef.current.appendChild(widgetContainer);

    // Create and load the TradingView script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: '1',
      timezone: 'Etc/UTC',
      theme: theme,
      style: '1',
      locale: 'en',
      enable_publishing: false,
      backgroundColor: theme === 'dark' ? 'rgba(6, 6, 10, 1)' : 'rgba(255, 255, 255, 1)',
      gridColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      container_id: 'tradingview-widget',
      studies: [
        'STD;Bollinger_Bands',
      ],
      show_popup_button: true,
      popup_width: '1000',
      popup_height: '650',
    });

    widgetContainer.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, theme, height]);

  return (
    <div
      ref={containerRef}
      style={{
        height: `${height}px`,
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        background: theme === 'dark' ? '#06060a' : '#fff',
      }}
    />
  );
}

export default memo(TradingViewChart);
