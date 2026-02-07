'use client';

import { useEffect, useRef, memo, useState, useCallback } from 'react';
import {
  Drawing,
  TrendlineDrawing,
  HorizontalLineDrawing,
  RectangleDrawing,
  ArrowDrawing,
  TextDrawing,
  Point,
} from '@/types';

interface Position {
  id: number;
  entryPrice: number;
  direction: 'CALL' | 'PUT';
  takeProfit?: number;
  stopLoss?: number;
}

type DrawingMode = 'select' | 'trendline' | 'horizontal' | 'rectangle' | 'arrow' | 'text' | null;

interface TradingViewChartProps {
  symbol: string;
  theme?: 'dark' | 'light';
  currentPrice?: number;
  positions?: Position[];
  onUpdatePosition?: (id: number, updates: { takeProfit?: number; stopLoss?: number }) => void;
  // Drawing props (optional - when provided, enables drawing mode)
  drawings?: Drawing[];
  drawingMode?: DrawingMode;
  selectedColor?: string;
  drawingLineWidth?: number;
  selectedDrawing?: string | null;
  onDrawingComplete?: (drawing: Drawing) => void;
  onDrawingSelect?: (id: string | null) => void;
  onTextInputRequest?: (chartPoint: Point, pixelPos: { x: number; y: number }) => void;
  referralCode?: string;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface InProgressDrawing {
  startPixel: { x: number; y: number };
  currentPixel: { x: number; y: number };
  startPoint: Point;
}

// Stable empty arrays to prevent infinite re-renders from new [] references
const EMPTY_POSITIONS: Position[] = [];
const EMPTY_DRAWINGS: Drawing[] | undefined = undefined;

function TradingViewChart({
  symbol,
  theme = 'dark',
  currentPrice,
  positions = EMPTY_POSITIONS,
  onUpdatePosition,
  // Drawing props
  drawings = EMPTY_DRAWINGS,
  drawingMode,
  selectedColor = '#FF444F',
  drawingLineWidth = 2,
  selectedDrawing,
  onDrawingComplete,
  onDrawingSelect,
  onTextInputRequest,
  referralCode = 'partner',
}: TradingViewChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  // Chart interaction state
  const [offset, setOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'pan' | 'tp' | 'sl' | null>(null);
  const [dragPositionId, setDragPositionId] = useState<number | null>(null);
  const [localPositions, setLocalPositions] = useState<Position[]>([]);

  // Drawing in-progress state
  const [inProgressDrawing, setInProgressDrawing] = useState<InProgressDrawing | null>(null);
  const inProgressRef = useRef<InProgressDrawing | null>(null);

  const isDrawingActive = drawingMode != null && drawingMode !== 'select';

  // Sync positions - use functional update to avoid unnecessary re-renders
  useEffect(() => {
    setLocalPositions(prev => {
      if (prev === positions) return prev;
      if (prev.length === 0 && positions.length === 0) return prev;
      return positions;
    });
  }, [positions]);

  // Fetch historical data and subscribe to live updates
  useEffect(() => {
    const APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        end: 'latest',
        count: 200,
        style: 'candles',
        granularity: 60,
      }));

      ws.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.candles) {
        const newCandles = data.candles.map((c: any) => ({
          time: c.epoch,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        candlesRef.current = newCandles;
        setCandles(newCandles);
      }

      if (data.tick) {
        const tick = data.tick;
        const currentCandles = [...candlesRef.current];

        if (currentCandles.length > 0) {
          const lastCandle = currentCandles[currentCandles.length - 1];
          const tickMinute = Math.floor(tick.epoch / 60) * 60;
          const lastCandleMinute = Math.floor(lastCandle.time / 60) * 60;

          if (tickMinute === lastCandleMinute) {
            lastCandle.close = tick.quote;
            lastCandle.high = Math.max(lastCandle.high, tick.quote);
            lastCandle.low = Math.min(lastCandle.low, tick.quote);
          } else {
            currentCandles.push({
              time: tick.epoch,
              open: tick.quote,
              high: tick.quote,
              low: tick.quote,
              close: tick.quote,
            });
            if (currentCandles.length > 200) {
              currentCandles.shift();
            }
          }
          candlesRef.current = currentCandles;
          setCandles([...currentCandles]);
        }
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ forget_all: 'ticks' }));
        ws.close();
      }
    };
  }, [symbol]);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate visible candles and price range
  const getChartParams = useCallback(() => {
    const padding = { top: 20, right: 70, bottom: 30, left: 10 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    const visibleCandles = Math.floor(50 / zoom);
    const startIdx = Math.max(0, candles.length - visibleCandles - offset);
    const endIdx = Math.min(candles.length, startIdx + visibleCandles);
    const visible = candles.slice(startIdx, endIdx);

    if (visible.length === 0) {
      return { padding, chartWidth, chartHeight, visible: [], minPrice: 0, maxPrice: 0, priceRange: 1, startIdx, candleGap: 0 };
    }

    const prices = visible.flatMap(c => [c.high, c.low]);
    localPositions.forEach(pos => {
      prices.push(pos.entryPrice);
      if (pos.takeProfit) prices.push(pos.takeProfit);
      if (pos.stopLoss) prices.push(pos.stopLoss);
    });
    if (currentPrice) prices.push(currentPrice);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const candleGap = chartWidth / visible.length;

    return { padding, chartWidth, chartHeight, visible, minPrice, maxPrice, priceRange, startIdx, candleGap };
  }, [candles, dimensions, offset, zoom, localPositions, currentPrice]);

  // Convert price to Y coordinate
  const priceToY = useCallback((price: number, params: ReturnType<typeof getChartParams>) => {
    const { padding, chartHeight, minPrice, priceRange } = params;
    const pricePadding = priceRange * 0.1;
    return padding.top + chartHeight - ((price - minPrice + pricePadding) / (priceRange + pricePadding * 2)) * chartHeight;
  }, []);

  // Convert Y coordinate to price
  const yToPrice = useCallback((y: number, params: ReturnType<typeof getChartParams>) => {
    const { padding, chartHeight, minPrice, priceRange } = params;
    const pricePadding = priceRange * 0.1;
    return minPrice - pricePadding + (1 - (y - padding.top) / chartHeight) * (priceRange + pricePadding * 2);
  }, []);

  // --- Coordinate conversion for drawings ---

  // Get average candle interval in seconds
  const getCandleInterval = useCallback(() => {
    if (candles.length < 2) return 60;
    const count = Math.min(candles.length - 1, 10);
    let totalDiff = 0;
    for (let i = candles.length - count; i < candles.length; i++) {
      totalDiff += candles[i].time - candles[i - 1].time;
    }
    return totalDiff / count;
  }, [candles]);

  // Convert a timestamp to a fractional candle index (0-based from start of candles array)
  const timeToLogical = useCallback((time: number): number | null => {
    if (candles.length === 0) return null;
    const lastCandle = candles[candles.length - 1];
    const lastIndex = candles.length - 1;

    if (time <= lastCandle.time) {
      let lo = 0, hi = candles.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candles[mid].time < time) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && candles[lo].time !== time) {
        const prevTime = candles[lo - 1].time;
        const nextTime = candles[lo].time;
        const fraction = (time - prevTime) / (nextTime - prevTime);
        return (lo - 1) + fraction;
      }
      return lo;
    }

    // Future time: extrapolate past last candle
    const interval = getCandleInterval();
    return lastIndex + (time - lastCandle.time) / interval;
  }, [candles, getCandleInterval]);

  // Convert a fractional candle index to a timestamp
  const logicalToTime = useCallback((logical: number): number | null => {
    if (candles.length === 0) return null;
    const lastIndex = candles.length - 1;

    if (logical <= lastIndex) {
      const idx = Math.max(0, Math.min(logical, lastIndex));
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, lastIndex);
      const fraction = idx - lo;
      return candles[lo].time + fraction * (candles[hi].time - candles[lo].time);
    }

    const interval = getCandleInterval();
    return candles[lastIndex].time + (logical - lastIndex) * interval;
  }, [candles, getCandleInterval]);

  // Convert a chart point (time, price) to pixel coordinates
  const chartPointToPixel = useCallback((point: Point, params: ReturnType<typeof getChartParams>): { x: number; y: number } | null => {
    if (candles.length === 0 || params.visible.length === 0) return null;

    const logical = timeToLogical(point.x);
    if (logical === null) return null;

    // Convert logical index to pixel X relative to visible area
    const { padding, candleGap, startIdx } = params;
    const visibleLogical = logical - startIdx;
    const x = padding.left + visibleLogical * candleGap + candleGap / 2;
    const y = priceToY(point.y, params);

    return { x, y };
  }, [candles, timeToLogical, priceToY]);

  // Convert pixel coordinates to a chart point (time, price)
  const pixelToChartPoint = useCallback((pixelX: number, pixelY: number, params: ReturnType<typeof getChartParams>): Point | null => {
    if (candles.length === 0 || params.visible.length === 0) return null;

    const { padding, candleGap, startIdx } = params;
    // Reverse of chartPointToPixel X calculation
    const visibleLogical = (pixelX - padding.left - candleGap / 2) / candleGap;
    const logical = visibleLogical + startIdx;

    const time = logicalToTime(logical);
    if (time === null) return null;

    const price = yToPrice(pixelY, params);
    return { x: time, y: price };
  }, [candles, logicalToTime, yToPrice]);

  // --- Mouse handlers ---

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const params = getChartParams();

    // Drawing mode handling
    if (isDrawingActive && drawings) {
      e.preventDefault();

      const chartPoint = pixelToChartPoint(x, y, params);

      if (drawingMode === 'horizontal') {
        // Single click creates horizontal line
        if (chartPoint && onDrawingComplete) {
          onDrawingComplete({
            id: crypto.randomUUID(),
            type: 'horizontal',
            referralCode,
            symbol,
            color: selectedColor,
            lineWidth: drawingLineWidth,
            price: chartPoint.y,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as HorizontalLineDrawing);
        }
        return;
      }

      if (drawingMode === 'text') {
        // Single click requests text input
        if (chartPoint && onTextInputRequest) {
          onTextInputRequest(chartPoint, { x: e.clientX, y: e.clientY });
        }
        return;
      }

      // Drag-based tools (trendline, rectangle, arrow)
      if (chartPoint) {
        const ipd: InProgressDrawing = {
          startPixel: { x, y },
          currentPixel: { x, y },
          startPoint: chartPoint,
        };
        inProgressRef.current = ipd;
        setInProgressDrawing(ipd);
      }
      return;
    }

    // Select mode: check if clicking on a drawing
    if (drawingMode === 'select' && drawings && onDrawingSelect) {
      let found = false;
      for (const drawing of drawings) {
        if (isPointNearDrawing(x, y, drawing, params)) {
          onDrawingSelect(drawing.id);
          found = true;
          break;
        }
      }
      if (!found) {
        onDrawingSelect(null);
      }
    }

    // Check if clicking on a TP/SL line (trade page behavior)
    for (const pos of localPositions) {
      if (pos.takeProfit) {
        const tpY = priceToY(pos.takeProfit, params);
        if (Math.abs(y - tpY) < 8 && x > params.padding.left && x < dimensions.width - params.padding.right) {
          setDragType('tp');
          setDragPositionId(pos.id);
          setIsDragging(true);
          return;
        }
      }
      if (pos.stopLoss) {
        const slY = priceToY(pos.stopLoss, params);
        if (Math.abs(y - slY) < 8 && x > params.padding.left && x < dimensions.width - params.padding.right) {
          setDragType('sl');
          setDragPositionId(pos.id);
          setIsDragging(true);
          return;
        }
      }
    }

    // Otherwise, start panning
    if (!isDrawingActive) {
      setDragType('pan');
      setDragStart({ x: e.clientX, y: e.clientY });
      setIsDragging(true);
    }
  }, [getChartParams, localPositions, priceToY, dimensions, isDrawingActive, drawings, drawingMode, pixelToChartPoint, onDrawingComplete, onTextInputRequest, onDrawingSelect, referralCode, symbol, selectedColor, drawingLineWidth]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Drawing in progress
    if (inProgressRef.current) {
      const updated = { ...inProgressRef.current, currentPixel: { x, y } };
      inProgressRef.current = updated;
      setInProgressDrawing(updated);
      return;
    }

    if (!isDragging) return;

    if (dragType === 'pan') {
      const dx = e.clientX - dragStart.x;
      const sensitivity = 0.5 / zoom;
      setOffset(prev => Math.max(0, Math.min(candles.length - 10, prev + dx * sensitivity)));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if ((dragType === 'tp' || dragType === 'sl') && dragPositionId !== null) {
      const params = getChartParams();
      const newPrice = yToPrice(y, params);

      setLocalPositions(prev => prev.map(pos => {
        if (pos.id === dragPositionId) {
          if (dragType === 'tp') {
            return { ...pos, takeProfit: newPrice };
          } else {
            return { ...pos, stopLoss: newPrice };
          }
        }
        return pos;
      }));
    }
  }, [isDragging, dragType, dragStart, dragPositionId, zoom, candles.length, getChartParams, yToPrice]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Complete a drawing if in progress
    if (inProgressRef.current && onDrawingComplete) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const params = getChartParams();
        const endPoint = pixelToChartPoint(x, y, params);
        const startPoint = inProgressRef.current.startPoint;

        if (endPoint) {
          const now = new Date();
          const id = crypto.randomUUID();

          switch (drawingMode) {
            case 'trendline':
              onDrawingComplete({
                id,
                type: 'trendline',
                referralCode,
                symbol,
                color: selectedColor,
                lineWidth: drawingLineWidth,
                startPoint,
                endPoint,
                extendLeft: false,
                extendRight: false,
                createdAt: now,
                updatedAt: now,
              } as TrendlineDrawing);
              break;
            case 'rectangle':
              onDrawingComplete({
                id,
                type: 'rectangle',
                referralCode,
                symbol,
                color: selectedColor,
                lineWidth: drawingLineWidth,
                startPoint,
                endPoint,
                fillColor: selectedColor,
                fillOpacity: 0.15,
                createdAt: now,
                updatedAt: now,
              } as RectangleDrawing);
              break;
            case 'arrow':
              onDrawingComplete({
                id,
                type: 'arrow',
                referralCode,
                symbol,
                color: selectedColor,
                lineWidth: drawingLineWidth,
                startPoint,
                endPoint,
                headSize: 15,
                createdAt: now,
                updatedAt: now,
              } as ArrowDrawing);
              break;
          }
        }
      }

      inProgressRef.current = null;
      setInProgressDrawing(null);
      return;
    }

    if (dragType === 'tp' || dragType === 'sl') {
      const pos = localPositions.find(p => p.id === dragPositionId);
      if (pos && onUpdatePosition) {
        onUpdatePosition(pos.id, {
          takeProfit: pos.takeProfit,
          stopLoss: pos.stopLoss,
        });
      }
    }
    setIsDragging(false);
    setDragType(null);
    setDragPositionId(null);
  }, [dragType, dragPositionId, localPositions, onUpdatePosition, onDrawingComplete, getChartParams, pixelToChartPoint, drawingMode, referralCode, symbol, selectedColor, drawingLineWidth]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
  }, []);

  // Double click to add TP/SL (only when not in drawing mode)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isDrawingActive) return;
    if (localPositions.length === 0) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const params = getChartParams();
    const clickPrice = yToPrice(y, params);

    const pos = localPositions[localPositions.length - 1];
    if (!pos) return;

    if (pos.direction === 'CALL') {
      if (clickPrice > pos.entryPrice && !pos.takeProfit) {
        setLocalPositions(prev => prev.map(p =>
          p.id === pos.id ? { ...p, takeProfit: clickPrice } : p
        ));
        onUpdatePosition?.(pos.id, { takeProfit: clickPrice });
      } else if (clickPrice < pos.entryPrice && !pos.stopLoss) {
        setLocalPositions(prev => prev.map(p =>
          p.id === pos.id ? { ...p, stopLoss: clickPrice } : p
        ));
        onUpdatePosition?.(pos.id, { stopLoss: clickPrice });
      }
    } else {
      if (clickPrice < pos.entryPrice && !pos.takeProfit) {
        setLocalPositions(prev => prev.map(p =>
          p.id === pos.id ? { ...p, takeProfit: clickPrice } : p
        ));
        onUpdatePosition?.(pos.id, { takeProfit: clickPrice });
      } else if (clickPrice > pos.entryPrice && !pos.stopLoss) {
        setLocalPositions(prev => prev.map(p =>
          p.id === pos.id ? { ...p, stopLoss: clickPrice } : p
        ));
        onUpdatePosition?.(pos.id, { stopLoss: clickPrice });
      }
    }
  }, [localPositions, getChartParams, yToPrice, onUpdatePosition, isDrawingActive]);

  // Hit-test for selecting drawings
  const isPointNearDrawing = (px: number, py: number, drawing: Drawing, params: ReturnType<typeof getChartParams>): boolean => {
    const threshold = 8;
    switch (drawing.type) {
      case 'trendline': {
        const d = drawing as TrendlineDrawing;
        const start = chartPointToPixel(d.startPoint, params);
        const end = chartPointToPixel(d.endPoint, params);
        if (!start || !end) return false;
        return distToSegment(px, py, start.x, start.y, end.x, end.y) < threshold;
      }
      case 'horizontal': {
        const d = drawing as HorizontalLineDrawing;
        const hy = priceToY(d.price, params);
        return Math.abs(py - hy) < threshold;
      }
      case 'rectangle': {
        const d = drawing as RectangleDrawing;
        const start = chartPointToPixel(d.startPoint, params);
        const end = chartPointToPixel(d.endPoint, params);
        if (!start || !end) return false;
        const rx = Math.min(start.x, end.x);
        const ry = Math.min(start.y, end.y);
        const rw = Math.abs(end.x - start.x);
        const rh = Math.abs(end.y - start.y);
        // Near border
        const nearLeft = Math.abs(px - rx) < threshold && py >= ry - threshold && py <= ry + rh + threshold;
        const nearRight = Math.abs(px - (rx + rw)) < threshold && py >= ry - threshold && py <= ry + rh + threshold;
        const nearTop = Math.abs(py - ry) < threshold && px >= rx - threshold && px <= rx + rw + threshold;
        const nearBottom = Math.abs(py - (ry + rh)) < threshold && px >= rx - threshold && px <= rx + rw + threshold;
        return nearLeft || nearRight || nearTop || nearBottom;
      }
      case 'arrow': {
        const d = drawing as ArrowDrawing;
        const start = chartPointToPixel(d.startPoint, params);
        const end = chartPointToPixel(d.endPoint, params);
        if (!start || !end) return false;
        return distToSegment(px, py, start.x, start.y, end.x, end.y) < threshold;
      }
      case 'text': {
        const d = drawing as TextDrawing;
        const pos = chartPointToPixel(d.position, params);
        if (!pos) return false;
        return px >= pos.x - 10 && px <= pos.x + 100 && py >= pos.y - d.fontSize - 10 && py <= pos.y + 10;
      }
      default:
        return false;
    }
  };

  // Distance from point to line segment
  const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  // --- Draw chart ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0 || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const params = getChartParams();
    const { padding, chartWidth, chartHeight, visible, minPrice, maxPrice, priceRange, candleGap } = params;

    if (visible.length === 0) return;

    const width = dimensions.width;
    const height = dimensions.height;

    // Clear canvas
    ctx.fillStyle = theme === 'dark' ? '#0b0e11' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const pricePadding = priceRange * 0.1;
    const scaleY = (price: number) => priceToY(price, params);

    const candleWidth = Math.max(3, (chartWidth / visible.length) * 0.7);

    // Draw grid lines
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;

    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = maxPrice + pricePadding - ((priceRange + pricePadding * 2) / gridLines) * i;
      ctx.fillStyle = theme === 'dark' ? '#848e9c' : '#666';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), width - padding.right + 5, y + 3);
    }

    // Draw candles
    visible.forEach((candle, i) => {
      const x = padding.left + i * candleGap + candleGap / 2;
      const isGreen = candle.close >= candle.open;

      ctx.strokeStyle = isGreen ? '#0ecb81' : '#f6465d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, scaleY(candle.high));
      ctx.lineTo(x, scaleY(candle.low));
      ctx.stroke();

      const bodyTop = scaleY(Math.max(candle.open, candle.close));
      const bodyBottom = scaleY(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      ctx.fillStyle = isGreen ? '#0ecb81' : '#f6465d';
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Draw position lines
    localPositions.forEach(pos => {
      const entryY = scaleY(pos.entryPrice);
      ctx.strokeStyle = pos.direction === 'CALL' ? '#0ecb81' : '#f6465d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, entryY);
      ctx.lineTo(width - padding.right, entryY);
      ctx.stroke();

      ctx.fillStyle = pos.direction === 'CALL' ? '#0ecb81' : '#f6465d';
      ctx.fillRect(width - padding.right, entryY - 10, 65, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(pos.entryPrice.toFixed(2), width - padding.right + 5, entryY + 4);

      if (pos.takeProfit) {
        const tpY = scaleY(pos.takeProfit);
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(padding.left, tpY);
        ctx.lineTo(width - padding.right, tpY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#00bcd4';
        ctx.fillRect(padding.left, tpY - 10, 50, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('TP', padding.left + 5, tpY + 4);

        ctx.fillStyle = '#00bcd4';
        ctx.fillRect(width - padding.right, tpY - 10, 65, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(pos.takeProfit.toFixed(2), width - padding.right + 5, tpY + 4);
      }

      if (pos.stopLoss) {
        const slY = scaleY(pos.stopLoss);
        ctx.strokeStyle = '#ff5722';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(padding.left, slY);
        ctx.lineTo(width - padding.right, slY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ff5722';
        ctx.fillRect(padding.left, slY - 10, 50, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('SL', padding.left + 5, slY + 4);

        ctx.fillStyle = '#ff5722';
        ctx.fillRect(width - padding.right, slY - 10, 65, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(pos.stopLoss.toFixed(2), width - padding.right + 5, slY + 4);
      }
    });

    // Draw current price line
    if (currentPrice) {
      const priceY = scaleY(currentPrice);
      ctx.strokeStyle = '#f0b90b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, priceY);
      ctx.lineTo(width - padding.right, priceY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f0b90b';
      ctx.fillRect(width - padding.right, priceY - 10, 65, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(currentPrice.toFixed(2), width - padding.right + 5, priceY + 4);
    }

    // --- Render saved drawings ---
    if (drawings && drawings.length > 0) {
      drawings.forEach(drawing => {
        const isSelected = selectedDrawing === drawing.id;

        switch (drawing.type) {
          case 'trendline': {
            const d = drawing as TrendlineDrawing;
            const start = chartPointToPixel(d.startPoint, params);
            const end = chartPointToPixel(d.endPoint, params);
            if (!start || !end) break;

            ctx.beginPath();
            ctx.strokeStyle = d.color;
            ctx.lineWidth = isSelected ? d.lineWidth + 2 : d.lineWidth;
            if (isSelected) { ctx.shadowColor = d.color; ctx.shadowBlur = 10; }
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            if (isSelected) {
              drawHandle(ctx, start.x, start.y, d.color);
              drawHandle(ctx, end.x, end.y, d.color);
            }
            break;
          }
          case 'horizontal': {
            const d = drawing as HorizontalLineDrawing;
            const hy = scaleY(d.price);

            ctx.beginPath();
            ctx.strokeStyle = d.color;
            ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth;
            ctx.setLineDash([5, 5]);
            if (isSelected) { ctx.shadowColor = d.color; ctx.shadowBlur = 8; }
            ctx.moveTo(padding.left, hy);
            ctx.lineTo(width - padding.right, hy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            if (d.label) {
              ctx.fillStyle = d.color;
              ctx.font = '12px Inter, sans-serif';
              ctx.fillText(d.label, padding.left + 10, hy - 5);
            }

            ctx.fillStyle = d.color;
            ctx.fillRect(width - padding.right, hy - 10, 65, 20);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.price.toFixed(2), width - padding.right + 32, hy + 4);
            ctx.textAlign = 'left';
            break;
          }
          case 'rectangle': {
            const d = drawing as RectangleDrawing;
            const start = chartPointToPixel(d.startPoint, params);
            const end = chartPointToPixel(d.endPoint, params);
            if (!start || !end) break;

            const rx = Math.min(start.x, end.x);
            const ry = Math.min(start.y, end.y);
            const rw = Math.abs(end.x - start.x);
            const rh = Math.abs(end.y - start.y);

            ctx.fillStyle = d.fillColor;
            ctx.globalAlpha = d.fillOpacity;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1;

            ctx.strokeStyle = d.color;
            ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth;
            if (isSelected) { ctx.shadowColor = d.color; ctx.shadowBlur = 8; }
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.shadowBlur = 0;

            if (isSelected) {
              drawHandle(ctx, start.x, start.y, d.color);
              drawHandle(ctx, end.x, end.y, d.color);
              drawHandle(ctx, start.x, end.y, d.color);
              drawHandle(ctx, end.x, start.y, d.color);
            }
            break;
          }
          case 'arrow': {
            const d = drawing as ArrowDrawing;
            const start = chartPointToPixel(d.startPoint, params);
            const end = chartPointToPixel(d.endPoint, params);
            if (!start || !end) break;

            const headSize = d.headSize || 15;
            const angle = Math.atan2(end.y - start.y, end.x - start.x);

            ctx.beginPath();
            ctx.strokeStyle = d.color;
            ctx.fillStyle = d.color;
            ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth;
            if (isSelected) { ctx.shadowColor = d.color; ctx.shadowBlur = 8; }

            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            if (isSelected) {
              drawHandle(ctx, start.x, start.y, d.color);
            }
            break;
          }
          case 'text': {
            const d = drawing as TextDrawing;
            const pos = chartPointToPixel(d.position, params);
            if (!pos) break;

            ctx.font = `${d.fontSize}px Inter, sans-serif`;
            const metrics = ctx.measureText(d.text);
            const pad = 6;

            if (d.backgroundColor) {
              ctx.fillStyle = d.backgroundColor;
              ctx.globalAlpha = 0.8;
              ctx.fillRect(pos.x - pad, pos.y - d.fontSize - pad, metrics.width + pad * 2, d.fontSize + pad * 2);
              ctx.globalAlpha = 1;
            }

            ctx.fillStyle = d.color;
            if (isSelected) { ctx.shadowColor = d.color; ctx.shadowBlur = 5; }
            ctx.fillText(d.text, pos.x, pos.y);
            ctx.shadowBlur = 0;

            if (isSelected) {
              ctx.strokeStyle = d.color;
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(pos.x - pad, pos.y - d.fontSize - pad, metrics.width + pad * 2, d.fontSize + pad * 2);
              ctx.setLineDash([]);
            }
            break;
          }
        }
      });
    }

    // --- Render in-progress drawing preview ---
    const ipd = inProgressRef.current;
    if (ipd) {
      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = drawingLineWidth;

      const sp = ipd.startPixel;
      const cp = ipd.currentPixel;

      switch (drawingMode) {
        case 'trendline':
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(cp.x, cp.y);
          ctx.stroke();
          break;
        case 'rectangle': {
          const rx = Math.min(sp.x, cp.x);
          const ry = Math.min(sp.y, cp.y);
          const rw = Math.abs(cp.x - sp.x);
          const rh = Math.abs(cp.y - sp.y);
          ctx.globalAlpha = 0.2;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1;
          ctx.strokeRect(rx, ry, rw, rh);
          break;
        }
        case 'arrow': {
          const headSize = 15;
          const angle = Math.atan2(cp.y - sp.y, cp.x - sp.x);
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(cp.x, cp.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cp.x, cp.y);
          ctx.lineTo(cp.x - headSize * Math.cos(angle - Math.PI / 6), cp.y - headSize * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(cp.x - headSize * Math.cos(angle + Math.PI / 6), cp.y - headSize * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
          break;
        }
      }

      ctx.restore();
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, dimensions, theme, currentPrice, offset, zoom, localPositions, drawings, selectedDrawing, inProgressDrawing, drawingMode, selectedColor, drawingLineWidth]);

  // Helper: draw selection handle
  const drawHandle = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  // Update cursor
  const getCursor = () => {
    if (isDrawingActive) return 'crosshair';
    if (isDragging) {
      return dragType === 'pan' ? 'grabbing' : 'ns-resize';
    }
    return 'crosshair';
  };

  // Determine hint text
  const hintText = isDrawingActive
    ? 'Click/drag to draw'
    : drawings
      ? 'Select a tool to draw • Scroll to zoom • Drag to pan'
      : 'Scroll to zoom • Drag to pan • Double-click to add TP/SL';

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        background: theme === 'dark' ? '#0b0e11' : '#fff',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: getCursor(),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          color: theme === 'dark' ? '#848e9c' : '#666',
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          pointerEvents: 'none',
        }}
      >
        {symbol} • 1m
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          color: theme === 'dark' ? '#5a6270' : '#999',
          fontSize: '10px',
          fontFamily: 'Inter, sans-serif',
          pointerEvents: 'none',
        }}
      >
        {hintText}
      </div>
    </div>
  );
}

export default memo(TradingViewChart);
